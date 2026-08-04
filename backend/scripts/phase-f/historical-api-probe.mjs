#!/usr/bin/env node
/**
 * TEST probe: historical ticket graph via Data API + light new lifecycle.
 * Uses known working local-auth accounts. Does not mass-reset passwords.
 * Does not delete data. Does not touch Supabase.
 */
import "dotenv/config";
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
    const search = await http(
      "GET",
      `/data/tickets?search=${encodeURIComponent(num)}&limit=50&scopeAllOrganisations=true`,
      { token }
    );
    const sarr = itemsOf(search.json);
    let ticket = sarr.find((t) => (t.ticket_number || t.ticketNumber) === num);

    if (!ticket?.id) {
      historical.push({ ticketNumber: num, found: false, listStatus: search.status });
      continue;
    }

    const id = ticket.id;
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
    const orgId = ticket.organisation_id || ticket.organisationId || detail.json?.organisation_id;
    const org = orgId
      ? await http("GET", `/data/organisations/${orgId}`, { token })
      : { status: null, json: null };

    const crows = itemsOf(comments.json);
    const arows = itemsOf(assignments.json);
    const srows = itemsOf(sla.json);

    historical.push({
      ticketNumber: num,
      found: true,
      id,
      status: ticket.status || detail.json?.status,
      organisationId: orgId || null,
      orgSlug: org.json?.slug || null,
      orgStatus: org.status,
      shortDescription: String(ticket.short_description || ticket.shortDescription || "").slice(0, 80),
      detailStatus: detail.status,
      commentsStatus: comments.status,
      commentsCount: crows.length,
      assignmentsStatus: assignments.status,
      assignmentsCount: arows.length,
      assignmentFeIds: arows.map((a) => a.fe_id || a.feId).filter(Boolean).slice(0, 5),
      slaStatus: sla.status,
      slaCount: srows.length,
      auditStatus: audit.status,
      auditCount: itemsOf(audit.json).length,
      hasProofMeta: crows.some(
        (c) =>
          c.attachments &&
          (c.attachments.proof_storage_paths ||
            JSON.stringify(c.attachments).includes("base64") ||
            JSON.stringify(c.attachments).includes("data:image"))
      ),
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
        body: { body: "convergence probe comment", source: "INTERNAL" },
      });
      created.commentStatus = comment.status;
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

  const report = {
    generatedAt: new Date().toISOString(),
    actor: redactEmail(email),
    meStatus: me.status,
    historical,
    historicalFound: historical.filter((h) => h.found).length,
    created,
    refreshStatus: refresh.status,
    logoutStatus: logout.status,
    pass:
      historical.filter((h) => h.found).length >= 2 &&
      me.status === 200 &&
      refresh.status === 200 &&
      logout.status < 500,
  };

  const out = writeJson("historical-api-probe.json", report);
  console.log(JSON.stringify({ event: "historical_api_probe_done", out, report }, null, 2));
  if (!report.pass) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
