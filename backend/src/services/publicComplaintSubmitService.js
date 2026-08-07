import { TENANT_CLIENTS_ENABLED } from "../config/appConfig.js";
import { parseVerificationToken } from "./otp/otpCrypto.js";
import { hasRequiredFieldsForOpen } from "./ticketService.js";
import { generateTicketNumberForCreation } from "../utils/ticketNumber.js";
import { createSlaRow } from "./slaService.js";
import { normalizeClientSlug } from "./tenantClientService.js";
import {
  parseSubmitPublicComplaintBody,
  resolveEffectiveCategoryAndIssue,
} from "./publicComplaintSubmitValidation.js";
import { normalizeLocation } from "../utils/normalizeLocation.js";
import { findOtpSessionById } from "../repositories/publicOtpSessionRepository.js";
import { findComplaintPointByIdSelect } from "../repositories/tenantComplaintPointRepository.js";
import { listTenantClientsQuery } from "../repositories/tenantClientRepository.js";
import { submitPublicComplaintTransaction } from "../repositories/publicComplaintSubmitRepository.js";

const SHORT_DESCRIPTION_MAX_LEN = 200;
const PENDING_REPORTER_NAME = "Pending";

const SESSION_SELECT =
  "id, complaint_point_id, organisation_id, reporter_mobile, reporter_name, status, verified_at, ticket_id";

/**
 * @param {string} organisationId
 * @param {string | null | undefined} defaultClientSlug
 */
async function resolveClientSlugForPublicSubmit(organisationId, defaultClientSlug) {
  const normalized = normalizeClientSlug(defaultClientSlug);
  if (!normalized) return null;
  if (!TENANT_CLIENTS_ENABLED) return normalized;

  const { data, error } = await listTenantClientsQuery({
    isSuperAdmin: true,
    tenantId: null,
    organisationIdFilter: organisationId,
    statusFilter: "active",
    activeOnly: false,
  });

  if (error) {
    console.warn("[public-submit] tenant_clients lookup failed:", error.message);
    return null;
  }

  const allowed = new Set();
  for (const row of data ?? []) {
    const key = normalizeClientSlug(row.slug);
    if (key) allowed.add(key);
  }
  return allowed.has(normalized) ? normalized : null;
}

/**
 * @param {{ ok: false, reason: string }} parsed
 */
function mapTokenError(parsed) {
  if (parsed.reason === "expired") {
    return { ok: false, status: 410, message: "Verification session has expired", code: "SESSION_EXPIRED" };
  }
  return { ok: false, status: 401, message: "Invalid verification session", code: "SESSION_INVALID" };
}

/**
 * @param {string} code
 */
function mapRpcCodeToHttp(code) {
  switch (code) {
    case "COMPLAINT_ID_EXISTS":
      return { status: 409, message: "A ticket with this complaint ID already exists", code: "COMPLAINT_ID_EXISTS" };
    case "COMPLAINT_POINT_INACTIVE":
      return { status: 404, message: "This link is not available", code: "COMPLAINT_POINT_INACTIVE" };
    case "SESSION_NOT_FOUND":
    case "SESSION_INVALID":
    case "SESSION_BINDING_MISMATCH":
      return { status: 410, message: "Verification session is no longer valid", code: "SESSION_EXPIRED" };
    case "INVALID_PAYLOAD":
      return { status: 400, message: "Invalid request body", code: "INVALID_PAYLOAD" };
    default:
      return { status: 500, message: "Failed to submit complaint", code: "SUBMIT_FAILED" };
  }
}

/**
 * @param {import('express').Request} req
 * @param {unknown} body
 */
export async function submitPublicComplaint(req, body) {
  const parsedBody = parseSubmitPublicComplaintBody(body);
  if (!parsedBody.ok) {
    return {
      ok: false,
      status: parsedBody.status,
      message: parsedBody.message,
      details: parsedBody.details,
    };
  }

  const form = parsedBody.data;
  const tokenParsed = parseVerificationToken(form.verification_token);
  if (!tokenParsed.ok) {
    return mapTokenError(tokenParsed);
  }

  const { sid, oid, cpid, m } = tokenParsed.payload;

  if (
    String(form.reporter_name).trim().toLowerCase() === PENDING_REPORTER_NAME.toLowerCase()
  ) {
    return { ok: false, status: 400, message: "Reporter name is required", code: "INVALID_PROFILE" };
  }

  const { data: session, error: sessionErr } = await findOtpSessionById(sid, SESSION_SELECT);

  if (sessionErr) {
    return { ok: false, status: 500, message: "Failed to load verification session" };
  }
  if (!session) {
    return { ok: false, status: 410, message: "Verification session is no longer valid", code: "SESSION_EXPIRED" };
  }

  if (session.organisation_id !== oid || session.complaint_point_id !== cpid) {
    return { ok: false, status: 401, message: "Invalid verification session", code: "SESSION_INVALID" };
  }
  if (session.reporter_mobile !== m) {
    return { ok: false, status: 401, message: "Invalid verification session", code: "SESSION_INVALID" };
  }

  if (session.status === "locked") {
    return { ok: false, status: 423, message: "Verification session is locked", code: "SESSION_LOCKED" };
  }
  if (session.status === "expired") {
    return { ok: false, status: 410, message: "Verification session has expired", code: "SESSION_EXPIRED" };
  }
  if (session.status === "pending") {
    return { ok: false, status: 401, message: "OTP verification required", code: "SESSION_INVALID" };
  }

  const { data: point, error: pointErr } = await findComplaintPointByIdSelect(
    cpid,
    "id, status, default_client_slug"
  );

  if (pointErr) {
    return { ok: false, status: 500, message: "Failed to load complaint point" };
  }
  if (!point || point.status !== "active") {
    return { ok: false, status: 404, message: "This link is not available", code: "COMPLAINT_POINT_INACTIVE" };
  }

  const { category, issue_type } = resolveEffectiveCategoryAndIssue(form);
  const description = form.description.trim();
  const shortDescription = description.slice(0, SHORT_DESCRIPTION_MAX_LEN);
  const vehicleNumber = form.vehicle_number.trim() || null;
  const location = normalizeLocation(form.location);
  const complaintId = form.complaint_id.trim() || null;

  const status = hasRequiredFieldsForOpen({
    vehicle_number: vehicleNumber,
    location,
    issue_type,
    short_description: shortDescription,
  })
    ? "OPEN"
    : "NEEDS_REVIEW";

  const clientSlug = await resolveClientSlugForPublicSubmit(oid, point.default_client_slug);

  const { loadSlaSnapshotForOrg } = await import("./tenantSlaService.js");
  const slaSnapshot = await loadSlaSnapshotForOrg(oid);

  const rpcBase = {
    otp_session_id: session.id,
    organisation_id: oid,
    complaint_point_id: cpid,
    reporter_name: form.reporter_name.trim(),
    complaint_id: complaintId,
    vehicle_number: vehicleNumber,
    category,
    issue_type,
    location,
    short_description: shortDescription,
    client_slug: clientSlug,
    status,
    needs_review: status === "NEEDS_REVIEW",
    confidence_score: 100,
    priority: false,
    priority_level: "LOW",
    response_sla_minutes: slaSnapshot.response_sla_minutes,
    resolution_sla_minutes: slaSnapshot.resolution_sla_minutes,
    response_due_at: slaSnapshot.response_due_at,
    resolution_due_at: slaSnapshot.resolution_due_at,
  };

  let ticketNumber;
  try {
    ticketNumber = await generateTicketNumberForCreation("PUBLIC_QR");
  } catch (allocErr) {
    console.error("[public-submit] ticket number allocation failed:", allocErr?.message || allocErr);
    return { ok: false, status: 500, message: "Failed to submit complaint" };
  }

  const result = await submitPublicComplaintTransaction({
    ...rpcBase,
    ticket_number: ticketNumber,
  });

  if (!result) {
    return { ok: false, status: 500, message: "Failed to submit complaint" };
  }

  if (result.ok === false) {
    const mapped = mapRpcCodeToHttp(String(result.code || ""));
    if (result.code === "COMPLAINT_ID_EXISTS") {
      return {
        ok: false,
        status: mapped.status,
        message: mapped.message,
        code: mapped.code,
        ticket_number: result.ticket_number ?? null,
      };
    }
    return {
      ok: false,
      status: mapped.status,
      message: mapped.message,
      code: mapped.code,
    };
  }

  if (result.ok === true && result.ticket_id && result.idempotent !== true) {
    void createSlaRow(result.ticket_id).catch((err) => {
      console.error("[SLA] createSlaRow after public submit", result.ticket_id, err.message);
    });
  }

  return {
    ok: true,
    httpStatus: result.idempotent === true ? 200 : 201,
    data: {
      success: true,
      ticket_number: result.ticket_number,
      status: result.status,
      otp_session_id: result.otp_session_id,
      idempotent: Boolean(result.idempotent),
    },
  };
}
