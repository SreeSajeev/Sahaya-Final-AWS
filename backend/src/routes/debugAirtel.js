/**
 * Temporary Airtel egress / SMS debug routes (INTERNAL_TRIGGER_SECRET via X-Internal-Secret).
 * Remove when Airtel connectivity from hosting is stable.
 */

import express from "express";
import axios from "axios";
import dns from "node:dns";
import https from "node:https";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import { jsonRes, jsonOk } from "../utils/http.js";
import { logEvent } from "../utils/structuredLog.js";
import {
  airtelHttpsAgent,
  airtelIpv4Lookup,
  buildAirtelAxiosOptions,
  collectAirtelSendParts,
  sanitizePhoneForSms,
} from "../services/smsService.js";

const router = express.Router();

function truthyEnv(name, fallback = "") {
  const v = process.env[name];
  const s = v != null ? String(v).trim() : "";
  return s !== "" ? s : String(fallback);
}

function requireInternalTriggerSecret(req, res, next) {
  const configured = String(process.env.INTERNAL_TRIGGER_SECRET || "").trim();
  if (!configured) {
    logEvent("debug_airtel_auth", { ok: false, reason: "INTERNAL_TRIGGER_SECRET_unset" });
    return jsonRes(res, 503, { error: "debug routes disabled (INTERNAL_TRIGGER_SECRET unset)" });
  }
  const secret = req.headers["x-internal-secret"];
  if (secret !== configured) {
    logEvent("debug_airtel_auth", { ok: false, reason: "bad_secret" });
    return jsonRes(res, 401, { error: "unauthorized" });
  }
  next();
}

function clampDebugTimeoutMs(raw) {
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 5000 && n <= 180_000) return n;
  const d = Number(truthyEnv("AIRTEL_IQ_TIMEOUT_MS", "30000"));
  if (Number.isFinite(d) && d >= 5000) return Math.min(d, 180_000);
  return 30_000;
}

/**
 * Raw HTTPS GET with same agent + lookup + family as production axios (for tcp/tls phases).
 */
function probeHttpsGetWithTimings({ hostname, port, path, timeoutMs, requestId }) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    let tcpAt = null;
    let tlsAt = null;
    let firstByteAt = null;
    let settled = false;

    const done = (payload) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };

    let req;
    try {
      req = https.request(
        {
          hostname,
          port,
          path,
          method: "GET",
          agent: airtelHttpsAgent,
          lookup: airtelIpv4Lookup,
          family: 4,
          servername: hostname,
          timeout: timeoutMs,
          headers: { "User-Agent": "PariskqCRM-debug-airtel-connectivity/1" },
        },
        (res) => {
          firstByteAt = performance.now();
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            const buf = Buffer.concat(chunks);
            const totalMs = performance.now() - t0;
            done({
              ok: true,
              httpStatus: res.statusCode,
              totalMs,
              tcpConnectMs: tcpAt != null ? tcpAt - t0 : null,
              tlsHandshakeMs: tcpAt != null && tlsAt != null ? tlsAt - tcpAt : null,
              firstByteMs: firstByteAt != null ? firstByteAt - t0 : null,
              responseHeaderKeys: Object.keys(res.headers || {}),
              bodyPreview: buf.toString("utf8", 0, Math.min(4000, buf.length)),
              bodyLength: buf.length,
            });
          });
          res.on("error", (err) => {
            logEvent("transport_error", {
              where: "airtel_debug",
              phase: "response_stream",
              code: err.code || null,
              message: String(err.message || err).slice(0, 300),
              requestId,
            });
            done({
              ok: false,
              totalMs: performance.now() - t0,
              httpStatus: res.statusCode,
              errorCode: err.code || "RESPONSE_STREAM_ERROR",
              errorMessage: String(err.message || err).slice(0, 500),
              tcpConnectMs: tcpAt != null ? tcpAt - t0 : null,
              tlsHandshakeMs: tcpAt != null && tlsAt != null ? tlsAt - tcpAt : null,
              firstByteMs: firstByteAt != null ? firstByteAt - t0 : null,
              bodyPreview: null,
              bodyLength: 0,
            });
          });
        }
      );
    } catch (err) {
      logEvent("transport_error", {
        where: "airtel_debug",
        phase: "https_request_construct",
        code: err.code || null,
        message: String(err.message || err).slice(0, 300),
        requestId,
      });
      return done({
        ok: false,
        totalMs: performance.now() - t0,
        httpStatus: null,
        errorCode: err.code || "REQUEST_CONSTRUCT_ERROR",
        errorMessage: String(err.message || err).slice(0, 500),
        tcpConnectMs: null,
        tlsHandshakeMs: null,
        firstByteMs: null,
        bodyPreview: null,
        bodyLength: 0,
      });
    }

    req.on("socket", (socket) => {
      socket.once("connect", () => {
        tcpAt = performance.now();
      });
      socket.once("secureConnect", () => {
        tlsAt = performance.now();
      });
      socket.once("error", (err) => {
        logEvent("transport_error", {
          where: "airtel_debug",
          phase: "socket",
          code: err.code || null,
          message: String(err.message || err).slice(0, 300),
          requestId,
        });
      });
    });

    req.on("error", (err) => {
      logEvent("transport_error", {
        where: "airtel_debug",
        phase: "request",
        code: err.code || null,
        message: String(err.message || err).slice(0, 300),
        requestId,
      });
      done({
        ok: false,
        totalMs: performance.now() - t0,
        httpStatus: null,
        errorCode: err.code || "REQUEST_ERROR",
        errorMessage: String(err.message || err).slice(0, 500),
        tcpConnectMs: tcpAt != null ? tcpAt - t0 : null,
        tlsHandshakeMs: tcpAt != null && tlsAt != null ? tlsAt - tcpAt : null,
        firstByteMs: firstByteAt != null ? firstByteAt - t0 : null,
        bodyPreview: null,
        bodyLength: 0,
      });
    });

    req.on("timeout", () => {
      req.destroy();
      logEvent("transport_error", {
        where: "airtel_debug",
        phase: "timeout",
        code: "ETIMEDOUT",
        message: `HTTPS socket/request exceeded ${timeoutMs}ms`,
        requestId,
      });
      done({
        ok: false,
        totalMs: performance.now() - t0,
        httpStatus: null,
        errorCode: "ETIMEDOUT",
        errorMessage: `HTTPS request timed out after ${timeoutMs}ms`,
        tcpConnectMs: tcpAt != null ? tcpAt - t0 : null,
        tlsHandshakeMs: tcpAt != null && tlsAt != null ? tlsAt - tcpAt : null,
        firstByteMs: firstByteAt != null ? firstByteAt - t0 : null,
        bodyPreview: null,
        bodyLength: 0,
      });
    });

    logEvent("request_start", {
      where: "airtel_debug",
      lane: "raw_https_get",
      hostname,
      path,
      port,
      timeoutMs,
      transport: "node_https_shared_agent_lookup",
      requestId,
    });
    req.end();
  });
}

router.get("/debug/airtel-connectivity", requireInternalTriggerSecret, async (req, res) => {
  const wall0 = performance.now();
  const requestId = req.requestId ?? null;
  const timeoutMs = clampDebugTimeoutMs(req.query.timeout_ms);
  const pathRaw = req.query.path != null ? String(req.query.path) : "/";
  const path = pathRaw.startsWith("/") ? pathRaw : `/${pathRaw}`;

  const baseUrl = truthyEnv("AIRTEL_IQ_BASE_URL");
  if (!baseUrl) {
    return jsonRes(res, 400, { error: "AIRTEL_IQ_BASE_URL missing", requestId });
  }

  let hostname;
  let port = 443;
  try {
    const u = new URL(baseUrl);
    hostname = u.hostname;
    if (u.port) port = Number(u.port) || 443;
  } catch (e) {
    return jsonRes(res, 400, { error: "invalid AIRTEL_IQ_BASE_URL", detail: String(e.message || e), requestId });
  }

  const dnsT0 = performance.now();
  logEvent("dns_start", { where: "airtel_debug_connectivity", hostname, requestId });
  let resolvedIpv4 = [];
  /** @type {{ code?: string, message?: string } | null} */
  let dnsError = null;
  try {
    resolvedIpv4 = await dns.promises.resolve4(hostname);
  } catch (e) {
    try {
      const one = await dns.promises.lookup(hostname, { family: 4 });
      resolvedIpv4 = [one.address];
    } catch (e2) {
      dnsError = { code: e2.code || e.code || "DNS_FAILED", message: String(e2.message || e2) };
    }
  }
  const dnsDurationMs = performance.now() - dnsT0;
  logEvent("dns_end", {
    where: "airtel_debug_connectivity",
    hostname,
    ms: Math.round(dnsDurationMs),
    count: resolvedIpv4.length,
    error: dnsError,
    requestId,
  });

  const httpsResult = await probeHttpsGetWithTimings({
    hostname,
    port,
    path,
    timeoutMs,
    requestId,
  });
  logEvent("request_end", {
    where: "airtel_debug",
    lane: "raw_https_get",
    ok: httpsResult.ok,
    httpStatus: httpsResult.httpStatus ?? null,
    totalMs: httpsResult.totalMs != null ? Math.round(httpsResult.totalMs) : null,
    errorCode: httpsResult.errorCode ?? null,
    requestId,
  });

  let axiosMirror = null;
  /** Default on: second GET using axios + buildAirtelAxiosOptions (same as smsService). Pass axios_mirror=0 to skip. */
  const skipAxiosMirror = String(req.query.axios_mirror || "").toLowerCase() === "0";
  const probeUrl = `https://${hostname}${port === 443 ? "" : `:${port}`}${path}`;
  if (!skipAxiosMirror) {
    const ax0 = performance.now();
    logEvent("request_start", { where: "airtel_debug", lane: "axios_get_mirror", url: probeUrl, requestId });
    try {
      const ax = await axios.get(probeUrl, buildAirtelAxiosOptions(timeoutMs));
      const bodyStr =
        typeof ax.data === "string" ? ax.data : JSON.stringify(ax.data ?? {});
      axiosMirror = {
        ok: true,
        httpStatus: ax.status,
        totalMs: Math.round(performance.now() - ax0),
        bodyPreview: bodyStr.length > 4000 ? `${bodyStr.slice(0, 4000)}…` : bodyStr,
      };
    } catch (err) {
      const code = err?.code || err?.cause?.code;
      const isTimeout = code === "ECONNABORTED" || /timeout/i.test(String(err?.message || ""));
      axiosMirror = {
        ok: false,
        httpStatus: err.response?.status ?? null,
        totalMs: Math.round(performance.now() - ax0),
        errorCode: code || (isTimeout ? "TIMEOUT" : "AXIOS_ERROR"),
        errorMessage: String(err?.message || err).slice(0, 500),
        bodyPreview:
          err.response?.data != null
            ? typeof err.response.data === "string"
              ? String(err.response.data).slice(0, 2000)
              : JSON.stringify(err.response.data).slice(0, 2000)
            : null,
      };
      logEvent("transport_error", {
        where: "airtel_debug",
        phase: "axios_mirror",
        code: axiosMirror.errorCode,
        message: axiosMirror.errorMessage,
        requestId,
      });
    }
    logEvent("request_end", {
      where: "airtel_debug",
      lane: "axios_get_mirror",
      ok: axiosMirror.ok,
      httpStatus: axiosMirror.httpStatus,
      totalMs: axiosMirror.totalMs,
      requestId,
    });
  }

  return jsonOk(res, {
    debug: "airtel-connectivity",
    requestId,
    totalDurationMs: Math.round(performance.now() - wall0),
    hostname,
    path,
    port,
    timeoutMsUsed: timeoutMs,
    dns: {
      durationMs: Math.round(dnsDurationMs),
      resolvedIpv4,
      error: dnsError,
    },
    httpsProbe: {
      ...httpsResult,
      totalMs: httpsResult.totalMs != null ? Math.round(httpsResult.totalMs) : null,
      tcpConnectMs: httpsResult.tcpConnectMs != null ? Math.round(httpsResult.tcpConnectMs) : null,
      tlsHandshakeMs: httpsResult.tlsHandshakeMs != null ? Math.round(httpsResult.tlsHandshakeMs) : null,
      firstByteMs: httpsResult.firstByteMs != null ? Math.round(httpsResult.firstByteMs) : null,
      note:
        "Uses node:https with airtelHttpsAgent + airtelIpv4Lookup + family:4 (same stack as smsService axios).",
    },
    axiosMirrorProbe: axiosMirror,
    queryHint:
      "Default runs HTTPS raw probe (tcp/tls) then axios GET mirror (same options as smsService). Pass axios_mirror=0 to skip the second request. Optional: timeout_ms=..., path=/",
  });
});

const sendTestBodySchema = z.object({
  phone: z.string().min(10).max(32),
  message: z.string().min(1).max(700),
});

router.post("/debug/airtel-send-test", requireInternalTriggerSecret, async (req, res) => {
  const requestId = req.requestId ?? null;
  const parsed = sendTestBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return jsonRes(res, 400, { error: "invalid body", details: parsed.error.flatten(), requestId });
  }

  const clean = sanitizePhoneForSms(parsed.data.phone);
  if (clean.length !== 10) {
    return jsonRes(res, 400, {
      error: "phone must normalize to 10-digit Indian mobile",
      normalized_len: clean.length,
      requestId,
    });
  }

  const parts = collectAirtelSendParts({ cleanPhone10: clean, message: parsed.data.message });
  if (!parts.ok) {
    return jsonRes(res, 400, { error: "missing Airtel env", missing: parts.missing, requestId });
  }

  const { url, body, username, password, timeoutMs } = parts;
  const t0 = performance.now();
  logEvent("request_start", {
    where: "airtel_debug",
    lane: "axios_post_send_test",
    url,
    transport: "axios_post_sms_shape",
    destinationMsisdn_suffix: String(parts.destinationMsisdn).slice(-4),
    requestId,
  });

  try {
    const resp = await axios.post(url, body, {
      auth: { username, password },
      headers: { "Content-Type": "application/json" },
      ...buildAirtelAxiosOptions(timeoutMs),
    });
    const totalMs = Math.round(performance.now() - t0);
    logEvent("request_end", {
      where: "airtel_debug",
      lane: "axios_post_send_test",
      httpStatus: resp.status,
      totalMs,
      requestId,
      debug: "airtel-send-test",
    });
    return jsonOk(res, {
      debug: "airtel-send-test",
      requestId,
      totalMs,
      httpStatus: resp.status,
      requestPayload: body,
      providerResponse: resp.data,
      providerResponseHeaders: resp.headers ? { ...resp.headers } : {},
    });
  } catch (err) {
    const code = err?.code || err?.cause?.code;
    const isTimeout = code === "ECONNABORTED" || /timeout/i.test(String(err?.message || ""));
    logEvent("transport_error", {
      where: "airtel_debug",
      phase: "axios_post",
      code: code || null,
      message: String(err?.message || err).slice(0, 300),
      isTimeout,
      requestId,
      debug: "airtel-send-test",
    });
    logEvent("request_end", {
      where: "airtel_debug",
      lane: "axios_post_send_test",
      ok: false,
      errorCode: code || (isTimeout ? "TIMEOUT" : "AXIOS_ERROR"),
      totalMs: Math.round(performance.now() - t0),
      requestId,
      debug: "airtel-send-test",
    });
    const status = err.response?.status && err.response.status >= 400 ? err.response.status : 502;
    return jsonRes(res, status, {
      error: "airtel_send_failed",
      requestId,
      totalMs: Math.round(performance.now() - t0),
      errorCode: code || (isTimeout ? "TIMEOUT" : "AXIOS_ERROR"),
      errorMessage: String(err?.message || err).slice(0, 500),
      httpStatus: err.response?.status ?? null,
      requestPayload: body,
      providerResponse: err.response?.data ?? null,
      providerResponseHeaders: err.response?.headers ? { ...err.response.headers } : null,
    });
  }
});

export default router;
