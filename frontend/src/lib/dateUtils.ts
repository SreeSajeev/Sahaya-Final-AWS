/**
 * Indian Standard Time (IST, Asia/Kolkata) utilities.
 * All user-facing dates/times and date-range logic use IST.
 * Uses Intl.DateTimeFormat with explicit timeZone so display is always IST regardless of system/browser timezone.
 */

export const IST_TIMEZONE = "Asia/Kolkata";

const IST_BASE: Intl.DateTimeFormatOptions = {
  timeZone: IST_TIMEZONE,
};

/**
 * Parse input to a Date, treating ISO-like strings without timezone as UTC.
 * This avoids JavaScript interpreting "2025-02-25T05:37:00" as local time (e.g. GST).
 */
function parseAsUTC(date: Date | string | number): Date {
  if (typeof date === "object" && date !== null && "getTime" in date) {
    return date as Date;
  }
  if (typeof date === "number") {
    return new Date(date);
  }
  const s = String(date).trim();
  // ISO datetime without Z or ±offset: treat as UTC (backend typically stores UTC)
  // so we don't interpret as browser local (e.g. GST) and then format to IST correctly
  const hasTz = /[Zz]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s);
  if (!hasTz && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(s)) {
    return new Date(s + "Z");
  }
  return new Date(s);
}

function formatInIST(d: Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-IN", { ...IST_BASE, ...options }).format(d);
}

/**
 * Format a date for display in Indian Standard Time (IST).
 */
export function formatIST(
  date: Date | string | number,
  format:
    | "PPpp"
    | "PPp"
    | "MMM d, yyyy"
    | "MMM d, HH:mm"
    | "yyyy-MM-dd"
    | "MMM d, yyyy HH:mm:ss"
    | "EEE MM/dd"
): string {
  const d = parseAsUTC(date);
  if (isNaN(d.getTime())) return "—";

  switch (format) {
    case "PPpp":
      return formatInIST(d, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    case "PPp":
      return formatInIST(d, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    case "MMM d, yyyy":
      return formatInIST(d, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    case "MMM d, HH:mm":
      return formatInIST(d, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    case "yyyy-MM-dd": {
      // Build yyyy-MM-dd from IST date parts (en-IN is typically DD/MM/YYYY)
      const formatter = new Intl.DateTimeFormat("en-IN", {
        ...IST_BASE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const parts = formatter.formatToParts(d);
      const y = parts.find((p) => p.type === "year")?.value ?? "";
      const m = parts.find((p) => p.type === "month")?.value ?? "";
      const day = parts.find((p) => p.type === "day")?.value ?? "";
      if (y && m && day) return `${y}-${m}-${day}`;
      return d.toISOString().slice(0, 10);
    }
    case "MMM d, yyyy HH:mm:ss":
      return formatInIST(d, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    case "EEE MM/dd":
      return formatInIST(d, {
        weekday: "short",
        month: "2-digit",
        day: "2-digit",
      });
    default:
      return formatInIST(d, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
  }
}

/**
 * Start of day (00:00:00.000) in IST for date string yyyy-MM-dd.
 * Returns a Date (UTC) for use in ISO queries.
 */
export function getStartOfDayIST(dateStr: string): Date {
  return new Date(`${dateStr.trim()}T00:00:00+05:30`);
}

/**
 * End of day (23:59:59.999) in IST for date string yyyy-MM-dd.
 * Returns a Date (UTC) for use in ISO queries.
 */
export function getEndOfDayIST(dateStr: string): Date {
  return new Date(`${dateStr.trim()}T23:59:59.999+05:30`);
}

/**
 * Current date in IST as yyyy-MM-dd (e.g. for filenames or default picker).
 */
export function todayIST(): string {
  return formatIST(new Date(), "yyyy-MM-dd");
}
