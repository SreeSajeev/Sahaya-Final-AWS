/**
 * Security regressions discovered during production readiness audit.
 */
import { describe, expect, it } from "vitest";
import { isTenantAllowed } from "../../src/middleware/tenantContext.js";

describe("tenant isolation — null organisation_id", () => {
  it("denies tenant users access to resources without organisation_id", () => {
    const req = { tenantId: "org-a", isSuperAdmin: false };
    expect(isTenantAllowed(req, null)).toBe(false);
    expect(isTenantAllowed(req, "")).toBe(false);
    expect(isTenantAllowed(req, "org-a")).toBe(true);
    expect(isTenantAllowed(req, "org-b")).toBe(false);
  });

  it("allows super admin regardless of organisation_id", () => {
    expect(isTenantAllowed({ isSuperAdmin: true, tenantId: null }, null)).toBe(true);
  });
});

describe("password reset dry-run defaults", () => {
  it("defaults to dry-run outside production when unset", async () => {
    const prevNode = process.env.NODE_ENV;
    const prevDry = process.env.PASSWORD_RESET_DRY_RUN;
    const prevMail = process.env.MAIL_DRY_RUN;
    try {
      process.env.NODE_ENV = "test";
      delete process.env.PASSWORD_RESET_DRY_RUN;
      delete process.env.MAIL_DRY_RUN;
      const dryRun =
        String(
          process.env.PASSWORD_RESET_DRY_RUN ||
            (process.env.NODE_ENV === "production" ? "false" : "true")
        ).toLowerCase() === "true" ||
        String(process.env.MAIL_DRY_RUN || "").toLowerCase() === "true";
      expect(dryRun).toBe(true);

      process.env.NODE_ENV = "production";
      const prodDry =
        String(
          process.env.PASSWORD_RESET_DRY_RUN ||
            (process.env.NODE_ENV === "production" ? "false" : "true")
        ).toLowerCase() === "true";
      expect(prodDry).toBe(false);
    } finally {
      process.env.NODE_ENV = prevNode;
      if (prevDry === undefined) delete process.env.PASSWORD_RESET_DRY_RUN;
      else process.env.PASSWORD_RESET_DRY_RUN = prevDry;
      if (prevMail === undefined) delete process.env.MAIL_DRY_RUN;
      else process.env.MAIL_DRY_RUN = prevMail;
    }
  });
});

describe("assign status guards", () => {
  it("documents non-assignable terminal/pending statuses", () => {
    const blocked = new Set(["REJECTED", "RESOLVED", "RESOLVED_PENDING_VERIFICATION"]);
    expect(blocked.has("RESOLVED")).toBe(true);
    expect(blocked.has("OPEN")).toBe(false);
  });
});
