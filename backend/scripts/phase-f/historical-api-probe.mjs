#!/usr/bin/env node
/**
 * TEST probe: historical ticket graph via Prisma ID resolve + Data API.
 * Uses known working local-auth accounts. Does not mass-reset passwords.
 * Does not delete data. Does not touch Supabase.
 *
 * Note: /data/tickets?search= applies search AFTER limit/offset on newest rows,
 * so exact ticket-number search of old tickets via list is unreliable. This probe
 * resolves IDs via Prisma (same DB the API uses), then proves API read paths.
 */
import "dotenv/config";
import { prisma } from "../../src/db/prisma.js";
import { http, loadCreds, writeJson, ensureOutDir, redactEmail } from "./lib.mjs";

const HIST_TICKET_NUMBERS = [
  "PKQ-20260108-7551",
  "PKQ-20260108-2401",
  "PKQ-20260216-9139",
];

function itemsOf(json) {
  if (!json) return [];
  if (Array.isArray(json.items)) return json.items;
  if (Array.isArray(json.data)) return json.data;
  if (Array.isArray(json)) return json;
  return [];
}

async function login(email, password) {
  const r = await http("POST", "/auth/login", { body: { email, password } });
  if (r.status !== 200 || !r.json?.accessToken) {
    throw new Error(`login failed ${r.status} ${redactEmail(email)}`);
  }
  return {
    token: r.json.accessToken,
    cookie: (r.setCookie || []).map((c) => c.split(";")[0]).join("; "),
    user: r.json.user,
  };
}

async function main() {
  ensureOutDir();
  const creds = loadCreds();
  const password = creds.password;
  const email = creds.emails.SUPER_ADMIN || creds.emails.ADMIN;
  if (!email || !password) throw new Error("missing role creds");

  const session = await login(email, password);
  const token = session.token;
  const me = await http("GET", "/auth/me", { token });

  const historical = [];
  for (const num of HIST_TICKET_NUMBERS) {
    const row = await prisma.ticket.findFirst({
      where: { ticketNumber: num },
      select: {
        id: true,
        ticketNumber: true,
        status: true,
        organisationId: true,
        shortDescription: true,
        priorityLevel: true,
        createdAt: true,
        openedByEmail: true,
      },
    });
    if (!row?.id) {
      historical.push({ ticketNumber: num, foundInDb: false, found: false });
      continue;
    }

    const id = row.id;
    const detail = await http("GET", `/data/tickets/${id}`, { token });
    const comments = await http("GET", `/data/tickets/${id}/comments`, { token });
    const assignments = await http("GET", `/data/tickets/${id}/assignments`, { token });
    const sla = await http("POST", `/data/sla/by-ticket-ids`, {
      token,
      body: { ticketIds: [id] },
    });
    const audit = await http(
      "GET",
      `/data/audit-logs?ticketNumber=${encodeURIComponent(num)}&limit=10`,
      { token }
    );
    const org = row.organisationId
      ? await http("GET", `/data/organisations/${row.organisationId}`, { token })
      : { status: null, json: null };

    // Tenant filter proof: list with organisationId should include this ticket when limit high enough
    // Prefer contains search via DB for filterability evidence
    const dbSearchCount = await prisma.ticket.count({
      where: { ticketNumber: { contains: num.slice(0, 12), mode: "insensitive" } },
    });

    const crows = itemsOf(comments.json);
    const arows = itemsOf(assignments.json);
    const srows = itemsOf(sla.json);

    let feOk = null;
    if (arows[0]) {
      const feId = arows[0].fe_id || arows[0].feId;
      if (feId) {
        const fe = await http("GET", `/data/field-executives/${feId}`, { token }).catch(() => null);
        feOk = fe ? { status: fe.status, id: feId } : { status: null, id: feId };
      }
    }

    historical.push({
      ticketNumber: num,
      foundInDb: true,
      found: detail.status === 200 && Boolean(detail.json?.id || detail.json?.ticket_number),
      id,
      status: row.status,
      organisationId: row.organisationId,
      orgSlug: org.json?.slug || null,
      orgStatus: org.status,
      shortDescription: String(row.shortDescription || "").slice(0, 80),
      createdAt: row.createdAt,
      detailStatus: detail.status,
      commentsStatus: comments.status,
      commentsCount: crows.length,
      assignmentsStatus: assignments.status,
      assignmentsCount: arows.length,
      assignmentFeIds: arows.map((a) => a.fe_id || a.feId).filter(Boolean).slice(0, 5),
      feLookup: feOk,
      slaStatus: sla.status,
      slaCount: srows.length,
      auditStatus: audit.status,
      auditCount: itemsOf(audit.json).length,
      dbSearchHitCount: dbSearchCount,
      hasProofMeta: crows.some((c) => {
        const att = c.attachments;
        if (!att) return false;
        const s = typeof att === "string" ? att : JSON.stringify(att);
        return s.includes("proof_storage_paths") || s.includes("base64") || s.includes("data:image");
      }),
    });
  }

  const orgList = await http("GET", "/data/organisations", { token });
  const orgArr = itemsOf(orgList.json);
  const histOrg = orgArr.find((o) => !/^(e2e-|phase-)/i.test(o.slug || "")) || orgArr[0];

  let created = null;
  if (histOrg?.id) {
    const create = await http("POST", "/tickets", {
      token,
      body: {
        organisationId: histOrg.id,
        shortDescription: `CONVERGENCE_PROBE_${Date.now()}`,
        priorityLevel: "MEDIUM",
        status: "OPEN",
        vehicleNumber: "CONV-PROBE-1",
        category: "Other",
        issueType: "Other",
        location: "TEST",
      },
    });
    created = {
      status: create.status,
      id: create.json?.id || create.json?.data?.id || null,
      ticketNumber:
        create.json?.ticket_number ||
        create.json?.ticketNumber ||
        create.json?.data?.ticket_number ||
        null,
      error: create.status >= 400 ? String(create.json?.error || create.json?.message || "").slice(0, 120) : null,
    };
    if (created.id) {
      const comment = await http("POST", `/data/tickets/${created.id}/comments`, {
        token,
        body: { body: "convergence probe comment", source: "STAFF" },
      });
      created.commentStatus = comment.status;
      created.commentError =
        comment.status >= 400
          ? String(comment.json?.error || comment.json?.message || "").slice(0, 160)
          : null;
    }
  }

  const refresh = await http("POST", "/auth/refresh", {
    cookie: session.cookie,
    body: {},
  });
  const logout = await http("POST", "/auth/logout", {
    token: refresh.json?.accessToken || token,
    cookie: session.cookie,
    body: {},
  });

  const foundOk = historical.filter((h) => h.found).length;
  const report = {
    generatedAt: new Date().toISOString(),
    actor: redactEmail(email),
    meStatus: me.status,
    historical,
    historicalFound: foundOk,
    created,
    refreshStatus: refresh.status,
    logoutStatus: logout.status,
    pass:
      foundOk >= 2 &&
      me.status === 200 &&
      refresh.status === 200 &&
      logout.status < 500 &&
      (created == null || (created.status === 200 && created.id)),
  };

  const out = writeJson("historical-api-probe.json", report);
  console.log(JSON.stringify({ event: "historical_api_probe_done", out, report }, null, 2));
  await prisma.$disconnect();
  if (!report.pass) process.exit(2);
}

main().catch(async (e) => {
  console.error(e);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
