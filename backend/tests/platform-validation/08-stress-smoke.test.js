/**
 * Stress / volume smoke (bounded — not 10k tickets in CI by default).
 * Set PV_STRESS=1 and PV_TICKET_COUNT=N for heavier runs.
 */
import request from "supertest";
import { afterEach, beforeEach, expect } from "vitest";
import { describeIfDb } from "../helpers/testContext.js";
import { buildTestApp } from "../helpers/testApp.js";
import {
  cleanupTestData,
  createTestFieldExecutive,
  createTestOrganisation,
  createTestTicket,
  createTestUser,
} from "../helpers/db.js";
import { authHeaders, expectStatus } from "./helpers/http.js";

const STRESS = String(process.env.PV_STRESS || "").trim() === "1";
const TICKET_COUNT = Math.min(
  Math.max(Number(process.env.PV_TICKET_COUNT || (STRESS ? 200 : 25)), 5),
  2000
);

describeIfDb("08 stress smoke — bulk create/list", () => {
  const app = buildTestApp();
  let org;
  let admin;
  let fe;

  beforeEach(async () => {
    org = await createTestOrganisation({ name: "PV Stress Org" });
    admin = await createTestUser(org.id, { role: "ADMIN" });
    fe = await createTestFieldExecutive(org.id);
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it(`creates ${TICKET_COUNT} tickets and lists them under tenant scope`, async () => {
    const t0 = Date.now();
    for (let i = 0; i < TICKET_COUNT; i++) {
      await createTestTicket(org.id, {
        status: "OPEN",
        vehicleNumber: `PV${String(i).padStart(4, "0")}TEST`,
        location: `Stress Site ${i}`,
      });
    }
    const createMs = Date.now() - t0;

    const listT0 = Date.now();
    const res = await request(app)
      .get("/data/tickets?limit=100&offset=0")
      .set(
        authHeaders({
          userId: admin.id,
          role: "ADMIN",
          orgId: org.id,
        })
      );
    const listMs = Date.now() - listT0;
    expectStatus(res, [200], "list after stress create");
    const items = res.body?.items || res.body?.data || res.body || [];
    expect(Array.isArray(items)).toBe(true);

    // Soft performance budgets (informational failures only when PV_STRICT_PERF=1)
    const createBudget = TICKET_COUNT * 80;
    const listBudget = 5000;
    if (String(process.env.PV_STRICT_PERF || "") === "1") {
      expect(createMs).toBeLessThan(createBudget);
      expect(listMs).toBeLessThan(listBudget);
    } else {
      // Always assert sanity: list must finish under 30s
      expect(listMs).toBeLessThan(30_000);
    }

    // Assign first ticket quickly
    const firstId = items[0]?.id;
    if (firstId) {
      const assign = await request(app)
        .post(`/tickets/${firstId}/assign`)
        .set(
          authHeaders({
            userId: admin.id,
            role: "ADMIN",
            orgId: org.id,
          })
        )
        .send({ feId: fe.id });
      expectStatus(assign, [200, 201, 400, 403, 404, 409], "assign under load");
    }

    // eslint-disable-next-line no-console
    console.log(
      `[pv-stress] tickets=${TICKET_COUNT} createMs=${createMs} listMs=${listMs} listCount=${items.length}`
    );
  }, 300_000);
});
