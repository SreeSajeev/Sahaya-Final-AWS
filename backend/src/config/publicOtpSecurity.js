import { PUBLIC_COMPLAINTS_ENABLED } from "./appConfig.js";
import { logJson } from "../utils/jsonLog.js";

export function isNodeProduction() {
  return String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
}

export function isPublicOtpAllowSmsSkipEnabled() {
  return String(process.env.PUBLIC_OTP_ALLOW_SMS_SKIP || "false").trim().toLowerCase() === "true";
}

export function hasPublicOtpHmacSecret() {
  return Boolean(String(process.env.PUBLIC_OTP_HMAC_SECRET || "").trim());
}

/**
 * Fail fast when public OTP is enabled in production with unsafe configuration.
 * Call once at process startup (api / all roles).
 */
export function assertPublicOtpProductionSecurity() {
  if (!PUBLIC_COMPLAINTS_ENABLED) return;

  if (!isNodeProduction()) return;

  const problems = [];

  if (!hasPublicOtpHmacSecret()) {
    problems.push(
      "PUBLIC_OTP_HMAC_SECRET is required in production when PUBLIC_COMPLAINTS_ENABLED=true (do not use INTERNAL_TRIGGER_SECRET for OTP)"
    );
  }

  if (isPublicOtpAllowSmsSkipEnabled()) {
    problems.push(
      "PUBLIC_OTP_ALLOW_SMS_SKIP must be false in production (OTP must not be marked sent without SMS delivery)"
    );
    console.error(
      "[PUBLIC_OTP_SECURITY] FATAL: PUBLIC_OTP_ALLOW_SMS_SKIP=true is forbidden in production with public complaints enabled."
    );
    logJson("error", "public_otp_security_misconfiguration", {
      issue: "PUBLIC_OTP_ALLOW_SMS_SKIP_true_in_production",
      publicComplaintsEnabled: true,
    });
  }

  if (!hasPublicOtpHmacSecret()) {
    console.error(
      "[PUBLIC_OTP_SECURITY] FATAL: PUBLIC_OTP_HMAC_SECRET is missing in production with PUBLIC_COMPLAINTS_ENABLED=true."
    );
    logJson("error", "public_otp_security_misconfiguration", {
      issue: "missing_PUBLIC_OTP_HMAC_SECRET",
      publicComplaintsEnabled: true,
    });
  }

  if (problems.length > 0) {
    throw new Error(`Public OTP production security check failed:\n- ${problems.join("\n- ")}`);
  }
}
