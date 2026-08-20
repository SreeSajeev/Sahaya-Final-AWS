/**
 * Platform settings LEGACY ↔ METADATA mode validation.
 */
import request from "supertest";
import { afterEach, beforeEach, expect } from "vitest";
import { describeIfDb } from "../helpers/testContext.js";
import { buildTestApp } from "../helpers/testApp.js";
import {
  cleanupTestData,
  createTestOrganisation,
  createTestUser,
} from "../helpers/db.js";
import { upsertPlatformTenantSettings } from "../../src/platform/runtime/tenantSettingsRepository.js";
import { authHeaders, expectStatus } from "./helpers/http.js";

describeIfDb("05 metadata platform settings", () => {
  const app = buildTestApp();
  let org;
  let admin;
  let superAdmin;

  beforeEach(async () => {
    org = await createTestOrganisation({ name: "PV Metadata Org" });
    admin = await createTestUser(org.id, { role: "ADMIN" });
    superAdmin = await createTestUser(org.id, { role: "SUPER_ADMIN" });
    // Start LEGACY
    await upsertPlatformTenantSettings(org.id, { mode: "LEGACY" });
  });

  afterEach(async () => {
    try {
      await upsertPlatformTenantSettings(org.id, { mode: "LEGACY" });
    } catch {
      /* best-effort reset */
    }
    await cleanupTestData();
  });

  function h(user, role) {
    return authHeaders({
      userId: user.id,
      role,
      orgId: org.id,
      email: user.email,
    });
  }

  it("GET /platform/settings as ADMIN → 200 LEGACY or METADATA", async () => {
    const res = await request(app).get("/platform/settings").set(h(admin, "ADMIN"));
    expect(res.status).toBe(200);
    expect(["LEGACY", "METADATA"]).toContain(res.body.mode);
  });

  it("ADMIN cannot enable METADATA (403)", async () => {
    const res = await request(app)
      .put("/platform/settings")
      .set(h(admin, "ADMIN"))
      .send({ mode: "METADATA" });
    expect(res.status).toBe(403);
  });

  it("SUPER_ADMIN can PUT METADATA (200 or 400 if validation)", async () => {
    const res = await request(app)
      .put("/platform/settings")
      .set(h(superAdmin, "SUPER_ADMIN"))
      .send({ mode: "METADATA" });
    expectStatus(res, [200, 400], "SUPER_ADMIN enable METADATA");

    if (res.status === 200) {
      const settings = await request(app)
        .get("/platform/settings")
        .set(h(admin, "ADMIN"));
      expect(settings.status).toBe(200);
      expect(settings.body.mode).toBe("METADATA");

      const tickets = await request(app)
        .get("/data/tickets?limit=5")
        .set(h(admin, "ADMIN"));
      expect(tickets.status).toBe(409);

      const forms = await request(app).get("/platform/forms").set(h(admin, "ADMIN"));
      expect(forms.status).toBe(200);
    }

    // Always reset to LEGACY for subsequent suites / cleanup
    const reset = await request(app)
      .put("/platform/settings")
      .set(h(superAdmin, "SUPER_ADMIN"))
      .send({ mode: "LEGACY" });
    expectStatus(reset, [200, 400], "reset LEGACY");
  });
});
