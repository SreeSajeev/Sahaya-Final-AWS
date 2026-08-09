/**
 * Metadata Platform — unit tests (no DB required for mode gate / schema validation).
 */
import { describe, expect, it } from "vitest";
import {
  PLATFORM_MODES,
  resolvePlatformMode,
  isLegacyMode,
  isMetadataMode,
} from "../../src/platform/runtime/platformMode.js";
import { validateFormSchema, PLATFORM_FIELD_TYPES } from "../../src/platform/forms/formSchema.js";

describe("platform mode (LEGACY default)", () => {
  it("treats missing settings as LEGACY", () => {
    expect(resolvePlatformMode(null)).toBe(PLATFORM_MODES.LEGACY);
    expect(resolvePlatformMode(undefined)).toBe(PLATFORM_MODES.LEGACY);
    expect(resolvePlatformMode({})).toBe(PLATFORM_MODES.LEGACY);
    expect(isLegacyMode(null)).toBe(true);
    expect(isMetadataMode(null)).toBe(false);
  });

  it("only METADATA string enables metadata mode", () => {
    expect(resolvePlatformMode({ mode: "METADATA" })).toBe(PLATFORM_MODES.METADATA);
    expect(resolvePlatformMode({ mode: "metadata" })).toBe(PLATFORM_MODES.METADATA);
    expect(resolvePlatformMode({ mode: "LEGACY" })).toBe(PLATFORM_MODES.LEGACY);
    expect(resolvePlatformMode({ mode: "something-else" })).toBe(PLATFORM_MODES.LEGACY);
  });
});

describe("form schema validation", () => {
  it("accepts a minimal valid schema", () => {
    const result = validateFormSchema({
      fields: [
        { internalName: "title", fieldType: "single_line_text" },
        { internalName: "priority", fieldType: "dropdown" },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects unknown field types and duplicates", () => {
    expect(
      validateFormSchema({
        fields: [{ internalName: "x", fieldType: "vehicle_number" }],
      }).ok
    ).toBe(false);
    expect(
      validateFormSchema({
        fields: [
          { internalName: "a", fieldType: "email" },
          { internalName: "a", fieldType: "phone" },
        ],
      }).ok
    ).toBe(false);
  });

  it("exposes a non-empty field type catalog", () => {
    expect(PLATFORM_FIELD_TYPES.length).toBeGreaterThan(10);
    expect(PLATFORM_FIELD_TYPES).toContain("signature");
  });
});
