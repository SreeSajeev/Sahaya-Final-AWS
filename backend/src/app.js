import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { optionalPostmarkWebhookSecret } from "./middleware/postmarkWebhookAuth.js";
import { requestIdMiddleware } from "./middleware/requestId.js";
import { createRateLimitWithAuditLog } from "./utils/rateLimitWithAuditLog.js";

import {
  findResolutionNotificationByTicketId,
  insertResolutionNotification,
} from "./repositories/ticketResolutionNotificationRepository.js";
import {
  findRawEmailByMessageId,
  insertInboundRawEmail,
} from "./repositories/rawEmailsRepo.js";
import { findUserOrganisationIdByEmail } from "./repositories/userRepository.js";
import { getFieldExecutiveById } from "./repositories/fieldExecutiveRepository.js";
import { getAssignmentByTicketId } from "./repositories/assignmentRepository.js";
import { getTicketByIdUnscopedSingle } from "./repositories/ticketQueryRepository.js";
import { runAutoTicketWorker } from "./workers/autoTicketWorker.js";
import { processProofBackupQueue } from "./workers/proofBackupQueueProcessor.js";
import { runAutoResolutionTokenWorker } from "./workers/autoResolutionTokenWorker.js";
import { runDailyTenantReportWorker } from "./workers/dailyTenantReportWorker.js";
import { evaluateBreaches } from "./services/slaService.js";

import { sendResolutionEmail } from "./services/emailService.js";
import ticketsRouter from "./routes/tickets.js";
import feActionsRouter from "./routes/feActions.js";
import adminUsersRouter from "./routes/adminUsers.js";
import dataApiRouter from "./routes/dataApi.js";
import fePublicRouter from "./routes/fePublic.js";
import authProvisionRouter from "./routes/authProvision.js";
import publicAuthRouter from "./routes/publicAuth.js";
import feMeRouter from "./routes/feMe.js";
import fieldExecutivesRouter from "./routes/fieldExecutives.js";
import complaintPointsRouter from "./routes/complaintPoints.js";
import publicOtpRouter from "./routes/publicOtp.js";
import publicComplaintRouter from "./routes/publicComplaint.js";
import debugAirtelRouter from "./routes/debugAirtel.js";
import { uploadFeProof } from "./controllers/proofController.js";
import { createActionToken } from "./services/tokenService.js";
import { sendFESms, renderAssignmentSms } from "./services/smsService.js";
import { APP_BASE_URL, DISABLE_AUTO_RESOLUTION_WORKER } from "./config/appConfig.js";
import { assertPublicOtpProductionSecurity } from "./config/publicOtpSecurity.js";
import { requireAuth, requireAppUser } from "./middleware/auth.js";
import { requireRole } from "./middleware/requireRole.js";
import {
  attachTenantContext,
  isTenantAllowed,
} from "./middleware/tenantContext.js";
import { hasPublicColumn } from "./services/schemaCompatService.js";
import { z } from "zod";
import { jsonRes, jsonOk, safeDbErrorForClient } from "./utils/http.js";
import { redactEmail } from "./utils/redact.js";
import { requireInternalTrustedIp } from "./middleware/internalAccess.js";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";
import { logJson } from "./utils/jsonLog.js";
import { decodeIfBase64, getEmailText } from "./utils/emailParser.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(requestIdMiddleware);

// Reverse proxies (Render/ALB/etc.) set X-Forwarded-For. express-rate-limit validates this and
// will throw if trust proxy is false. Default to 1 hop in production, allow override via env.
const trustHops = process.env.TRUST_PROXY_HOPS;
if (trustHops !== undefined && trustHops !== "") {
  const n = Number(trustHops);
  if (Number.isFinite(n) && n >= 0) {
    app.set("trust proxy", n);
  }
} else if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

const RATE_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);

const postmarkWebhookLimiter = createRateLimitWithAuditLog("postmark-webhook", {
  windowMs: RATE_WINDOW_MS,
  max: Number(process.env.RATE_LIMIT_POSTMARK_MAX || 1200),
  standardHeaders: true,
  legacyHeaders: false,
});

const feProofLimiter = createRateLimitWithAuditLog("fe-proof", {
  windowMs: RATE_WINDOW_MS,
  max: Number(process.env.RATE_LIMIT_FE_PROOF_MAX || 2000),
  standardHeaders: true,
  legacyHeaders: false,
});

/** Soft ceiling for all routes; stricter limits apply on specific paths. */
const globalApiLimiter = rateLimit({
  windowMs: RATE_WINDOW_MS,
  max: Number(process.env.RATE_LIMIT_GLOBAL_MAX || 5000),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === "/health",
});

function logSecurityStartup() {
  const airtelBaseUrlRaw = String(process.env.AIRTEL_IQ_BASE_URL || "").trim();
  const airtelPathRaw = String(process.env.AIRTEL_IQ_SMS_PATH || "").trim();
  let airtelHost = null;
  try {
    airtelHost = airtelBaseUrlRaw ? new URL(airtelBaseUrlRaw).host : null;
  } catch {
    airtelHost = null;
  }
  logJson("info", "security_startup", {
    requestIdMiddleware: true,
    helmet: true,
    rateLimitWindowMs: RATE_WINDOW_MS,
    rateLimitPostmarkMax: Number(process.env.RATE_LIMIT_POSTMARK_MAX || 1200),
    rateLimitFeProofMax: Number(process.env.RATE_LIMIT_FE_PROOF_MAX || 2000),
    rateLimitGlobalMax: Number(process.env.RATE_LIMIT_GLOBAL_MAX || 5000),
    postmarkWebhookSecretConfigured: Boolean(
      String(process.env.POSTMARK_WEBHOOK_SECRET || "").trim()
    ),
    internalTrustedIpConfigured: Boolean(String(process.env.INTERNAL_TRUSTED_IPS || "").trim()),
    trustProxyHops:
      process.env.TRUST_PROXY_HOPS !== undefined && process.env.TRUST_PROXY_HOPS !== ""
        ? process.env.TRUST_PROXY_HOPS
        : null,
    auditLogMissingAuth: process.env.AUDIT_LOG_MISSING_AUTH ?? "true",
    sms: {
      enabled: String(process.env.SMS_ENABLED ?? "false").trim(),
      testMode: String(process.env.SMS_TEST_MODE ?? "false").trim(),
      provider: "airtel_iq_prepaid",
      airtelBaseUrlHost: airtelHost,
      airtelSmsPath: airtelPathRaw || null,
      hasAirtelUsername: Boolean(String(process.env.AIRTEL_IQ_USERNAME || "").trim()),
      hasAirtelPassword: Boolean(String(process.env.AIRTEL_IQ_PASSWORD || "").trim()),
      hasCustomerId: Boolean(String(process.env.AIRTEL_IQ_CUSTOMER_ID || "").trim()),
      hasSourceAddress: Boolean(String(process.env.AIRTEL_IQ_SOURCE_ADDRESS || "").trim()),
      hasEntityId: Boolean(String(process.env.AIRTEL_IQ_ENTITY_ID || "").trim()),
      hasDltTemplateId: Boolean(String(process.env.AIRTEL_IQ_DLT_TEMPLATE_ID || "").trim()),
      messageType: String(process.env.AIRTEL_IQ_MESSAGE_TYPE || "SERVICE_IMPLICIT").trim(),
      msisdnPrefixRaw:
        process.env.AIRTEL_IQ_MSISDN_PREFIX === undefined || process.env.AIRTEL_IQ_MSISDN_PREFIX === null
          ? null
          : String(process.env.AIRTEL_IQ_MSISDN_PREFIX).trim(),
      msisdnPrefixEffective:
        process.env.AIRTEL_IQ_MSISDN_PREFIX === undefined || process.env.AIRTEL_IQ_MSISDN_PREFIX === null
          ? "91"
          : String(process.env.AIRTEL_IQ_MSISDN_PREFIX).trim(),
      smsAssignmentFirstOnly: String(process.env.SMS_ASSIGNMENT_FIRST_ONLY ?? "false").trim(),
    },
    middlewareOrder:
      "requestId → trustProxy → cors → helmet → globalRateLimit → bodyParser → routes → notFound → errorHandler",
  });
}

async function resolveInboundOrganisationId(toEmail) {
  if (!toEmail) return null;
  try {
    const hasRawEmailsOrg = await hasPublicColumn("raw_emails", "organisation_id");
    const hasUsersOrg = await hasPublicColumn("users", "organisation_id");
    if (!hasRawEmailsOrg || !hasUsersOrg) return null;

    const { data: userRow } = await findUserOrganisationIdByEmail(toEmail);
    return userRow?.organisation_id ?? null;
  } catch (err) {
    console.warn("[POSTMARK] org resolution skipped", err?.message || err);
    return null;
  }
}

/* ======================================================
   GLOBAL MIDDLEWARE
====================================================== */

// CORS: allow frontend app origin (APP_BASE_URL) + dev origins
const corsOrigins = [
  APP_BASE_URL,
  "https://opsxbypariskq.vercel.app",
  "http://localhost:3000",
  "http://localhost:8080",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:5173",
  "https://sahaya.pariskq.in",
].filter((o, i, a) => a.indexOf(o) === i);

const corsOptions = {
  origin: corsOrigins,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Postmark-Webhook-Secret",
    "X-Webhook-Secret",
    "X-Request-Id",
    "X-Correlation-Id",
    "X-Internal-Secret",
  ],
  exposedHeaders: ["X-Request-Id"],
  credentials: true,
};

// Always answer preflight requests with the correct CORS headers.
// Express v5 uses path-to-regexp v6 where "*" is not a valid path pattern.
// Use a regex to match all paths for preflight handling.
app.options(/.*/, cors(corsOptions));

app.use(cors(corsOptions));

// Minimal hardening; CSP disabled for JSON API (avoid breaking unknown clients).
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// Global rate limit before body parsing (cheap rejection of abusive traffic).
app.use(globalApiLimiter);

// Body parsing
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true }));

// Temporary Airtel egress / SMS diagnostics (X-Internal-Secret)
app.use(debugAirtelRouter);

/* ======================================================
   ROUTES
====================================================== */

// Tickets
app.use("/tickets", ticketsRouter);

// Additive data APIs for frontend migration (Supabase DB -> backend)
app.use("/data", dataApiRouter);

// Public magic-link proof upload — MUST be registered BEFORE any app.use("/fe", ...) so POST /fe/proof
// never enters a router that runs requireAuth (feMeRouter). Order is security-critical.
app.post("/fe/proof", feProofLimiter, uploadFeProof);

// Public FE context APIs (no JWT required)
app.use("/fe", fePublicRouter);

// FE authenticated APIs (remove frontend direct DB writes)
app.use("/fe", feMeRouter);

// Public auth helpers (no JWT) — login/signup org list
app.use("/auth/public", publicAuthRouter);

// Auth provisioning APIs (remove browser-side users inserts)
app.use("/auth", authProvisionRouter);

// Field Executives (write APIs for frontend migration)
app.use("/field-executives", fieldExecutivesRouter);

// Tenant complaint points (public QR intake — admin APIs only; gated by PUBLIC_COMPLAINTS_ENABLED)
app.use("/complaint-points", complaintPointsRouter);

// Public complaint intake (OTP + context/session; no Sahaya auth; gated by PUBLIC_COMPLAINTS_ENABLED)
app.use("/public", publicOtpRouter);
app.use("/public", publicComplaintRouter);

// Admin: user status (activation/deactivation)
app.use("/admin/users", adminUsersRouter);

// Admin: test FE SMS (generate token + send SMS without full assignment)
app.post(
  "/admin/test-fe-sms",
  requireAuth,
  attachTenantContext({ requireAuthenticated: false }),
  requireAppUser,
  requireRole(["SUPER_ADMIN", "ADMIN"]),
  async (req, res) => {
  try {
    const parsed = z
      .object({ fe_id: z.string().uuid(), ticket_id: z.string().uuid() })
      .safeParse(req.body ?? {});
    if (!parsed.success) {
      return jsonRes(res, 400, { error: "fe_id and ticket_id (UUIDs) required" });
    }
    const { fe_id: feId, ticket_id: ticketId } = parsed.data;
    const { data: fe, error: feError } = await getFieldExecutiveById(feId, "name, phone");
    if (feError || !fe) {
      return jsonRes(res, 404, { error: "Field executive not found" });
    }
    if (!fe.phone || !String(fe.phone).trim()) {
      return jsonRes(res, 400, { error: "FE has no phone number" });
    }
    const { data: ticket, error: ticketError } = await getTicketByIdUnscopedSingle(
      ticketId,
      "ticket_number, vehicle_number, location, organisation_id"
    );
    if (!isTenantAllowed(req, ticket?.organisation_id)) {
      return jsonRes(res, 403, { error: "Forbidden" });
    }
    console.log("[TENANT_GUARD] admin_test_fe_sms", {
      ticketId,
      tenantId: req.tenantId || null,
      ticketOrgId: ticket?.organisation_id || null,
      isSuperAdmin: Boolean(req.isSuperAdmin),
    });

    if (ticketError || !ticket) {
      return jsonRes(res, 404, { error: "Ticket not found" });
    }
    // Airtel IQ DLT: use the registered assignment template (ticket number substitution only).
    const smsMessage = renderAssignmentSms({ ticketNumber: ticket.ticket_number ?? "" });
    const sent = await sendFESms({ phoneNumber: fe.phone, message: smsMessage });
    return jsonOk(res, {
      success: sent,
      message: sent ? "SMS sent" : "SMS send failed (check logs)",
      fe_name: fe.name,
      ticket_number: ticket.ticket_number,
      sms_body: smsMessage,
    });
  } catch (err) {
    console.error("[admin/test-fe-sms]", err?.message || err);
    return jsonRes(res, 500, { error: safeDbErrorForClient(err, "Server error") });
  }
});

// Admin: test RESOLUTION SMS (use current assignment + resolution token)
app.post(
  "/admin/test-resolution-sms",
  requireAuth,
  attachTenantContext({ requireAuthenticated: false }),
  requireAppUser,
  requireRole(["SUPER_ADMIN", "ADMIN"]),
  async (req, res) => {
  try {
    const parsed = z.object({ ticket_id: z.string().uuid() }).safeParse(req.body ?? {});
    if (!parsed.success) {
      return jsonRes(res, 400, { error: "ticket_id (UUID) required" });
    }
    const { ticket_id: ticketId } = parsed.data;

    const { data: ticket, error: ticketError } = await getTicketByIdUnscopedSingle(
      ticketId,
      "ticket_number, vehicle_number, location, organisation_id"
    );
    if (!isTenantAllowed(req, ticket?.organisation_id)) {
      return jsonRes(res, 403, { error: "Forbidden" });
    }
    console.log("[TENANT_GUARD] admin_test_resolution_sms", {
      ticketId,
      tenantId: req.tenantId || null,
      ticketOrgId: ticket?.organisation_id || null,
      isSuperAdmin: Boolean(req.isSuperAdmin),
    });

    if (ticketError || !ticket) {
      return jsonRes(res, 404, { error: "Ticket not found" });
    }

    const { data: assignment, error: assignmentError } = await getAssignmentByTicketId(ticketId, "fe_id");
    if (assignmentError || !assignment) {
      return jsonRes(res, 400, { error: "FE not assigned" });
    }

    const { data: fe, error: feError } = await getFieldExecutiveById(assignment.fe_id, "name, phone");
    if (feError || !fe) {
      return jsonRes(res, 404, { error: "Field executive not found" });
    }
    if (!fe.phone || !String(fe.phone).trim()) {
      return jsonRes(res, 400, { error: "FE has no phone number" });
    }

    const token = await createActionToken({
      ticketId,
      feId: assignment.fe_id,
      actionType: "RESOLUTION",
    });

    const resolutionUrl = buildFEActionURL(token);
    const location = ticket.location ? String(ticket.location).slice(0, 25) : "N/A";
    const smsMessage = `TKT:${ticket.ticket_number ?? "N/A"}
Veh:${ticket.vehicle_number ?? "N/A"}
Loc:${location}
Action:${resolutionUrl}
-Pariskq`;

    logJson("info", "admin_test_resolution_sms_dispatch", {
      requestId: req.requestId,
      ticketId,
      phoneSuffix: String(fe.phone).replace(/\D/g, "").slice(-4),
    });
    const sent = await sendFESms({ phoneNumber: fe.phone, message: smsMessage });

    return jsonOk(res, {
      success: sent,
      message: sent ? "SMS sent" : "SMS send failed (check logs)",
      fe_name: fe.name,
      ticket_number: ticket.ticket_number,
      resolution_url: resolutionUrl,
    });
  } catch (err) {
    console.error("[admin/test-resolution-sms]", err?.message || err);
    return jsonRes(res, 500, { error: safeDbErrorForClient(err, "Server error") });
  }
});

// FE token validation routes
app.use(feActionsRouter);

/* ======================================================
   HEALTH CHECK
====================================================== */

app.get("/health", (req, res) => {
  return jsonRes(res, 200, {
    status: "ok",
    /** Bump when audit log list query execution changes (verify EC2 image after deploy). */
    auditLogsListFix: 2,
  });
});

/* ======================================================
   INTERNAL: TICKET RESOLVED HOOK
====================================================== */

app.post(
  "/internal/ticket-resolved",
  requireInternalTrustedIp,
  async (req, res) => {
  try {
    const secret = req.headers["x-internal-secret"];

    if (secret !== process.env.INTERNAL_TRIGGER_SECRET) {
      return jsonRes(res, 401, { error: "unauthorized" });
    }

    const bodyParsed = z.object({ ticket_id: z.string().uuid() }).safeParse(req.body ?? {});
    if (!bodyParsed.success) {
      return jsonRes(res, 400, { error: "ticket_id (UUID) required" });
    }
    const { ticket_id } = bodyParsed.data;

    const { data: ticket, error } = await getTicketByIdUnscopedSingle(
      ticket_id,
      "id, ticket_number, status, opened_by_email, organisation_id"
    );
    logJson("info", "internal_ticket_resolved", {
      requestId: req.requestId,
      ticketId: ticket?.id || ticket_id,
      ticketOrgId: ticket?.organisation_id || null,
      hasRecipient: Boolean(ticket?.opened_by_email),
      recipientEmailRedacted: ticket?.opened_by_email ? redactEmail(ticket.opened_by_email) : null,
    });

    if (error || !ticket) {
      return jsonRes(res, 200, { ignored: "ticket not found" });
    }

    if (ticket.status !== "RESOLVED") {
      return jsonRes(res, 200, { ignored: "status not resolved" });
    }

    if (!ticket.opened_by_email) {
      return jsonRes(res, 200, { ignored: "no opened_by_email" });
    }

    const { data: alreadySent } = await findResolutionNotificationByTicketId(ticket.id);

    if (alreadySent) {
      return jsonRes(res, 200, { ignored: "email already sent" });
    }

    logJson("info", "email_trigger_ticket_resolved_hook", {
      requestId: req.requestId,
      ticketId: ticket.id,
      ticketNumber: ticket.ticket_number ?? null,
      toEmailRedacted: redactEmail(ticket.opened_by_email),
    });
    try {
      const emailResult = await sendResolutionEmail({
        toEmail: ticket.opened_by_email,
        ticketNumber: ticket.ticket_number,
      });
      logJson("info", "internal_ticket_resolved_email_result", {
        requestId: req.requestId,
        ticketId: ticket.id,
        attempted: emailResult?.attempted,
        sent: emailResult?.sent,
        skipped: emailResult?.skipped,
        reason: emailResult?.reason ?? null,
      });
    } catch (e) {
      console.error("[ticket-resolved-hook] Resolution email failed:", e?.message || e);
    }

    await insertResolutionNotification(ticket.id);

    return jsonRes(res, 200, { sent: true });
  } catch (err) {
    console.error("[ticket-resolved-hook]", err?.message || err);
    return jsonRes(res, 500, { error: "internal error" });
  }
});

/* ======================================================
   POSTMARK INBOUND WEBHOOK
====================================================== */

app.post(
  "/postmark-webhook",
  postmarkWebhookLimiter,
  optionalPostmarkWebhookSecret,
  async (req, res) => {
  try {
    const email = req.body;
    const webhookSecretConfigured = Boolean(
      String(process.env.POSTMARK_WEBHOOK_SECRET || "").trim()
    );

    if (!webhookSecretConfigured) {
      const ct = String(req.headers["content-type"] || "");
      if (ct.length > 0 && !ct.toLowerCase().includes("json")) {
        console.warn("[WEBHOOK_AUDIT] unexpected_content_type", {
          requestId: req.requestId,
          contentType: ct,
        });
      }
    }

    if (!email || !email.MessageID) {
      if (!webhookSecretConfigured) {
        console.warn("[WEBHOOK_AUDIT] invalid_payload", {
          requestId: req.requestId,
          reason: "missing_message_id",
        });
      }
      return jsonRes(res, 400, { error: "Invalid payload" });
    }

    const fromEmail = email.FromFull?.Email || email.From || null;
    const toEmail = email.ToFull?.Email || email.To || null;
    console.log("[POSTMARK] webhook received", {
      requestId: req.requestId,
      MessageID: email.MessageID,
      from_email: redactEmail(fromEmail),
      to_email: redactEmail(toEmail),
    });

    const insertPayload = {
      message_id: email.MessageID,
      thread_id: email.ThreadID || null,
      from_email: fromEmail,
      to_email: toEmail,
      subject: email.Subject || null,
      received_at: email.ReceivedAt || new Date().toISOString(),
      payload: email,
      processing_status: "PENDING",
      created_at: new Date().toISOString(),
    };

    // Persist raw text/html in first-class columns when available.
    // This makes UI rendering trivial and ensures content is preserved even if parsing changes.
    try {
      const hasRawText = await hasPublicColumn("raw_emails", "raw_text");
      const hasRawHtml = await hasPublicColumn("raw_emails", "raw_html");
      if (hasRawText) {
        const rawText = getEmailText({ payload: email, subject: email.Subject || "" });
        insertPayload.raw_text = rawText || null;
      }
      if (hasRawHtml) {
        const htmlBody = decodeIfBase64(email.HtmlBody || email.htmlBody || "");
        insertPayload.raw_html = htmlBody && String(htmlBody).trim() !== "" ? String(htmlBody) : null;
      }
    } catch (e) {
      console.warn("[POSTMARK] raw_text/html capture skipped", e?.message || e);
    }
    const resolvedOrgId = await resolveInboundOrganisationId(toEmail);
    if (resolvedOrgId) {
      insertPayload.organisation_id = resolvedOrgId;
    }
    console.log("[TENANT_GUARD] postmark_inbound_tenant_resolution", {
      to_email: redactEmail(toEmail),
      organisation_id: resolvedOrgId,
      tenant_bound: Boolean(resolvedOrgId),
    });

    const messageId = String(email.MessageID).trim();
    const { data: existingByMessageId } = await findRawEmailByMessageId(messageId);

    if (existingByMessageId?.id) {
      console.log("[POSTMARK] Duplicate MessageID — idempotent accept", {
        requestId: req.requestId,
        messageId,
        existingId: existingByMessageId.id,
      });
      return res.status(200).send("Email received");
    }

    const { data, error } = await insertInboundRawEmail(insertPayload);

    if (error) {
      if (error.code === "23505") {
        console.log("[POSTMARK] Duplicate MessageID (unique) — idempotent accept", {
          requestId: req.requestId,
          messageId,
        });
        return res.status(200).send("Email received");
      }
      console.error("[POSTMARK] Insert failed", error.code, error.message);
      return jsonRes(res, 500, { error: "Failed to store email" });
    }

    console.log("[POSTMARK] Insert ok", { requestId: req.requestId, id: data?.id });
    return res.status(200).send("Email received");
  } catch (err) {
    console.error("[POSTMARK] Exception", err);
    return jsonRes(res, 500, { error: "Internal server error" });
  }
});

/* ======================================================
   ERROR HANDLING (must be after all routes)
====================================================== */

app.use(notFoundHandler);
app.use(errorHandler);

/* ======================================================
   WORKER BOOTSTRAP
====================================================== */

async function startWorkerLoop() {
  console.log("⚡ Running auto ticket worker on startup");

  try {
    await runAutoTicketWorker();
  } catch (err) {
    console.error("[WORKER] Startup run failed", err);
  }
  try {
    await processProofBackupQueue();
  } catch (err) {
    console.error("[WORKER] Proof backup queue startup failed", err);
  }

  try {
    console.log("⚡ Running auto resolution token worker on startup");
    await runAutoResolutionTokenWorker();
  } catch (err) {
    console.error("[WORKER] Auto resolution token worker startup failed", err);
  }

  setInterval(async () => {
    try {
      await runAutoTicketWorker();
    } catch (err) {
      console.error("[WORKER] Interval run failed", err);
    }
    try {
      await processProofBackupQueue();
    } catch (err) {
      console.error("[WORKER] Proof backup queue interval failed", err);
    }
  }, 60_000);
}

function startAutoResolutionTokenWorker() {
  if (DISABLE_AUTO_RESOLUTION_WORKER) {
    console.log("⚠️ Auto resolution token worker disabled by flag");
    return;
  }
  // Run frequently but with a small batch size inside the worker.
  setInterval(() => {
    runAutoResolutionTokenWorker().catch((err) =>
      console.error("[WORKER] Auto resolution token interval failed", err)
    );
  }, 30_000);
}

function startSlaBreachEvaluator() {
  console.log("⚡ SLA breach evaluator starting (every 60s)");
  evaluateBreaches().catch((err) => console.error("[SLA] evaluateBreaches startup failed", err));
  setInterval(() => {
    evaluateBreaches().catch((err) => console.error("[SLA] evaluateBreaches interval failed", err));
  }, 60_000);
}

function startDailyTenantReportWorker() {
  const enabled =
    String(process.env.DAILY_TENANT_REPORT_ENABLED || "false").toLowerCase() === "true";
  if (!enabled) {
    console.log("ℹ️ Daily tenant report worker disabled (DAILY_TENANT_REPORT_ENABLED=false)");
    return;
  }
  const intervalMs = Number(process.env.DAILY_REPORT_CHECK_INTERVAL_MS) || 300_000;
  console.log(`⚡ Daily tenant report worker starting (every ${intervalMs}ms)`);
  runDailyTenantReportWorker().catch((err) =>
    console.error("[DAILY_REPORT] startup run failed", err)
  );
  setInterval(() => {
    runDailyTenantReportWorker().catch((err) =>
      console.error("[DAILY_REPORT] interval failed", err)
    );
  }, intervalMs);
}

/* ======================================================
   SERVER START + PROCESS_ROLE (Docker / EC2 split)
======================================================
 * PROCESS_ROLE (default "all" — backward compatible with Render / single process):
 * - "all": HTTP + all background intervals (legacy single-container)
 * - "api": HTTP only — run workers in a separate container with PROCESS_ROLE=worker
 * - "worker": background jobs only — no HTTP listener (singleton replica recommended)
 */
const PROCESS_ROLE = String(process.env.PROCESS_ROLE || "all").trim().toLowerCase();

assertPublicOtpProductionSecurity();

function startAllBackgroundJobs() {
  startWorkerLoop();
  startSlaBreachEvaluator();
  startAutoResolutionTokenWorker();
  startDailyTenantReportWorker();
}

if (PROCESS_ROLE === "worker") {
  console.log("⚙️ PROCESS_ROLE=worker — HTTP server disabled; background workers only");
  logSecurityStartup();
  if (process.env.NODE_ENV === "development" && process.env.SUPABASE_URL) {
    try {
      console.log("SUPABASE_URL host:", new URL(process.env.SUPABASE_URL).host);
    } catch {
      /* ignore */
    }
  }
  startAllBackgroundJobs();
} else {
  const roleForLog = ["all", "api"].includes(PROCESS_ROLE) ? PROCESS_ROLE : "all";
  if (PROCESS_ROLE !== "all" && PROCESS_ROLE !== "api") {
    console.warn(`[PROCESS_ROLE] unknown value "${PROCESS_ROLE}", behaving as "all"`);
  }

  app.listen(PORT, () => {
    console.log(`🚀 Backend running on port ${PORT} (PROCESS_ROLE=${roleForLog})`);
    logSecurityStartup();
    if (process.env.NODE_ENV === "development" && process.env.SUPABASE_URL) {
      try {
        console.log("SUPABASE_URL host:", new URL(process.env.SUPABASE_URL).host);
      } catch {
        /* ignore */
      }
    }
    if (roleForLog === "all") {
      startAllBackgroundJobs();
    } else {
      console.log(
        "⚙️ API-only mode (PROCESS_ROLE=api): auto ticket, proof backup, SLA, resolution-token workers run elsewhere"
      );
    }
  });
}
