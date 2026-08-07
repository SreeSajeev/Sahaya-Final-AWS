/**
 * Cross-tenant / forged-id / inactive master security isolation.
 */
import crypto from "crypto";
import request from "supertest";
import { afterEach, beforeEach, expect } from "vitest";
import { describeIfDb } from "../helpers/testContext.js";
import { buildTestApp } from "../helpers/testApp.js";
import {
  cleanupTestData,
  createTestAssignment,
  createTestOrganisation,
  createTestTicket,
  createTestUser,
} from "../helpers/db.js";

describeIfDb("security isolation regression", () => {
  const app = buildTestApp();
  let orgA;
  let orgB;
  let adminA;
  let adminB;
  let ticketA;
  let ticketB;

  beforeEach(async () => {
    orgA = await createTestOrganisation({ name: "Tenant A" });
    orgB = await createTestOrganisation({ name: "Tenant B" });
    adminA = await createTestUser(orgA.id, { role: "ADMIN" });
    adminB = await createTestUser(orgB.id, { role: "ADMIN" });
    ticketA = await createTestTicket(orgA.id, { status: "OPEN" });
    ticketB = await createTestTicket(orgB.id, { status: "OPEN" });
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  function headers(user, org) {
    return {
      Authorization: "Bearer test-token",
      "x-test-user-id": user.id,
      "x-test-role": "ADMIN",
      "x-test-org-id": org.id,
    };
  }

  it("blocks cross-tenant ticket comment access", async () => {
    const res = await request(app)
      .post(`/data/tickets/${ticketA.id}/comments`)
      .set(headers(adminB, orgB))
      .send({ body: "cross tenant probe", source: "STAFF" });
    expect([403, 404]).toContain(res.status);
  });

  it("blocks forged ticket id close", async () => {
    const forged = crypto.randomUUID();
    const res = await request(app)
      .post(`/tickets/${forged}/close`)
      .set(headers(adminA, orgA))
      .send({ verification_remarks: "noop" });
    expect([403, 404]).toContain(res.status);
  });

  it("blocks SM from opening another tenant SM ticket", async () => {
    const smA = await createTestUser(orgA.id, { role: "STAFF" });
    const smB = await createTestUser(orgB.id, { role: "STAFF" });
    await createTestAssignment(ticketA.id, orgA.id, {
      assignmentType: "SERVICE_MANAGER",
      assignedUserId: smA.id,
      feId: null,
    });
    const res = await request(app)
      .get(`/sm/me/tickets/${ticketA.id}`)
      .set({
        Authorization: "Bearer test-token",
        "x-test-user-id": smB.id,
        "x-test-role": "STAFF",
        "x-test-org-id": orgB.id,
      });
    expect([200, 403, 404]).toContain(res.status);
    if (res.status === 200) expect(res.body.item == null).toBe(true);
  });

  it("blocks tenant B listing tenant A tickets via data API", async () => {
    const res = await request(app).get("/data/tickets").set(headers(adminB, orgB));
    expect(res.status).toBe(200);
    const items = res.body.items || res.body.data || [];
    expect(items.find((t) => String(t.id) === String(ticketA.id))).toBeFalsy();
    expect(items.find((t) => String(t.id) === String(ticketB.id))).toBeTruthy();
  });
});
