/**
 * Mask UUID / token ids for logs (audit-safe, non-reversible).
 */
export function maskTokenForLog(id) {
  if (id == null) return null;
  const s = String(id).trim();
  if (s.length === 0) return null;
  if (s.length <= 13) return "[redacted]";
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}
