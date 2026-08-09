/**
 * Lightweight load + security probe (DB-backed when available).
 * Seeds a modest volume and asserts search/dashboard remain scoped and fast enough.
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
  trackCleanup,
} from "../helpers/db.js";
import { prisma } from "../../src/db/prisma.js";

describeIfDb("load + penetration smoke", () => {
  const app = buildTestApp();
  let orgA;
  let orgB;
  let adminA;
  let adminB;

  beforeEach(async () => {
    orgA = await createTestOrganisation({ name: "Load Org A" });
    orgB = await createTestOrganisation({ name: "Load Org B" });
    adminA = await createTestUser(orgA.id, { role: "ADMIN" });
    adminB = await createTestUser(orgB.id, { role: "ADMIN" });

    const batch = [];
    for (let i = 0; i < 40; i++) {
      batch.push(
        prisma.ticket.create({
          data: {
            ticketNumber: `LOAD-A-${Date.now()}-${i}`,
            status: i % 5 === 0 ? "RESOLVED" : "OPEN",
            organisationId: orgA.id,
            clientSlug: i % 2 === 0 ? "alpha" : "beta",
            vehicleNumber: `KA01L${String(i).padStart(4, "0")}`,
            location: `Loc ${i}`,
            complaintId: `CMP-LOAD-${i}`,
            source: "MANUAL",
          },
        })
      );
    }
    for (let i = 0; i < 10; i++) {
      batch.push(
        prisma.ticket.create({
          data: {
            ticketNumber: `LOAD-B-${Date.now()}-${i}`,
            status: "OPEN",
            organisationId: orgB.id,
            clientSlug: "other",
            vehicleNumber: `KA02L${String(i).padStart(4, "0")}`,
            location: `Other ${i}`,
            source: "MANUAL",
          },
        })
      );
    }
    const created = await Promise.all(batch);
    for (const t of created) trackCleanup("ticket", t.id);
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

  it("search stays tenant-scoped and completes under budget", async () => {
    const started = Date.now();
    const res = await request(app)
      .get("/data/tickets?search=CMP-LOAD&limit=20")
      .set(headers(adminA, orgA));
    const ms = Date.now() - started;
    expect(res.status).toBe(200);
    const items = res.body?.items || [];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((t) => t.organisation_id === orgA.id)).toBe(true);
    expect(ms).toBeLessThan(8000);
  });

  it("dashboard stats do not leak cross-tenant counts", async () => {
    const resA = await request(app).get("/data/dashboard/stats").set(headers(adminA, orgA));
    const resB = await request(app).get("/data/dashboard/stats").set(headers(adminB, orgB));
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    expect(Number(resA.body.totalTickets)).toBeGreaterThanOrEqual(40);
    expect(Number(resB.body.totalTickets)).toBeGreaterThanOrEqual(10);
    expect(Number(resA.body.totalTickets)).not.toBe(Number(resB.body.totalTickets));
  });

  it("blocks cross-tenant ticket GET", async () => {
    const foreign = await createTestTicket(orgB.id, { status: "OPEN" });
    const res = await request(app)
      .get(`/data/tickets/${foreign.id}`)
      .set(headers(adminA, orgA));
    expect([403, 404]).toContain(res.status);
  });
});
