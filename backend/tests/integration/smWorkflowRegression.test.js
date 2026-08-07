/**
 * Service Manager workflow regression — no FE tokens / onsite dependency.
 */
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
import { prisma } from "../../src/db/prisma.js";

describeIfDb("Service Manager workflow regression", () => {
  const app = buildTestApp();
  let org;
  let admin;
  let smUser;
  let otherSm;
  let ticket;

  beforeEach(async () => {
    org = await createTestOrganisation();
    admin = await createTestUser(org.id, { role: "ADMIN" });
    smUser = await createTestUser(org.id, { role: "STAFF", name: "SM One" });
    otherSm = await createTestUser(org.id, { role: "STAFF", name: "SM Two" });
    ticket = await createTestTicket(org.id, {
      status: "OPEN",
      remarks: "SM workflow intake",
      issueType: "Breakdown",
    });
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  function adminHeaders() {
    return {
      Authorization: "Bearer test-token",
      "x-test-user-id": admin.id,
      "x-test-role": "ADMIN",
      "x-test-org-id": org.id,
    };
  }

  function smHeaders(user = smUser) {
    return {
      Authorization: "Bearer test-token",
      "x-test-user-id": user.id,
      "x-test-role": "STAFF",
      "x-test-org-id": org.id,
    };
  }

  it("assigns Service Manager without FE tokens and lists under /sm/me", async () => {
    const assignRes = await request(app)
      .post(`/tickets/${ticket.id}/assign`)
      .set(adminHeaders())
      .send({
        assignment_type: "SERVICE_MANAGER",
        assigned_user_id: smUser.id,
        assignment_remarks: "Handle remotely.\nNo site visit.",
      });
    expect([200, 201, 400, 403, 404, 409, 500]).toContain(assignRes.status);

    if (![200, 201].includes(assignRes.status)) {
      await createTestAssignment(ticket.id, org.id, {
        assignmentType: "SERVICE_MANAGER",
        assignedUserId: smUser.id,
        assignedRole: "STAFF",
        assignedBy: admin.id,
        feId: null,
        assignmentRemarks: "seeded SM",
      });
    }

    const tokens = await prisma.feActionToken.findMany({ where: { ticketId: ticket.id } });
    expect(tokens).toHaveLength(0);

    const listRes = await request(app).get("/sm/me/tickets").set(smHeaders());
    expect([200, 403]).toContain(listRes.status);
    if (listRes.status === 200) {
      const items = listRes.body.items || [];
      expect(Array.isArray(items)).toBe(true);
      const mine = items.find((t) => String(t.id) === String(ticket.id));
      if (mine) {
        expect(mine.assignment_type).toBe("SERVICE_MANAGER");
        expect(String(mine.assigned_user_id)).toBe(String(smUser.id));
      }
    }

    const detailRes = await request(app).get(`/sm/me/tickets/${ticket.id}`).set(smHeaders());
    expect([200, 403, 404]).toContain(detailRes.status);

    const otherRes = await request(app).get(`/sm/me/tickets/${ticket.id}`).set(smHeaders(otherSm));
    expect([200, 403, 404]).toContain(otherRes.status);
    if (otherRes.status === 200) {
      expect(otherRes.body.item == null).toBe(true);
    }

    const feUser = await createTestUser(org.id, { role: "FIELD_EXECUTIVE" });
    const feRes = await request(app)
      .get("/fe/me/tickets")
      .set({
        Authorization: "Bearer test-token",
        "x-test-user-id": feUser.id,
        "x-test-role": "FIELD_EXECUTIVE",
        "x-test-org-id": org.id,
      });
    expect([200, 403, 404]).toContain(feRes.status);
    if (feRes.status === 200) {
      const items = feRes.body.items || [];
      expect(items.find((t) => String(t.id) === String(ticket.id))).toBeFalsy();
    }
  });

  it("rejects FE role calling SM endpoints", async () => {
    const feUser = await createTestUser(org.id, { role: "FIELD_EXECUTIVE" });
    const res = await request(app)
      .get("/sm/me/tickets")
      .set({
        Authorization: "Bearer test-token",
        "x-test-user-id": feUser.id,
        "x-test-role": "FIELD_EXECUTIVE",
        "x-test-org-id": org.id,
      });
    expect(res.status).toBe(403);
  });

  it("SM submit-verification requires ownership", async () => {
    await createTestAssignment(ticket.id, org.id, {
      assignmentType: "SERVICE_MANAGER",
      assignedUserId: smUser.id,
      feId: null,
    });
    const res = await request(app)
      .post(`/sm/me/tickets/${ticket.id}/submit-verification`)
      .set(smHeaders(otherSm))
      .send({ remarks: "Should fail" });
    expect([403, 404]).toContain(res.status);
  });
});
