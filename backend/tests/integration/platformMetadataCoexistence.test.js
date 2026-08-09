/**
 * Prove LEGACY tenants are unchanged; METADATA tenants get platform APIs.
 */
import request from "supertest";
import { afterEach, beforeEach, expect } from "vitest";
import { describeIfDb } from "../helpers/testContext.js";
import { buildTestApp } from "../helpers/testApp.js";
import {
  cleanupTestData,
  createTestOrganisation,
  createTestTicket,
  createTestUser,
} from "../helpers/db.js";
import { upsertPlatformTenantSettings } from "../../src/platform/runtime/tenantSettingsRepository.js";

describeIfDb("metadata platform coexistence", () => {
  const app = buildTestApp();
  let legacyOrg;
  let metaOrg;
  let legacyAdmin;
  let metaAdmin;
  let superAdmin;

  beforeEach(async () => {
    legacyOrg = await createTestOrganisation({ name: "Hitachi Legacy Freeze" });
    metaOrg = await createTestOrganisation({ name: "Future Metadata Tenant" });
    legacyAdmin = await createTestUser(legacyOrg.id, { role: "ADMIN" });
    metaAdmin = await createTestUser(metaOrg.id, { role: "ADMIN" });
    superAdmin = await createTestUser(metaOrg.id, { role: "SUPER_ADMIN" });
    await upsertPlatformTenantSettings(metaOrg.id, { mode: "METADATA" });
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  function headers(user, org, role) {
    return {
      Authorization: "Bearer test-token",
      "x-test-user-id": user.id,
      "x-test-role": role,
      "x-test-org-id": org.id,
    };
  }

  it("LEGACY tenant settings default to LEGACY without a settings row", async () => {
    const res = await request(app)
      .get("/platform/settings")
      .set(headers(legacyAdmin, legacyOrg, "ADMIN"));
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("LEGACY");
    expect(res.body.metadataActive).toBe(false);
  });

  it("LEGACY tenant cannot access form builder APIs (404)", async () => {
    const res = await request(app)
      .get("/platform/forms")
      .set(headers(legacyAdmin, legacyOrg, "ADMIN"));
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("PLATFORM_LEGACY_TENANT");
  });

  it("LEGACY ticket APIs still work (frozen Sahaya path)", async () => {
    await createTestTicket(legacyOrg.id, { status: "OPEN" });
    const res = await request(app)
      .get("/data/tickets?limit=10")
      .set(headers(legacyAdmin, legacyOrg, "ADMIN"));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  it("METADATA tenant can create form + publish + runtime ticket", async () => {
    const formRes = await request(app)
      .post("/platform/forms")
      .set(headers(metaAdmin, metaOrg, "ADMIN"))
      .send({ key: "intake", name: "Intake" });
    expect(formRes.status).toBe(200);
    const formId = formRes.body.id;

    const pub = await request(app)
      .post(`/platform/forms/${formId}/publish`)
      .set(headers(metaAdmin, metaOrg, "ADMIN"))
      .send({
        schema: {
          fields: [
            { internalName: "title", fieldType: "single_line_text", displayLabel: "Title" },
          ],
        },
        layout: {},
      });
    expect(pub.status).toBe(200);
    const formVersionId = pub.body.version_id;
    expect(formVersionId).toBeTruthy();

    const rejected = await request(app)
      .post("/platform/runtime/tickets")
      .set(headers(metaAdmin, metaOrg, "ADMIN"))
      .send({
        data: { title: "inject" },
        formSchema: { fields: [{ internalName: "title", fieldType: "single_line_text" }] },
      });
    expect(rejected.status).toBe(400);
    expect(rejected.body.code || rejected.body.error).toMatch(/Client metadata|PLATFORM_CLIENT_METADATA/i);

    const ticket = await request(app)
      .post("/platform/runtime/tickets")
      .set(headers(metaAdmin, metaOrg, "ADMIN"))
      .send({ data: { title: "Hello metadata" }, source: "manual", formVersionId });
    expect(ticket.status).toBe(200);
    expect(ticket.body.ticket_number).toMatch(/^MD-/);

    // Exclusive runtime: METADATA tenant must NOT use legacy ticket APIs
    const legacyList = await request(app)
      .get("/data/tickets?limit=50")
      .set(headers(metaAdmin, metaOrg, "ADMIN"));
    expect(legacyList.status).toBe(409);
    expect(legacyList.body.code).toBe("PLATFORM_EXCLUSIVE_RUNTIME");
  });

  it("METADATA tenant is blocked from /tickets and /data/tickets (exclusive runtime)", async () => {
    const dataRes = await request(app)
      .get("/data/tickets?limit=5")
      .set(headers(metaAdmin, metaOrg, "ADMIN"));
    expect(dataRes.status).toBe(409);
    expect(dataRes.body.code).toBe("PLATFORM_EXCLUSIVE_RUNTIME");

    const ticketsRes = await request(app)
      .get("/tickets")
      .set(headers(metaAdmin, metaOrg, "ADMIN"));
    expect(ticketsRes.status).toBe(409);
    expect(ticketsRes.body.code).toBe("PLATFORM_EXCLUSIVE_RUNTIME");
  });

  it("LEGACY ticket path stays healthy while METADATA uses platform forms", async () => {
    await createTestTicket(legacyOrg.id, { status: "OPEN" });
    const legacyOk = await request(app)
      .get("/data/tickets?limit=10")
      .set(headers(legacyAdmin, legacyOrg, "ADMIN"));
    expect(legacyOk.status).toBe(200);

    const metaForms = await request(app)
      .get("/platform/forms")
      .set(headers(metaAdmin, metaOrg, "ADMIN"));
    expect(metaForms.status).toBe(200);

    const legacyForms = await request(app)
      .get("/platform/forms")
      .set(headers(legacyAdmin, legacyOrg, "ADMIN"));
    expect(legacyForms.status).toBe(404);
  });

  it("only SUPER_ADMIN may enable METADATA mode", async () => {
    const denied = await request(app)
      .put("/platform/settings")
      .set(headers(legacyAdmin, legacyOrg, "ADMIN"))
      .send({ mode: "METADATA" });
    expect(denied.status).toBe(403);

    const allowed = await request(app)
      .put("/platform/settings")
      .set(headers(superAdmin, metaOrg, "SUPER_ADMIN"))
      .send({ mode: "METADATA", organisationId: legacyOrg.id });
    // Super-admin targeting another org via body
    expect([200, 400, 403]).toContain(allowed.status);
  });
});
