/**
 * Curated API surface smoke — ADMIN should not hit unexpected 404s.
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
import { authHeaders, expectStatus } from "./helpers/http.js";

/** @type {Array<{ method: string, path: string, body?: object, allow404?: boolean, note?: string }>} */
const SURFACE = [
  { method: "get", path: "/health" },
  { method: "get", path: "/data/tickets?limit=5" },
  { method: "get", path: "/data/tickets?limit=5&status=OPEN" },
  { method: "get", path: "/data/tickets?limit=5&unassignedOnly=true" },
  { method: "get", path: "/data/tickets?limit=5&needsReview=true" },
  { method: "get", path: "/data/dashboard/stats" },
  { method: "get", path: "/data/analytics/summary" },
  { method: "get", path: "/data/analytics/client-slugs" },
  { method: "get", path: "/data/field-executives?limit=20" },
  { method: "get", path: "/data/field-executives?activeOnly=false&limit=20" },
  { method: "get", path: "/data/users?limit=20" },
  { method: "get", path: "/data/organisations" },
  { method: "get", path: "/data/clients?limit=20" },
  { method: "get", path: "/data/audit-logs?limit=10" },
  { method: "get", path: "/data/raw-emails?limit=10" },
  { method: "get", path: "/data/sla/monitor" },
  { method: "get", path: "/data/sla/tracked-count" },
  { method: "get", path: "/data/tenant-sla" },
  { method: "get", path: "/data/configurations" },
  { method: "get", path: "/data/configurations/ticket_number_prefix" },
  { method: "get", path: "/data/platform/overview" },
  { method: "get", path: "/data/resolution-locations" },
  { method: "get", path: "/complaint-points" },
  { method: "get", path: "/platform/settings" },
  {
    method: "get",
    path: "/platform/forms",
    allow404: true,
    note: "LEGACY tenants return 404 PLATFORM_LEGACY_TENANT",
  },
  { method: "get", path: "/sm/me/tickets" },
  { method: "get", path: "/fe/me/tickets" },
  { method: "get", path: "/tickets" },
  { method: "get", path: "/tickets?limit=10" },
  {
    method: "post",
    path: "/tickets",
    body: {
      vehicle_number: "KA01SURF1",
      location: "Surface",
      category: "Breakdown",
      issue_type: "Other",
    },
  },
  { method: "post", path: "/tickets/import/preview", body: { rows: [{ vehicle_number: "KA01IMP1" }] } },
  { method: "get", path: "/data/ticket-assignments/by-fe?feIds=" },
  { method: "post", path: "/data/sla/by-ticket-ids", body: { ticket_ids: [] } },
  { method: "post", path: "/data/tickets-row-supplement", body: { ticket_ids: [] } },
  { method: "get", path: "/data/organisations/stats", note: "ADMIN → 403 expected" },
  { method: "post", path: "/field-executives", body: { name: "Surface FE Probe" } },
  { method: "get", path: "/data/clients?limit=5&status=active" },
  { method: "get", path: "/data/audit-logs?limit=5&offset=0" },
  { method: "get", path: "/data/raw-emails?limit=5&offset=0" },
  { method: "get", path: "/data/users?limit=5&offset=0" },
];

describeIfDb("06 API surface smoke", () => {
  const app = buildTestApp();
  let org;
  let admin;

  beforeEach(async () => {
    org = await createTestOrganisation({ name: "PV Surface Org" });
    admin = await createTestUser(org.id, { role: "ADMIN" });
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it("hits ~40 curated endpoints as ADMIN without unexpected 404", async () => {
    const headers = authHeaders({
      userId: admin.id,
      role: "ADMIN",
      orgId: org.id,
      email: admin.email,
    });

    const results = [];
    for (const ep of SURFACE) {
      let req = request(app)[ep.method](ep.path);
      if (ep.path !== "/health") req = req.set(headers);
      if (ep.body) req = req.send(ep.body);
      const res = await req;

      if (ep.path === "/health") {
        expectStatus(res, [200], "GET /health");
      } else if (ep.path === "/data/organisations/stats") {
        // ADMIN must not get cross-tenant stats
        expectStatus(res, [403], "GET org stats as ADMIN");
      } else if (ep.allow404) {
        expectStatus(res, [200, 201, 400, 403, 404, 409, 422], `${ep.method} ${ep.path}`);
      } else {
        expect(
          res.status,
          `${ep.method.toUpperCase()} ${ep.path} unexpected 404 (gated wrongly?). body=${JSON.stringify(res.body).slice(0, 200)}`
        ).not.toBe(404);
        expectStatus(
          res,
          [200, 201, 400, 403, 409, 413, 415, 422, 500],
          `${ep.method.toUpperCase()} ${ep.path}`
        );
      }
      results.push({ path: ep.path, status: res.status, note: ep.note || null });
    }

    expect(results.length).toBeGreaterThanOrEqual(25);
  });
});
