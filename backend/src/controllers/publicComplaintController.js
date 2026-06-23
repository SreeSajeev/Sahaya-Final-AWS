import { jsonError, jsonOk } from "../utils/http.js";
import { logEvent } from "../utils/structuredLog.js";
import {
  parsePatchSessionProfileBody,
  parsePublicTokenParam,
  parseValidateSessionBody,
} from "../services/publicComplaintValidation.js";
import { getPublicComplaintPointContext } from "../services/publicComplaintContextService.js";
import {
  patchPublicSessionProfile,
  validatePublicSession,
} from "../services/publicSessionService.js";

export async function getComplaintPointContextHandler(req, res) {
  const startedAt = Date.now();
  const parsed = parsePublicTokenParam(req.params.publicToken);
  if (!parsed.ok) {
    return jsonError(res, parsed.status, parsed.message);
  }

  try {
    const result = await getPublicComplaintPointContext(parsed.data);
    if (!result.ok) {
      return jsonError(res, result.status, result.message);
    }
    logEvent("publicComplaint.context", {
      ms: Date.now() - startedAt,
      tokenSuffix: parsed.data.slice(-4),
    });
    return jsonOk(res, result.data);
  } catch (err) {
    logEvent("publicComplaint.context.error", { message: err?.message || "unknown" });
    return jsonError(res, 500, "Failed to load complaint point");
  }
}

export async function validateSessionHandler(req, res) {
  const startedAt = Date.now();
  const parsed = parseValidateSessionBody(req.body);
  if (!parsed.ok) {
    return jsonError(res, parsed.status, parsed.message, parsed.details ? { details: parsed.details } : {});
  }

  try {
    const result = await validatePublicSession(parsed.data.verification_token);
    if (!result.ok) {
      return jsonError(res, result.status, result.message);
    }
    logEvent("publicComplaint.sessionValidate", { ms: Date.now() - startedAt });
    return jsonOk(res, result.data);
  } catch (err) {
    logEvent("publicComplaint.sessionValidate.error", { message: err?.message || "unknown" });
    return jsonError(res, 500, "Failed to validate session");
  }
}

export async function patchSessionProfileHandler(req, res) {
  const startedAt = Date.now();
  const parsed = parsePatchSessionProfileBody(req.body);
  if (!parsed.ok) {
    return jsonError(res, parsed.status, parsed.message, parsed.details ? { details: parsed.details } : {});
  }

  try {
    const result = await patchPublicSessionProfile(
      parsed.data.verification_token,
      parsed.data.reporter_name
    );
    if (!result.ok) {
      return jsonError(res, result.status, result.message);
    }
    logEvent("publicComplaint.sessionProfile", { ms: Date.now() - startedAt });
    return jsonOk(res, result.data);
  } catch (err) {
    logEvent("publicComplaint.sessionProfile.error", { message: err?.message || "unknown" });
    return jsonError(res, 500, "Failed to update profile");
  }
}
