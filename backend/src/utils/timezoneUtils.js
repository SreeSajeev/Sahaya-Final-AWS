/**
 * Timezone helpers for tenant SLA business-hours math.
 * Uses IANA zones (e.g. Asia/Kolkata) via Intl — independent of server local TZ.
 */

export const DEFAULT_TENANT_TIMEZONE = "Asia/Kolkata";

const WEEKDAY_TO_DOW = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** @param {unknown} tz */
export function normalizeTimezone(tz) {
  const candidate = String(tz ?? DEFAULT_TENANT_TIMEZONE).trim() || DEFAULT_TENANT_TIMEZONE;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: candidate });
    return candidate;
  } catch {
    return DEFAULT_TENANT_TIMEZONE;
  }
}

/**
 * @param {Date} instant
 * @param {string} timeZone
 */
export function getZonedParts(instant, timeZone) {
  const tz = normalizeTimezone(timeZone);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = fmt.formatToParts(instant);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "0";
  const hourRaw = get("hour");
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(hourRaw === "24" ? "0" : hourRaw),
    minute: Number(get("minute")),
    second: Number(get("second")),
    dayOfWeek: WEEKDAY_TO_DOW[get("weekday")] ?? 0,
  };
}

/**
 * Convert a wall-clock instant in `timeZone` to UTC Date.
 * @param {{ year: number, month: number, day: number, hour?: number, minute?: number, second?: number }} local
 * @param {string} timeZone
 */
export function zonedLocalToUtc(local, timeZone) {
  const tz = normalizeTimezone(timeZone);
  const hour = local.hour ?? 0;
  const minute = local.minute ?? 0;
  const second = local.second ?? 0;
  let utcMs = Date.UTC(local.year, local.month - 1, local.day, hour, minute, second);
  for (let i = 0; i < 4; i += 1) {
    const parts = getZonedParts(new Date(utcMs), tz);
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const desired = Date.UTC(local.year, local.month - 1, local.day, hour, minute, second);
    utcMs += desired - asUtc;
  }
  return new Date(utcMs);
}

/**
 * @param {Date} instant
 * @param {number} days
 * @param {string} timeZone
 */
export function addCalendarDaysInZone(instant, days, timeZone) {
  const p = getZonedParts(instant, timeZone);
  const d = new Date(p.year, p.month - 1, p.day);
  d.setDate(d.getDate() + days);
  return zonedLocalToUtc(
    { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: p.hour, minute: p.minute, second: p.second },
    timeZone
  );
}
