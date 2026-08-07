import { describe, expect, it } from "vitest";
import { validateCloseFormSnapshot } from "../../src/services/closeFormService.js";
import { isCommentImagesHidden } from "../../src/services/imageVisibilityService.js";

describe("close form snapshot validation", () => {
  const fields = [
    { id: "work_done", label: "Work done", required: true, displayOrder: 0, fieldType: "textarea" },
    { id: "rating", label: "Rating", required: false, displayOrder: 1, fieldType: "dropdown", options: ["Good", "Poor"] },
  ];

  it("rejects an omitted required value", () => {
    expect(validateCloseFormSnapshot(fields, {}).ok).toBe(false);
  });

  it("stores immutable definitions and normalized values", () => {
    const result = validateCloseFormSnapshot(fields, { work_done: " replaced belt ", rating: "Good" });
    expect(result.ok).toBe(true);
    expect(result.snapshot.values).toEqual({ work_done: "replaced belt", rating: "Good" });
    expect(result.snapshot.fields).toEqual(fields);
  });
});

describe("image visibility", () => {
  it("recognizes both current visibility metadata and legacy assignment deletion", () => {
    expect(isCommentImagesHidden({ image_visibility: { hidden_at: "2026-01-01T00:00:00Z" } })).toBe(true);
    expect(isCommentImagesHidden({ assignment_context: { deleted_at: "2026-01-01T00:00:00Z" } })).toBe(true);
    expect(isCommentImagesHidden({ images: [] })).toBe(false);
  });
});
