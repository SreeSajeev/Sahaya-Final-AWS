/**
 * Contract tests for frontend priority display helpers (mirrored from frontend/src/lib/priority.ts).
 * Ensures LOW/MEDIUM/HIGH text labels remain stable without star-based presentation.
 */
import { describe, expect, it } from "vitest";

/** Keep in sync with frontend/src/lib/priority.ts */
const PRIORITY_LEVELS = ["LOW", "MEDIUM", "HIGH"];
const DEFAULT_PRIORITY_LEVEL = "MEDIUM";

function normalizePriorityLevel(value, fallback) {
  if (typeof value === "string") {
    const s = value.trim().toUpperCase();
    if (s === "CRITICAL") return "HIGH";
    if (PRIORITY_LEVELS.includes(s)) return s;
  }
  if (value === true) return "HIGH";
  if (value === false && fallback == null) return "LOW";
  return fallback ?? null;
}

function resolveTicketPriorityLevel(ticket) {
  const fromLevel = normalizePriorityLevel(ticket.priority_level);
  if (fromLevel) return fromLevel;
  if (ticket.priority === true) return "HIGH";
  if (ticket.priority === false) return "LOW";
  return DEFAULT_PRIORITY_LEVEL;
}

function priorityDisplayLabel(level) {
  return level;
}

describe("priority display contract (UX batch 1)", () => {
  it("renders uppercase LOW/MEDIUM/HIGH labels", () => {
    expect(priorityDisplayLabel("LOW")).toBe("LOW");
    expect(priorityDisplayLabel("MEDIUM")).toBe("MEDIUM");
    expect(priorityDisplayLabel("HIGH")).toBe("HIGH");
  });

  it("resolves priority_level over legacy boolean", () => {
    expect(resolveTicketPriorityLevel({ priority_level: "medium", priority: true })).toBe("MEDIUM");
    expect(resolveTicketPriorityLevel({ priority_level: "critical", priority: true })).toBe("HIGH");
    expect(resolveTicketPriorityLevel({ priority: true })).toBe("HIGH");
    expect(resolveTicketPriorityLevel({ priority: false })).toBe("LOW");
    expect(resolveTicketPriorityLevel({})).toBe("MEDIUM");
  });
});
