/**
 * IST (Asia/Kolkata) report-day boundaries for daily tenant operations reports.
 * India has no DST; fixed offset UTC+5:30.
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** @param {Date} instant */
export function getIstCalendarParts(instant) {
  const ist = new Date(instant.getTime() + IST_OFFSET_MS);
  return {
    year: ist.getUTCFullYear(),
    month: ist.getUTCMonth() + 1,
    day: ist.getUTCDate(),
    hour: ist.getUTCHours(),
    minute: ist.getUTCMinutes(),
  };
}

/** @param {{ year: number, month: number, day: number }} parts */
export function istDayStartUtc(parts) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0) - IST_OFFSET_MS);
}

/** @param {{ year: number, month: number, day: number }} parts */
export function istDayEndUtc(parts) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 23, 59, 59, 999) - IST_OFFSET_MS);
}

/**
 * Previous calendar day in IST relative to `reference`.
 * @param {Date} [reference]
 */
export function getPreviousIstReportDay(reference = new Date()) {
  const todayStart = istDayStartUtc(getIstCalendarParts(reference));
  const prevInstant = new Date(todayStart.getTime() - 1);
  const parts = getIstCalendarParts(prevInstant);
  const dateStr = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  const fileDate = `${parts.year}_${String(parts.month).padStart(2, "0")}_${String(parts.day).padStart(2, "0")}`;
  const displayLabel = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(prevInstant);

  return {
    parts,
    dateStr,
    fileDate,
    displayLabel,
    windowStart: istDayStartUtc(parts),
    windowEnd: istDayEndUtc(parts),
  };
}

/**
 * @param {Date} [reference]
 * @param {number} [hourIst] — run only when IST hour >= this value (0–23)
 */
export function shouldRunDailyReportNow(reference = new Date(), hourIst = 7) {
  const { hour } = getIstCalendarParts(reference);
  return hour >= hourIst;
}

/** @param {Date | string | null | undefined} value */
export function formatInstantInIst(value) {
  if (value == null) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
}

/**
 * @param {Date | string | null | undefined} value
 * @param {Date} windowStart
 * @param {Date} windowEnd
 */
export function isInstantInWindow(value, windowStart, windowEnd) {
  if (value == null) return false;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() >= windowStart.getTime() && d.getTime() <= windowEnd.getTime();
}
