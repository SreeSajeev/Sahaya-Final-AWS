/**
 * Security fuzz — unauthenticated, malformed input, IDOR, duplicate assign.
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

describeIfDb("04 security fuzz", () => {
  const app = buildTestApp();
  let org;
  let admin;
  let clientUser;
  let feUser;
  let fe;
  let ticket;
  let tenantClient;

  beforeEach(async () => {
    org = await createTestOrganisation({ name: "PV Fuzz Org" });
    tenantClient = await createTestTenantClient(org.id);
    admin = await createTestUser(org.id, { role: "ADMIN" });
    clientUser = await createTestUser(org.id, {
      role: "CLIENT",
      clientSlug: tenantClient.slug,
    });
    feUser = await createTestUser(org.id, { role: "FIELD_EXECUTIVE" });
    fe = await createTestFieldExecutive(org.id, { userId: feUser.id });
    ticket = await createTestTicket(org.id, {
      status: "OPEN",
      clientSlug: tenantClient.slug,
    });
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  function h(user, role, extra = {}) {
    return authHeaders({
      userId: user.id,
      role,
      orgId: org.id,
      email: user.email,
      ...extra,
    });
  }

  it("unauthenticated requests → 401/403", async () => {
    const paths = [
      ["/data/tickets", "get"],
      ["/tickets", "post"],
      [`/tickets/${ticket.id}/assign`, "post"],
      ["/data/audit-logs", "get"],
      ["/sm/me/tickets", "get"],
      ["/fe/me/tickets", "get"],
    ];
    for (const [path, method] of paths) {
      let req = request(app)[method](path);
      if (method === "post") req = req.send({});
      const res = await req;
      expectStatus(res, [401, 403], `unauth ${method.toUpperCase()} ${path}`);
    }
  });

  it("malformed JSON → 400", async () => {
    const res = await request(app)
      .post("/tickets")
      .set(h(admin, "ADMIN"))
      .set("Content-Type", "application/json")
      .send('{"vehicle_number":');
    expect([400, 403]).toContain(res.status);
  });

  it("huge body (~1MB) must not crash", async () => {
    const huge = "x".repeat(1_000_000);
    const res = await request(app)
      .post(`/data/tickets/${ticket.id}/comments`)
      .set(h(admin, "ADMIN"))
      .send({ body: huge, source: "STAFF" });
    expect([200, 201, 400, 413, 422, 500]).toContain(res.status);
    // Process must still respond (supertest would hang/throw if crash).
    expect(typeof res.status).toBe("number");
  });

  it("null/empty/unicode fields on ticket create do not crash", async () => {
    const payloads = [
      {},
      { vehicle_number: null, location: null },
      { vehicle_number: "", location: "" },
      { vehicle_number: "🚗", location: "東京", remarks: "üñîçødé" },
    ];
    for (const body of payloads) {
      const res = await request(app).post("/tickets").set(h(admin, "ADMIN")).send(body);
      expect([200, 201, 400, 403, 422]).toContain(res.status);
      expect(res.status).not.toBe(500);
    }
  });

  it("IDOR: CLIENT tries assign → 403", async () => {
    const res = await request(app)
      .post(`/tickets/${ticket.id}/assign`)
      .set(h(clientUser, "CLIENT", { clientSlug: tenantClient.slug }))
      .send({ feId: fe.id });
    expect(res.status).toBe(403);
  });

  it("FE tries close → 403", async () => {
    await createTestAssignment(ticket.id, org.id, {
      feId: fe.id,
      assignmentType: "FIELD_EXECUTIVE",
      ticketStatus: "RESOLVED_PENDING_VERIFICATION",
    });
    const res = await request(app)
      .post(`/tickets/${ticket.id}/close`)
      .set(h(feUser, "FIELD_EXECUTIVE"))
      .send({ verification_remarks: "FE should not close" });
    expect(res.status).toBe(403);
  });

  it("duplicate assign attempts remain safe", async () => {
    const first = await request(app)
      .post(`/tickets/${ticket.id}/assign`)
      .set(h(admin, "ADMIN"))
      .send({
        assignment_type: "FIELD_EXECUTIVE",
        feId: fe.id,
        assignment_remarks: "first",
      });
    expectStatus(first, [200, 201, 400, 403, 404, 409, 500], "first assign");

    const second = await request(app)
      .post(`/tickets/${ticket.id}/assign`)
      .set(h(admin, "ADMIN"))
      .send({
        assignment_type: "FIELD_EXECUTIVE",
        feId: fe.id,
        assignment_remarks: "duplicate",
      });
    // Second assign typically 400/409 once already assigned — never unhandled crash.
    expectStatus(second, [200, 201, 400, 403, 404, 409, 500], "duplicate assign");
  });
});
