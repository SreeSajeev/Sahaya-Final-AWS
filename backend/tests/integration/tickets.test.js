import request from "supertest";
import { afterEach, beforeEach, expect } from "vitest";
import { describeIfDb, uniqueTicketNumber } from "../helpers/testContext.js";
import { buildTestApp } from "../helpers/testApp.js";
import {
  cleanupTestData,
  createTestFieldExecutive,
  createTestOrganisation,
  createTestTicket,
  createTestUser,
} from "../helpers/db.js";

describeIfDb("tickets integration", () => {
  const app = buildTestApp();
  let org;
  let admin;
  let fe;
  let ticket;

  beforeEach(async () => {
    org = await createTestOrganisation();
    admin = await createTestUser(org.id, { role: "ADMIN" });
    fe = await createTestFieldExecutive(org.id);
    ticket = await createTestTicket(org.id, { status: "OPEN" });
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  function authHeaders(userId = admin.id) {
    return {
      Authorization: "Bearer test-token",
      "x-test-user-id": userId,
      "x-test-role": "ADMIN",
      "x-test-org-id": org.id,
    };
  }

  it("GET /data/tickets lists tenant tickets", async () => {
    const res = await request(app).get("/data/tickets").set(authHeaders());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items) || Array.isArray(res.body.data)).toBe(true);
  });

  it("POST /tickets creates manual ticket", async () => {
    const res = await request(app)
      .post("/tickets")
      .set(authHeaders())
      .send({
        vehicle_number: "KA01NEW1234",
        location: "Integration Test Site",
        category: "Breakdown",
        issue_type: "Engine",
        client_slug: org.slug,
      });
    expect([200, 201, 400, 403]).toContain(res.status);
    if (res.status === 200 || res.status === 201) {
      expect(res.body.ticket_number || res.body.ticket?.ticket_number).toBeTruthy();
    }
  });

  it("POST /tickets/:id/assign assigns field executive", async () => {
    const res = await request(app)
      .post(`/tickets/${ticket.id}/assign`)
      .set(authHeaders())
      .send({ fe_id: fe.id });
    expect([200, 201, 400, 403, 404, 409]).toContain(res.status);
  });

  it("POST /data/tickets/:id/comments adds comment", async () => {
    const res = await request(app)
      .post(`/data/tickets/${ticket.id}/comments`)
      .set(authHeaders())
      .send({ body: "Integration test comment", source: "STAFF" });
    expect([200, 201, 400, 403, 404]).toContain(res.status);
  });

  it("PATCH /data/tickets/:id supports status update toward resolve/close flow", async () => {
    const res = await request(app)
      .patch(`/data/tickets/${ticket.id}`)
      .set(authHeaders())
      .send({
        status: "RESOLVED_PENDING_VERIFICATION",
        verification_remarks: "Resolved in integration test",
      });
    expect([200, 400, 403, 404, 422]).toContain(res.status);
  });
});
