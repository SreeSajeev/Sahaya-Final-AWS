import { describe, expect, it } from "vitest";
import { normalizePriorityLevelString } from "../../src/utils/normalizeTicketPriority.js";

describe("legacy CRITICAL priority normalization", () => {
  it("maps CRITICAL to HIGH without DB mutation", () => {
    expect(normalizePriorityLevelString("CRITICAL")).toBe("HIGH");
    expect(normalizePriorityLevelString("critical")).toBe("HIGH");
  });

  it("still accepts canonical levels", () => {
    expect(normalizePriorityLevelString("MEDIUM")).toBe("MEDIUM");
    expect(normalizePriorityLevelString("UNKNOWN")).toBeNull();
  });
});
