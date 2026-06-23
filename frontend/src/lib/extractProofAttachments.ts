/**
 * Read-only helpers for FE proof attachments on ticket_comments.attachments.
 * Presentation layer only — does not mutate storage or API contracts.
 */

export type ProofGeo = {
  lat?: number;
  lng?: number;
  accuracy?: number;
  captured_at?: string;
};

function isVideoMime(mime: unknown): boolean {
  return typeof mime === "string" && mime.trim().toLowerCase().startsWith("video/");
}

function pushImageSource(out: string[], value: unknown) {
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (trimmed !== "") out.push(trimmed);
}

function collectFromImageObjects(items: unknown[]): string[] {
  const out: string[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object" || Array.isArray(it)) continue;
    const obj = it as Record<string, unknown>;
    if (isVideoMime(obj.mime_type ?? obj.mimeType)) continue;
    if (typeof obj.video_base64 === "string" && obj.video_base64.trim() !== "") continue;

    if (typeof obj.image_base64 === "string" && obj.image_base64.trim() !== "") {
      pushImageSource(out, obj.image_base64);
      continue;
    }

    const url = obj.url ?? obj.public_url ?? obj.image_url;
    if (typeof url === "string" && url.trim() !== "" && !isVideoMime(obj.mime_type ?? obj.mimeType)) {
      pushImageSource(out, url);
    }
  }
  return out;
}

function dedupePreserveOrder(sources: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of sources) {
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/**
 * Returns ordered, de-duplicated image sources for display (base64 data URLs or http(s) URLs).
 * Excludes video payloads. Preserves upload order from attachments.images when present.
 */
export function extractProofImageSources(attachments: unknown): string[] {
  if (attachments == null) return [];
  if (Array.isArray(attachments)) {
    return dedupePreserveOrder(collectFromImageObjects(attachments));
  }
  if (typeof attachments !== "object") return [];

  const att = attachments as Record<string, unknown>;
  const collected: string[] = [];

  if (Array.isArray(att.images)) {
    collected.push(...collectFromImageObjects(att.images));
  }

  if (Array.isArray(att.items)) {
    collected.push(...collectFromImageObjects(att.items));
  }

  if (collected.length === 0) {
    pushImageSource(collected, att.image_base64);
  }

  return dedupePreserveOrder(collected);
}

/** GPS from the first image entry when present (images[0].geo). */
export function extractFirstProofGeo(attachments: unknown): ProofGeo | undefined {
  if (!attachments || typeof attachments !== "object" || Array.isArray(attachments)) return undefined;
  const att = attachments as Record<string, unknown>;
  const first =
    Array.isArray(att.images) && att.images[0] && typeof att.images[0] === "object"
      ? (att.images[0] as { geo?: unknown }).geo
      : undefined;
  if (first && typeof first === "object" && !Array.isArray(first)) {
    return first as ProofGeo;
  }
  return undefined;
}
