/**
 * TEST FE proof object storage (S3 only).
 * Never targets crm-pariskq. Never uses Supabase Storage.
 */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { redactStoragePath } from "../utils/redact.js";

const FORBIDDEN_BUCKETS = new Set(["crm-pariskq"]);
const ALLOWED_BUCKET_RE = /^sahaya-test(-[a-z0-9-]+)?-fe-proofs$/i;
const DEFAULT_TEST_BUCKET = "sahaya-test-fe-proofs";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

const MAX_PROOF_BYTES = Number(process.env.S3_FE_PROOFS_MAX_BYTES || 15 * 1024 * 1024);

let s3Client = null;

export function isProofS3Enabled() {
  return String(process.env.S3_FE_PROOFS_ENABLED || "false").toLowerCase() === "true";
}

export function getProofS3Bucket() {
  const raw = String(process.env.S3_FE_PROOFS_BUCKET || "").trim();
  if (!raw) return "";
  if (FORBIDDEN_BUCKETS.has(raw) || raw === "crm-pariskq") {
    throw new Error("S3_FE_PROOFS_BUCKET refuses crm-pariskq (unverified/shared). Use sahaya-test-fe-proofs.");
  }
  if (!ALLOWED_BUCKET_RE.test(raw) && raw !== DEFAULT_TEST_BUCKET) {
    throw new Error(
      `S3_FE_PROOFS_BUCKET "${raw}" is not an approved TEST bucket (expected sahaya-test-fe-proofs).`
    );
  }
  return raw;
}

function getS3Client() {
  if (!s3Client) {
    const region = String(process.env.AWS_REGION || "ap-south-1").trim();
    s3Client = new S3Client({ region });
  }
  return s3Client;
}

export function sanitizeProofFilename(name) {
  const base = String(name || "proof")
    .split(/[/\\]/)
    .pop()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 120);
  return base || "proof.bin";
}

export function buildProofObjectKey({
  tenantId,
  ticketId,
  commentId,
  index = 0,
  filename,
}) {
  const tenant = String(tenantId || "unknown").trim() || "unknown";
  const ticket = String(ticketId || "").trim();
  const comment = String(commentId || "").trim();
  if (!ticket || !comment) {
    throw new Error("ticketId and commentId required for proof object key");
  }
  const safeName = sanitizeProofFilename(filename || `${index}.bin`);
  return `test/${tenant}/tickets/${ticket}/proofs/${comment}/${safeName}`;
}

function extFromContentType(contentType, fallback = "bin") {
  const ct = String(contentType || "").toLowerCase();
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("mp4")) return "mp4";
  if (ct.includes("quicktime")) return "mov";
  if (ct.includes("webm")) return "webm";
  return fallback;
}

export function decodeBase64Proof(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return { buffer: null, contentType: null };

  const dataUrlMatch = raw.match(/^data:([^;]+);base64,(.+)$/is);
  if (dataUrlMatch) {
    return {
      contentType: dataUrlMatch[1],
      buffer: Buffer.from(dataUrlMatch[2], "base64"),
    };
  }

  const stripped = raw.replace(/^data:[^;]+;base64,/, "");
  return { buffer: Buffer.from(stripped, "base64"), contentType: null };
}

function assertSafeUpload({ buffer, contentType }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("Empty proof buffer");
  }
  if (buffer.length > MAX_PROOF_BYTES) {
    throw new Error(`Proof exceeds max size (${MAX_PROOF_BYTES} bytes)`);
  }
  const ct = String(contentType || "application/octet-stream").toLowerCase();
  if (!ALLOWED_MIME.has(ct) && !ct.startsWith("image/") && !ct.startsWith("video/")) {
    throw new Error(`Unsupported proof MIME type: ${ct}`);
  }
  return ct;
}

/**
 * Upload one proof object to the dedicated TEST S3 bucket.
 * @returns {Promise<{ ok: true, bucket: string, key: string, bytes: number }>}
 */
export async function uploadProof({
  tenantId,
  ticketId,
  commentId,
  index = 0,
  buffer,
  contentType = "image/jpeg",
  filename,
}) {
  if (!isProofS3Enabled()) {
    const err = new Error("S3 proof storage is disabled (S3_FE_PROOFS_ENABLED!=true)");
    err.code = "S3_PROOFS_DISABLED";
    throw err;
  }
  const bucket = getProofS3Bucket();
  if (!bucket) {
    const err = new Error("S3_FE_PROOFS_BUCKET missing");
    err.code = "S3_PROOFS_BUCKET_MISSING";
    throw err;
  }

  const ct = assertSafeUpload({ buffer, contentType });
  const ext = extFromContentType(ct, "bin");
  const key = buildProofObjectKey({
    tenantId,
    ticketId,
    commentId,
    index,
    filename: filename || `${index}.${ext}`,
  });

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: ct,
    })
  );

  return { ok: true, bucket, key, bytes: buffer.length, contentType: ct };
}

export async function getProof({ key }) {
  const bucket = getProofS3Bucket();
  if (!bucket) throw new Error("S3_FE_PROOFS_BUCKET missing");
  assertOwnedKey(key);
  const out = await getS3Client().send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
  const chunks = [];
  for await (const c of out.Body) chunks.push(c);
  return {
    buffer: Buffer.concat(chunks),
    contentType: out.ContentType || "application/octet-stream",
    bucket,
    key,
  };
}

export async function getProofDownloadUrl({ key, expiresInSeconds = 120 }) {
  const bucket = getProofS3Bucket();
  if (!bucket) throw new Error("S3_FE_PROOFS_BUCKET missing");
  assertOwnedKey(key);
  const expiresIn = Math.min(Math.max(Number(expiresInSeconds) || 120, 30), 900);
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const url = await getSignedUrl(getS3Client(), command, { expiresIn });
  return { url, expiresIn, bucket, key: redactStoragePath(key) };
}

export async function deleteProof({ key }) {
  const bucket = getProofS3Bucket();
  if (!bucket) throw new Error("S3_FE_PROOFS_BUCKET missing");
  assertOwnedKey(key);
  await getS3Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  return { ok: true, bucket, key };
}

/** Keys must live under test/ and never escape. */
export function assertOwnedKey(key) {
  const k = String(key || "").trim();
  if (!k || k.includes("..") || k.startsWith("/") || k.includes("\\")) {
    throw new Error("Invalid proof object key");
  }
  if (!k.startsWith("test/")) {
    throw new Error("Proof object key must be under test/");
  }
  return k;
}

export function collectProofMediaFromAttachments(attachments, videoAttachmentMeta) {
  const items = [];
  const att =
    attachments && typeof attachments === "object" && !Array.isArray(attachments) ? attachments : {};

  const push = (value, defaultType) => {
    const { buffer, contentType } = decodeBase64Proof(value);
    if (!buffer?.length) return;
    items.push({
      buffer,
      contentType: contentType || defaultType,
      ext: extFromContentType(contentType, defaultType === "video/mp4" ? "mp4" : "jpg"),
    });
  };

  if (Array.isArray(att.images)) {
    for (const it of att.images) {
      if (it && typeof it === "object" && it.image_base64) push(it.image_base64, "image/jpeg");
    }
  }
  if (items.length === 0 && typeof att.image_base64 === "string" && att.image_base64.trim() !== "") {
    push(att.image_base64, "image/jpeg");
  }
  if (typeof att.video_base64 === "string" && att.video_base64.trim() !== "") {
    push(att.video_base64, "video/mp4");
  }
  if (Array.isArray(att.videos)) {
    for (const v of att.videos) {
      if (v && typeof v === "object" && v.video_base64) push(v.video_base64, "video/mp4");
    }
  }
  const meta =
    videoAttachmentMeta && typeof videoAttachmentMeta === "object" && !Array.isArray(videoAttachmentMeta)
      ? videoAttachmentMeta
      : null;
  if (meta?.video_base64) {
    push(meta.video_base64, meta.mime_type || "video/mp4");
  }
  return items;
}

/**
 * Upload all media from attachments. Throws if enabled and any required upload fails.
 * @returns {Promise<{ keys: string[], results: object[] }>}
 */
export async function uploadProofsFromAttachments({
  tenantId,
  ticketId,
  commentId,
  attachments,
  videoAttachmentMeta = null,
}) {
  const media = collectProofMediaFromAttachments(attachments, videoAttachmentMeta);
  if (media.length === 0) {
    return { keys: [], results: [], skipped: true };
  }

  const results = [];
  const keys = [];
  for (let index = 0; index < media.length; index++) {
    const item = media[index];
    const uploaded = await uploadProof({
      tenantId,
      ticketId,
      commentId,
      index,
      buffer: item.buffer,
      contentType: item.contentType,
      filename: `${index}.${item.ext}`,
    });
    results.push(uploaded);
    keys.push(uploaded.key);
  }
  return { keys, results, skipped: false };
}

/** Reset cached client (tests). */
export function __resetProofStorageClientForTests() {
  s3Client = null;
}
