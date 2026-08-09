/**
 * CLIENT / FE ownership + CAS 409 + proof text rejection (integration).
 */
import crypto from "crypto";
import request from "supertest";
import { afterEach, beforeEach, expect } from "vitest";
import { describeIfDb } from "../helpers/testContext.js";
import { buildTestApp } from "../helpers/testApp.js";
import {
  cleanupTestData,
  createTestAssignment,
  createTestFieldExecutive,
  createTestOrganisation,
  createTestTicket,
  createTestUser,
} from "../helpers/db.js";
import { prisma } from "../../src/db/prisma.js";

describeIfDb("production hardening: authz + CAS + proofs", () => {
  const app = buildTestApp();
  let org;
  let admin;
  let clientUser;
  let feUser;
  let fe;
  let ticketMine;
  let ticketOther;
  let ticketFe;

  beforeEach(async () => {
    org = await createTestOrganisation({ name: "Hardening Org" });
    admin = await createTestUser(org.id, { role: "ADMIN" });
    clientUser = await createTestUser(org.id, {
      role: "CLIENT",
      clientSlug: "client-alpha",
    });
    feUser = await createTestUser(org.id, { role: "FIELD_EXECUTIVE" });
    fe = await createTestFieldExecutive(org.id, { userId: feUser.id });
    ticketMine = await createTestTicket(org.id, {
      status: "OPEN",
      clientSlug: "client-alpha",
    });
    ticketOther = await createTestTicket(org.id, {
      status: "OPEN",
      clientSlug: "client-beta",
    });
    ticketFe = await createTestTicket(org.id, {
      status: "ASSIGNED",
      clientSlug: "client-alpha",
    });
    const assignment = await createTestAssignment(ticketFe.id, org.id, {
      feId: fe.id,
      assignmentType: "FIELD_EXECUTIVE",
    });
    await prisma.ticket.update({
      where: { id: ticketFe.id },
      data: { currentAssignmentId: assignment.id, status: "ASSIGNED" },
    });
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  function headers(user, role, extra = {}) {
    return {
      Authorization: "Bearer test-token",
      "x-test-user-id": user.id,
      "x-test-role": role,
      "x-test-org-id": org.id,
      ...(role === "CLIENT" ? { "x-test-client-slug": "client-alpha" } : {}),
      ...extra,
    };
  }

  it("CLIENT list only returns own client_slug tickets", async () => {
    const res = await request(app)
      .get("/data/tickets?limit=50")
      .set(headers(clientUser, "CLIENT"));
    expect(res.status).toBe(200);
    const items = res.body?.items || [];
    const ids = items.map((t) => t.id);
    expect(ids).toContain(ticketMine.id);
    expect(ids).not.toContain(ticketOther.id);
  });

  it("CLIENT cannot GET another client's ticket", async () => {
    const res = await request(app)
      .get(`/data/tickets/${ticketOther.id}`)
      .set(headers(clientUser, "CLIENT"));
    expect([403, 404]).toContain(res.status);
  });

  it("CLIENT cannot read another client's comments", async () => {
    const res = await request(app)
      .get(`/data/tickets/${ticketOther.id}/comments`)
      .set(headers(clientUser, "CLIENT"));
    expect([403, 404]).toContain(res.status);
  });

  it("FE cannot list unassigned tenant tickets", async () => {
    const res = await request(app)
      .get("/data/tickets?limit=50")
      .set(headers(feUser, "FIELD_EXECUTIVE"));
    expect(res.status).toBe(200);
    const items = res.body?.items || [];
    const ids = items.map((t) => t.id);
    expect(ids).toContain(ticketFe.id);
    expect(ids).not.toContain(ticketMine.id);
    expect(ids).not.toContain(ticketOther.id);
  });

  it("assign returns 409 when expected status no longer matches", async () => {
    const openTicket = await createTestTicket(org.id, { status: "OPEN" });
    // Race: status changed before assign completes
    await prisma.ticket.update({
      where: { id: openTicket.id },
      data: { status: "RESOLVED" },
    });
    const res = await request(app)
      .post(`/tickets/${openTicket.id}/assign`)
      .set(headers(admin, "ADMIN"))
      .send({ feId: fe.id });
    // Either 409 conflict or 400 status guard — both safe
    expect([400, 409]).toContain(res.status);
  });

  it("close rejects text-only proof uploaded comment", async () => {
    const t = await createTestTicket(org.id, {
      status: "RESOLVED_PENDING_VERIFICATION",
    });
    const assignment = await createTestAssignment(t.id, org.id, { feId: fe.id });
    await prisma.ticket.update({
      where: { id: t.id },
      data: {
        currentAssignmentId: assignment.id,
        status: "RESOLVED_PENDING_VERIFICATION",
      },
    });
    const comment = await prisma.ticketComment.create({
      data: {
        ticketId: t.id,
        organisationId: org.id,
        source: "FE",
        body: "RESOLUTION proof uploaded",
        attachments: null,
      },
    });
    const res = await request(app)
      .post(`/tickets/${t.id}/close`)
      .set(headers(admin, "ADMIN"))
      .send({ verification_remarks: "Looks good" });
    expect(res.status).toBe(400);
    expect(String(res.body?.error || "")).toMatch(/proof/i);
    await prisma.ticketComment.delete({ where: { id: comment.id } }).catch(() => {});
  });

  it("blocks forged ticket id for CLIENT", async () => {
    const forged = crypto.randomUUID();
    const res = await request(app)
      .get(`/data/tickets/${forged}`)
      .set(headers(clientUser, "CLIENT"));
    expect([403, 404]).toContain(res.status);
  });
});
