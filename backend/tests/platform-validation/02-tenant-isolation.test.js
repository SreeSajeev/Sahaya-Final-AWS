/**
 * Cross-tenant isolation + input safety probes.
 */
import request from "supertest";
import { afterEach, beforeEach, expect } from "vitest";
import { describeIfDb } from "../helpers/testContext.js";
import { buildTestApp } from "../helpers/testApp.js";
import {
  cleanupTestData,
  createTestAssignment,
  createTestFieldExecutive,
  createTestOrganisation,
  createTestTenantClient,
  createTestTicket,
  createTestUser,
} from "../helpers/db.js";
import { authHeaders, expectStatus } from "./helpers/http.js";

describeIfDb("02 tenant isolation", () => {
  const app = buildTestApp();
  let orgA;
  let orgB;
  let orgC;
  let adminA;
  let adminB;
  let clientA;
  let feUserA;
  let feA;
  let feB;
  let ticketA;
  let ticketB;
  let ticketC;
  let clientSlugA;
  let clientSlugB;
  let superAdmin;

  beforeEach(async () => {
    orgA = await createTestOrganisation({ name: "PV Tenant A" });
    orgB = await createTestOrganisation({ name: "PV Tenant B" });
    orgC = await createTestOrganisation({ name: "PV Tenant C" });

    const tcA = await createTestTenantClient(orgA.id);
    const tcB = await createTestTenantClient(orgB.id);
    clientSlugA = tcA.slug;
    clientSlugB = tcB.slug;

    adminA = await createTestUser(orgA.id, { role: "ADMIN" });
    adminB = await createTestUser(orgB.id, { role: "ADMIN" });
    superAdmin = await createTestUser(orgA.id, { role: "SUPER_ADMIN" });
    clientA = await createTestUser(orgA.id, { role: "CLIENT", clientSlug: clientSlugA });
    feUserA = await createTestUser(orgA.id, { role: "FIELD_EXECUTIVE" });
    feA = await createTestFieldExecutive(orgA.id, { userId: feUserA.id });
    feB = await createTestFieldExecutive(orgB.id);

    ticketA = await createTestTicket(orgA.id, { status: "OPEN", clientSlug: clientSlugA });
    ticketB = await createTestTicket(orgB.id, { status: "OPEN", clientSlug: clientSlugB });
    ticketC = await createTestTicket(orgC.id, { status: "OPEN" });

    await createTestAssignment(ticketA.id, orgA.id, {
      feId: feA.id,
      assignmentType: "FIELD_EXECUTIVE",
    });
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  function h(user, role, org, extra = {}) {
    return authHeaders({
      userId: user.id,
      role,
      orgId: org.id,
      email: user.email,
      ...extra,
    });
  }

  it("Admin A cannot read/comment/assign on B ticket", async () => {
    const read = await request(app)
      .get(`/data/tickets/${ticketB.id}`)
      .set(h(adminA, "ADMIN", orgA));
    expect([403, 404]).toContain(read.status);

    const comment = await request(app)
      .post(`/data/tickets/${ticketB.id}/comments`)
      .set(h(adminA, "ADMIN", orgA))
      .send({ body: "cross-tenant probe", source: "STAFF" });
    expect([403, 404]).toContain(comment.status);

    const assign = await request(app)
      .post(`/tickets/${ticketB.id}/assign`)
      .set(h(adminA, "ADMIN", orgA))
      .send({ feId: feA.id });
    expect([403, 404]).toContain(assign.status);
  });

  it("Admin A cannot assign FE from B to ticket A", async () => {
    const res = await request(app)
      .post(`/tickets/${ticketA.id}/assign`)
      .set(h(adminA, "ADMIN", orgA))
      .send({
        assignment_type: "FIELD_EXECUTIVE",
        feId: feB.id,
        assignment_remarks: "cross-org FE",
      });
    expect([403, 400]).toContain(res.status);
    const msg = String(res.body?.error || JSON.stringify(res.body));
    expect(msg).toMatch(/Forbidden|organisation|belong|tenant|mismatch|Field executive/i);
  });

  it("Client A cannot see B tickets", async () => {
    const res = await request(app)
      .get("/data/tickets?limit=50")
      .set(h(clientA, "CLIENT", orgA, { clientSlug: clientSlugA }));
    expect(res.status).toBe(200);
    const items = res.body.items || res.body.data || [];
    expect(items.find((t) => String(t.id) === String(ticketB.id))).toBeFalsy();
    expect(items.find((t) => String(t.id) === String(ticketC.id))).toBeFalsy();
  });

  it("FE A cannot list B tickets", async () => {
    const listData = await request(app)
      .get("/data/tickets?limit=50")
      .set(h(feUserA, "FIELD_EXECUTIVE", orgA));
    expect(listData.status).toBe(200);
    const dataItems = listData.body.items || [];
    expect(dataItems.find((t) => String(t.id) === String(ticketB.id))).toBeFalsy();

    const feMe = await request(app)
      .get("/fe/me/tickets")
      .set(h(feUserA, "FIELD_EXECUTIVE", orgA));
    expectStatus(feMe, [200, 403], "FE me tickets");
    if (feMe.status === 200) {
      const items = feMe.body.items || [];
      expect(items.find((t) => String(t.id) === String(ticketB.id))).toBeFalsy();
    }
  });

  it("cross-tenant org stats only SUPER_ADMIN", async () => {
    const denied = await request(app)
      .get("/data/organisations/stats")
      .set(h(adminA, "ADMIN", orgA));
    expect(denied.status).toBe(403);

    const allowed = await request(app)
      .get("/data/organisations/stats")
      .set(h(superAdmin, "SUPER_ADMIN", orgA));
    expect(allowed.status).toBe(200);
  });

  it("SQL injection string in search does not 500", async () => {
    const payload = "'; DROP TABLE tickets; --";
    const res = await request(app)
      .get(`/data/tickets?search=${encodeURIComponent(payload)}&limit=10`)
      .set(h(adminA, "ADMIN", orgA));
    expect([200, 400]).toContain(res.status);
    expect(res.status).not.toBe(500);
  });

  it("invalid UUID returns 400", async () => {
    const res = await request(app)
      .get("/data/tickets/not-a-uuid")
      .set(h(adminA, "ADMIN", orgA));
    expect(res.status).toBe(400);
  });

  it("XSS payload in comment body must not 500", async () => {
    const xss = `<script>alert("xss")</script>`;
    const res = await request(app)
      .post(`/data/tickets/${ticketA.id}/comments`)
      .set(h(adminA, "ADMIN", orgA))
      .send({ body: xss, source: "STAFF" });
    expect([200, 201, 400, 403, 404, 422]).toContain(res.status);
    expect(res.status).not.toBe(500);
  });
});
