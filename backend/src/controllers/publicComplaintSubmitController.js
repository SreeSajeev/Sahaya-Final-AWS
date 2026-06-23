import { jsonError } from "../utils/http.js";
import { logEvent } from "../utils/structuredLog.js";
import { submitPublicComplaint } from "../services/publicComplaintSubmitService.js";

export async function submitPublicComplaintHandler(req, res) {
  const startedAt = Date.now();
  try {
    const result = await submitPublicComplaint(req, req.body);
    if (!result.ok) {
      const extra = {};
      if (result.details) extra.details = result.details;
      if (result.code) extra.code = result.code;
      if (result.ticket_number) extra.ticket_number = result.ticket_number;
      logEvent("publicComplaint.submit.error", {
        ms: Date.now() - startedAt,
        status: result.status,
        code: result.code ?? "unknown",
      });
      return jsonError(res, result.status, result.message, extra);
    }

    logEvent("publicComplaint.submit.success", {
      ms: Date.now() - startedAt,
      idempotent: Boolean(result.data.idempotent),
      status: result.data.status,
    });

    const payload = { ...result.data };
    const rid = res.req?.requestId;
    if (rid != null) payload.requestId = rid;
    return res.status(result.httpStatus).json(payload);
  } catch (err) {
    logEvent("publicComplaint.submit.error", {
      ms: Date.now() - startedAt,
      message: err?.message || "unknown",
    });
    return jsonError(res, 500, "Failed to submit complaint");
  }
}
