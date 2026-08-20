/**
 * Role matrix — allow/deny for key endpoints across REAL_ROLES.
 */
import request from "supertest";
import { afterEach, beforeEach, expect } from "vitest";
import { describeIfDb } from "../helpers/testContext.js";
import { buildTestApp } from "../helpers/testApp.js";
import {
  cleanupTestData,
  createTestFieldExecutive,
  createTestOrganisation,
  createTestTenantClient,
  createTestTicket,
  createTestUser,
} from "../helpers/db.js";
import { authHeaders, expectStatus } from "./helpers/http.js";
import { REAL_ROLES, FICTIONAL_ROLES, buildRoleMatrix } from "./helpers/roles.js";

describeIfDb("03 role matrix", () => {
  const app = buildTestApp();
  let org;
  let usersByRole;
  let ticket;
  let fe;
  let pendingUser;
  let tenantClient;

  beforeEach(async () => {
    org = await createTestOrganisation({ name: "PV Role Matrix Org" });
    tenantClient = await createTestTenantClient(org.id);

    usersByRole = {
      SUPER_ADMIN: await createTestUser(org.id, { role: "SUPER_ADMIN" }),
      ADMIN: await createTestUser(org.id, { role: "ADMIN" }),
      STAFF: await createTestUser(org.id, { role: "STAFF" }),
      FIELD_EXECUTIVE: await createTestUser(org.id, { role: "FIELD_EXECUTIVE" }),
      CLIENT: await createTestUser(org.id, {
        role: "CLIENT",
        clientSlug: tenantClient.slug,
      }),
    };

    fe = await createTestFieldExecutive(org.id, {
      userId: usersByRole.FIELD_EXECUTIVE.id,
    });
    ticket = await createTestTicket(org.id, {
      status: "OPEN",
      clientSlug: tenantClient.slug,
    });
    pendingUser = await createTestUser(org.id, {
      role: "STAFF",
      name: "Pending Approval",
    });
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it("documents real vs fictional roles", () => {
    expect(REAL_ROLES).toEqual(
      expect.arrayContaining(["SUPER_ADMIN", "ADMIN", "STAFF", "FIELD_EXECUTIVE", "CLIENT"])
    );
    expect(FICTIONAL_ROLES.length).toBeGreaterThan(0);
  });

  it("enforces ROLE_MATRIX allow/deny cases", async () => {
    const cases = buildRoleMatrix({
      ticketId: ticket.id,
      feId: fe.id,
      pendingUserId: pendingUser.id,
      clientSlug: tenantClient.slug,
      orgSlug: org.slug,
    });

    for (const c of cases) {
      const user = usersByRole[c.role];
      expect(user, `missing fixture user for ${c.role}`).toBeTruthy();

      const headers = authHeaders({
        userId: user.id,
        role: c.role,
        orgId: org.id,
        email: user.email,
        ...(c.role === "CLIENT" ? { clientSlug: tenantClient.slug } : {}),
      });

      const path = c.pathBuilder();
      let req = request(app)[c.method](path).set(headers);
      if (c.body != null && c.method !== "get") {
        req = req.send(c.body);
      }
      const res = await req;

      const label = c.label || `${c.method.toUpperCase()} ${path} as ${c.role}`;
      if (c.expectAllow === true) {
        expectStatus(res, [200, 201], label);
      } else if (c.expectAllow === false) {
        expectStatus(res, [403], label);
      } else if (Array.isArray(c.expectAllow)) {
        expectStatus(res, c.expectAllow, label);
      } else {
        throw new Error(`Invalid expectAllow for ${label}`);
      }
    }
  });
});
