/**
 * Formats FE proof GPS from ticket_comments.attachments.images[0].geo for timeline display.
 */
export function formatProofGeoLine(geo: unknown): string | null {
  if (!geo || typeof geo !== "object") return null;
  const g = geo as { lat?: unknown; lng?: unknown; accuracy?: unknown };
  const lat = typeof g.lat === "number" ? g.lat : Number(g.lat);
  const lng = typeof g.lng === "number" ? g.lng : Number(g.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const accPart =
    typeof g.accuracy === "number" && Number.isFinite(g.accuracy) && g.accuracy > 0
      ? ` (±${Math.round(g.accuracy)}m)`
      : "";
  return `GPS: ${lat.toFixed(4)}, ${lng.toFixed(4)}${accPart}`;
}
