/**
 * Phone normalization for WhatsApp (isolated from smsService — do not import SMS module).
 */

/**
 * Sanitize Indian mobile to 10 national digits.
 * @param {string} phone
 * @returns {string} 10-digit or empty
 */
export function sanitizePhoneForWhatsApp(phone) {
  if (phone == null || phone === "") return "";
  const raw = String(phone).trim();
  if (!raw) return "";
  let d = raw.replace(/\D/g, "");
  if (!d) return "";
  while (d.startsWith("00") && d.length > 10) {
    d = d.slice(2);
  }
  if (d.startsWith("91") && d.length >= 12) {
    d = d.slice(2);
  }
  if (d.startsWith("0") && d.length === 11) {
    d = d.slice(1);
  }
  if (d.length > 10) {
    d = d.slice(-10);
  }
  return d.length === 10 ? d : "";
}

/**
 * @param {string} cleanPhone10
 * @param {string} [prefix] default from env at call site
 * @returns {string}
 */
export function toWhatsAppMsisdn(cleanPhone10, prefix = "91") {
  const p = prefix != null ? String(prefix).trim() : "";
  return p ? `${p}${cleanPhone10}` : cleanPhone10;
}
