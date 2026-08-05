/**
 * Client-side proof-image compression for FE uploads.
 * Pure frontend — does not change API payloads beyond producing a smaller File
 * that is still converted to base64 by the existing submit flow.
 */

const MAX_EDGE_PX = 1920;
const JPEG_QUALITY = 0.75;
/** Skip work if the file is already small enough for mobile upload. */
const SKIP_UNDER_BYTES = 450 * 1024;

function canDrawImage(): boolean {
  return typeof document !== "undefined" && typeof document.createElement === "function";
}

/**
 * Compress an image for proof upload.
 * Returns a JPEG File when successful; falls back to the original File on failure.
 */
export async function compressProofImage(file: File): Promise<{ file: File; compressed: boolean }> {
  if (!file.type.startsWith("image/")) {
    return { file, compressed: false };
  }

  // GIFs / unusual types: leave alone (canvas may drop animation / alpha poorly).
  if (file.type === "image/gif") {
    return { file, compressed: false };
  }

  if (file.size > 0 && file.size <= SKIP_UNDER_BYTES) {
    return { file, compressed: false };
  }

  if (!canDrawImage()) {
    return { file, compressed: false };
  }

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    if (!width || !height) {
      bitmap.close?.();
      return { file, compressed: false };
    }

    const scale = Math.min(1, MAX_EDGE_PX / Math.max(width, height));
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return { file, compressed: false };
    }

    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close?.();

    const blob: Blob | null = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY);
    });

    if (!blob || blob.size === 0) {
      return { file, compressed: false };
    }

    // Prefer original if compression somehow grew the file.
    if (blob.size >= file.size) {
      return { file, compressed: false };
    }

    const baseName = file.name.replace(/\.[^.]+$/, "") || "proof";
    const out = new File([blob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
    return { file: out, compressed: true };
  } catch {
    return { file, compressed: false };
  }
}

/** Approximate encoded JSON/base64 size for a binary File (~4/3 overhead). */
export function approxBase64Bytes(file: File): number {
  return Math.ceil(file.size * (4 / 3));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Existing FE proof body-size safety margin (same as FEActionPage historically). */
export const PROOF_UPLOAD_BUDGET_BYTES = 9 * 1024 * 1024;

/** Max on-site / resolution proof photos per FE submission (client + backend aligned). */
export const MAX_PROOF_IMAGES = 10;
