/**
 * Redact PII for logs and audit output (never log raw emails/phones in production-style logs).
 */

export function redactEmail(email) {
  if (email == null || typeof email !== "string") return null;
  const s = email.trim();
  if (!s) return null;
  const at = s.indexOf("@");
  if (at < 1) return "***";
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  if (!domain) return "***";
  if (local.length <= 1) return `*@${domain}`;
  return `${local[0]}***@${domain}`;
}

export function redactPhone(phone) {
  if (phone == null || typeof phone !== "string") return null;
  const d = phone.replace(/\D/g, "");
  if (d.length < 4) return "****";
  return `***${d.slice(-4)}`;
}

/** MSISDN / destinationAddress values in provider payloads (logs only). */
export function redactMsisdn(msisdn) {
  if (msisdn == null) return null;
  if (Array.isArray(msisdn)) return msisdn.map((v) => redactMsisdn(v));
  const d = String(msisdn).replace(/\D/g, "");
  if (d.length < 4) return "****";
  return `***${d.slice(-4)}`;
}

/** Storage object keys / paths (logs only). */
export function redactStoragePath(path) {
  if (path == null) return null;
  const s = String(path).trim();
  if (!s) return null;
  const parts = s.split("/").filter(Boolean);
  if (parts.length === 0) return "[redacted]";
  const last = parts[parts.length - 1];
  if (parts.length === 1) return `…/${last}`;
  const first = parts[0];
  const maskedFirst = first.length > 8 ? `${first.slice(0, 8)}…` : first;
  return `${maskedFirst}/…/${last}`;
}

/** FE magic-link URLs embedded in SMS/email text (logs only). */
export function redactFeActionUrls(text) {
  if (text == null || text === "") return "";
  return String(text).replace(
    /https?:\/\/[^\s/]+(?:\/[^\s]*)?\/fe\/action\/[0-9a-f-]{36}/gi,
    "[FE_ACTION_URL_REDACTED]"
  );
}
