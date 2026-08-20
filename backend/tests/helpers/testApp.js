import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import ticketsRouter from "../../src/routes/tickets.js";
import feActionsRouter from "../../src/routes/feActions.js";
import adminUsersRouter from "../../src/routes/adminUsers.js";
import dataApiRouter from "../../src/routes/dataApi.js";
import fePublicRouter from "../../src/routes/fePublic.js";
import authProvisionRouter from "../../src/routes/authProvision.js";
import publicAuthRouter from "../../src/routes/publicAuth.js";
import feMeRouter from "../../src/routes/feMe.js";
import smMeRouter from "../../src/routes/smMe.js";
import fieldExecutivesRouter from "../../src/routes/fieldExecutives.js";
import complaintPointsRouter from "../../src/routes/complaintPoints.js";
import publicOtpRouter from "../../src/routes/publicOtp.js";
import publicComplaintRouter from "../../src/routes/publicComplaint.js";
import resolutionLocationsRouter from "../../src/routes/resolutionLocations.js";
import platformRouter from "../../src/platform/api/index.js";
import { exclusiveLegacyTicketGate } from "../../src/platform/runtime/exclusiveRuntimeGate.js";
import { uploadFeProof } from "../../src/controllers/proofController.js";
import { notFoundHandler, errorHandler } from "../../src/middleware/errorHandler.js";
import { requestIdMiddleware } from "../../src/middleware/requestId.js";
import { optionalPostmarkWebhookSecret } from "../../src/middleware/postmarkWebhookAuth.js";
import { insertInboundRawEmail } from "../../src/repositories/rawEmailsRepo.js";
import { jsonRes } from "../../src/utils/http.js";
import { decodeIfBase64, getEmailText } from "../../src/utils/emailParser.js";

/**
 * Lightweight Express app for Supertest — mirrors production route mounts without starting workers.
 */
export function buildTestApp() {
  const app = express();
  app.use(requestIdMiddleware);
  app.use(cors({ origin: true, credentials: true }));
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(
    rateLimit({
      windowMs: 60_000,
      max: 10_000,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => req.path === "/health",
    })
  );
  app.use(bodyParser.json({ limit: "10mb" }));
  app.use(bodyParser.urlencoded({ extended: true }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, env: "test" });
  });

  app.use("/tickets", exclusiveLegacyTicketGate("all"), ticketsRouter);
  app.use("/data", exclusiveLegacyTicketGate("ticketPaths"), dataApiRouter);
  app.use("/data/resolution-locations", resolutionLocationsRouter);
  app.use("/platform", platformRouter);
  app.post("/fe/proof", uploadFeProof);
  app.use("/fe", fePublicRouter);
  app.use("/fe", exclusiveLegacyTicketGate("feMe"), feMeRouter);
  app.use("/sm", exclusiveLegacyTicketGate("sm"), smMeRouter);
  app.use("/auth/public", publicAuthRouter);
  app.use("/auth", authProvisionRouter);
  app.use("/field-executives", fieldExecutivesRouter);
  app.use("/complaint-points", complaintPointsRouter);
  app.use("/public", publicOtpRouter);
  app.use("/public", publicComplaintRouter);
  app.use("/admin/users", adminUsersRouter);
  app.use(feActionsRouter);

  app.post("/postmark-webhook", optionalPostmarkWebhookSecret, async (req, res) => {
    try {
      const messageId = req.body?.MessageID || req.body?.MessageId;
      if (!messageId) return jsonRes(res, 400, { error: "Missing MessageID" });
      const textBody = getEmailText(req.body);
      const insertPayload = {
        message_id: String(messageId),
        from_email: String(req.body.From || "test@example.com"),
        to_email: String(req.body.To || "inbound@test.sahaya.local"),
        subject: req.body.Subject ? String(req.body.Subject) : null,
        received_at: new Date().toISOString(),
        payload: req.body,
        raw_text: textBody,
        raw_html: decodeIfBase64(req.body.HtmlBody) || null,
        processing_status: "pending",
      };
      const { error } = await insertInboundRawEmail(insertPayload);
      if (error?.code === "23505") return res.status(200).send("Email received");
      if (error) return jsonRes(res, 500, { error: "Failed to store email" });
      return res.status(200).send("Email received");
    } catch (err) {
      return jsonRes(res, 500, { error: err?.message || "Internal server error" });
    }
  });

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
