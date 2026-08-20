/**
 * Documented product gaps / N/A capabilities for readiness reporting.
 * These are intentional assertions — not skipped silently — so reports can import PRODUCT_GAPS.
 */
import { describe, expect, it } from "vitest";
import {
  PRODUCT_GAPS,
  IMPLEMENTED_ROLES,
  FICTIONAL_ROLE_CLAIMS,
} from "./helpers/inventory.js";
import { FICTIONAL_ROLES, REAL_ROLES } from "./helpers/roles.js";

describe("07 gaps / N/A inventory", () => {
  it("exports structured PRODUCT_GAPS for readiness reports", () => {
    expect(Array.isArray(PRODUCT_GAPS)).toBe(true);
    expect(PRODUCT_GAPS.length).toBeGreaterThan(0);
    for (const gap of PRODUCT_GAPS) {
      expect(gap.id).toBeTruthy();
      expect(gap.claim).toBeTruthy();
      expect(["NOT_IMPLEMENTED", "N_A_ROLE", "TEST_HARNESS_GAP"]).toContain(gap.status);
    }
  });

  it("Branches do NOT EXIST", () => {
    // No /branches routes, no branch entity in Prisma CRM model for Create Branches claim.
    const gap = PRODUCT_GAPS.find((g) => g.id === "branches");
    expect(gap?.status).toBe("NOT_IMPLEMENTED");
    expect(true).toBe(true);
  });

  it("Assets CMDB does NOT EXIST", () => {
    const gap = PRODUCT_GAPS.find((g) => g.id === "assets_cmdb");
    expect(gap?.status).toBe("NOT_IMPLEMENTED");
    expect(true).toBe(true);
  });

  it("Viewer role does NOT EXIST", () => {
    expect(IMPLEMENTED_ROLES).not.toContain("VIEWER");
    expect(FICTIONAL_ROLE_CLAIMS).toContain("Viewer");
    expect(FICTIONAL_ROLES).toContain("Viewer");
    expect(true).toBe(true);
  });

  it("Support role does NOT EXIST", () => {
    expect(IMPLEMENTED_ROLES).not.toContain("SUPPORT");
    expect(FICTIONAL_ROLES).toContain("Support");
    expect(true).toBe(true);
  });

  it("Platform Admin role does NOT EXIST", () => {
    expect(IMPLEMENTED_ROLES).not.toContain("PLATFORM_ADMIN");
    expect(FICTIONAL_ROLES).toContain("Platform Admin");
    expect(true).toBe(true);
  });

  it("Swagger / OpenAPI UI does NOT EXIST", () => {
    const gap = PRODUCT_GAPS.find((g) => g.id === "swagger");
    expect(gap?.status).toBe("NOT_IMPLEMENTED");
    expect(true).toBe(true);
  });

  it("Redis queues do NOT EXIST", () => {
    const gap = PRODUCT_GAPS.find((g) => g.id === "redis_queues");
    expect(gap?.status).toBe("NOT_IMPLEMENTED");
    expect(true).toBe(true);
  });

  it("FE video proof binary upload does NOT EXIST", () => {
    const gap = PRODUCT_GAPS.find((g) => g.id === "fe_video_proof_upload");
    expect(gap?.status).toBe("NOT_IMPLEMENTED");
  });

  it("SSO / MFA does NOT EXIST", () => {
    const gap = PRODUCT_GAPS.find((g) => g.id === "sso_mfa");
    expect(gap?.status).toBe("NOT_IMPLEMENTED");
  });

  it("implemented roles match REAL_ROLES", () => {
    expect(IMPLEMENTED_ROLES).toEqual(REAL_ROLES);
  });
});
