import { allocateTicketSequence } from "../repositories/ticketNumberSequenceRepository.js";
import { getIstCalendarParts, istDayStartUtc } from "./reportDateWindow.js";

/** @type {Record<string, 'S' | 'E' | 'C'>} */
const SOURCE_CODE_MAP = {
  MANUAL: "S",
  EMAIL: "E",
  PUBLIC_QR: "C",
};

/** @type {Record<'S' | 'E' | 'C', 'PKQS' | 'PKQE' | 'PKQC'>} */
const PREFIX_BY_SOURCE_CODE = {
  S: "PKQS",
  E: "PKQE",
  C: "PKQC",
};

let cutoverInstantCache = null;
let cutoverInstantEnvKey = null;

function isSourceAwareFeatureEnabled() {
  return (
    String(process.env.USE_SOURCE_AWARE_TICKET_NUMBERS ?? "true").trim().toLowerCase() !== "false"
  );
}

function getCutoverEnvKey() {
  return process.env.TICKET_NUMBERING_CUTOVER_IST || "2026-06-20 00:00:00 Asia/Kolkata";
}

/**
 * Legacy PKQ-YYYYMMDD-RANDOM4 (UTC calendar date) — email, import, public before cutover.
 */
export function generateLegacyEmailTicketNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `PKQ-${date}-${rand}`;
}

/** @deprecated Prefer generateTicketNumberForCreation — kept for rollback and emergency use. */
export function generateTicketNumber() {
  return generateLegacyEmailTicketNumber();
}

/**
 * Legacy TKT-{base36}-{random} — manual tickets before cutover.
 */
export function generateLegacyManualTicketNumber() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `TKT-${timestamp}-${random}`;
}

function parseCutoverInstant() {
  const datePart = String(getCutoverEnvKey()).trim().split(/\s+/)[0];
  const [year, month, day] = datePart.split("-").map((part) => Number(part));
  if (!year || !month || !day) {
    throw new Error(`Invalid TICKET_NUMBERING_CUTOVER_IST: ${getCutoverEnvKey()}`);
  }
  return istDayStartUtc({ year, month, day });
}

function getCutoverInstant() {
  const envKey = getCutoverEnvKey();
  if (cutoverInstantCache == null || cutoverInstantEnvKey !== envKey) {
    cutoverInstantCache = parseCutoverInstant();
    cutoverInstantEnvKey = envKey;
  }
  return cutoverInstantCache;
}

/**
 * Whether new tickets should use PKQS/PKQE/PKQC (post-cutover and feature flag on).
 * @param {Date} [reference]
 */
export function isSourceAwareTicketNumberingActive(reference = new Date()) {
  if (!isSourceAwareFeatureEnabled()) return false;
  return reference.getTime() >= getCutoverInstant().getTime();
}

/**
 * @param {string} source
 * @returns {'MANUAL' | 'EMAIL' | 'PUBLIC_QR'}
 */
function normalizeCreationSource(source) {
  const normalized = String(source || "MANUAL")
    .trim()
    .toUpperCase();
  if (normalized === "PUBLIC_COMPLAINT" || normalized === "COMPLAINT_POINT") {
    return "PUBLIC_QR";
  }
  if (normalized === "MANUAL" || normalized === "EMAIL" || normalized === "PUBLIC_QR") {
    return normalized;
  }
  throw new Error(`Invalid ticket source for numbering: ${source}`);
}

/**
 * @param {'MANUAL' | 'EMAIL' | 'PUBLIC_QR'} source
 */
function generateLegacyTicketNumberForSource(source) {
  if (source === "MANUAL") {
    return generateLegacyManualTicketNumber();
  }
  return generateLegacyEmailTicketNumber();
}

function formatSequenceDateYmd(sequenceDate) {
  if (sequenceDate instanceof Date) {
    const parts = getIstCalendarParts(sequenceDate);
    return `${parts.year}${String(parts.month).padStart(2, "0")}${String(parts.day).padStart(2, "0")}`;
  }
  const raw = String(sequenceDate).trim();
  if (/^\d{8}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[1]}${match[2]}${match[3]}`;
  }
  throw new Error(`Invalid sequence_date from allocator: ${sequenceDate}`);
}

/**
 * @param {'MANUAL' | 'EMAIL' | 'PUBLIC_QR'} source
 */
async function allocateSourceAwareTicketNumber(source) {
  const sourceCode = SOURCE_CODE_MAP[source];
  const prefix = PREFIX_BY_SOURCE_CODE[sourceCode];

  const { last_number: seq, sequence_date: sequenceDate } = await allocateTicketSequence(sourceCode);
  if (!Number.isInteger(seq) || seq < 1 || seq > 9999 || sequenceDate == null) {
    const err = new Error("Ticket number allocation returned invalid payload");
    err.code = "TICKET_NUMBER_ALLOCATION_FAILED";
    throw err;
  }

  const dateYmd = formatSequenceDateYmd(sequenceDate);
  return `${prefix}-${dateYmd}-${String(seq).padStart(4, "0")}`;
}

/**
 * Single entrypoint for all ticket creation paths.
 * Before cutover (or when USE_SOURCE_AWARE_TICKET_NUMBERS=false): legacy generators.
 * On/after cutover: atomic source-aware PKQS/PKQE/PKQC allocation.
 *
 * @param {'MANUAL' | 'EMAIL' | 'PUBLIC_QR' | string} source
 * @param {Date} [reference] — for tests only
 * @returns {Promise<string>}
 */
export async function generateTicketNumberForCreation(source, reference = new Date()) {
  const normalized = normalizeCreationSource(source);

  if (!isSourceAwareTicketNumberingActive(reference)) {
    return generateLegacyTicketNumberForSource(normalized);
  }

  return allocateSourceAwareTicketNumber(normalized);
}
