#!/usr/bin/env node
/**
 * Phase F load test — TEST only. Concurrent realistic workflows.
 * Env: LOAD_CONCURRENCY (default 20), LOAD_ROUNDS (default 5)
 */
import "dotenv/config";
import {
  http,
  loadCreds,
  login,
  redactEmail,
  sampleHostMetrics,
  summarizeLatencies,
  writeJson,
  ensureOutDir,
} from "./lib.mjs";

const CONCURRENCY = Number(process.env.LOAD_CONCURRENCY || 20);
const ROUNDS = Number(process.env.LOAD_ROUNDS || 5);

function pctile(arr, p) {
  return summarizeLatencies(arr);
}

async function mapPool(items, limit, fn) {
  const out = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

async function main() {
  ensureOutDir();
  const { password, emails } = loadCreds();
  const hostBefore = sampleHostMetrics();

  // Warm logins (serialized to avoid hammering limiter at start)
  /** @type {Record<string, any>} */
  const sessions = {};
  for (const [role, email] of Object.entries(emails)) {
    if (!email) continue;
    await new Promise((r) => setTimeout(r, 400));
    sessions[role] = await login(email, password);
  }

  const SA = sessions.SUPER_ADMIN?.accessToken;
  const STA = sessions.STAFF?.accessToken || sessions.ADMIN?.accessToken;
  const ADM = sessions.ADMIN?.accessToken;
  const FE = sessions.FIELD_EXECUTIVE?.accessToken;

  const scenarios = {
    concurrent_logins: [],
    ticket_create: [],
    search: [],
    dashboard: [],
    sla: [],
    org_list: [],
    assign: [],
    comment: [],
    fe_me: [],
    api_mix: [],
  };
  const errors = [];
  let ticketNumbers = [];

  // 1) Concurrent logins
  const loginJobs = Array.from({ length: CONCURRENCY }, (_, i) => i);
  const loginResults = await mapPool(loginJobs, CONCURRENCY, async () => {
    const email = emails.STAFF || emails.ADMIN;
    return login(email, password);
  });
  for (const r of loginResults) {
    scenarios.concurrent_logins.push(r.ms);
    if (r.status !== 200) errors.push({ scenario: "login", status: r.status, err: r.error });
  }

  // Refresh STA token if rate limited
  if (!STA) {
    console.log(JSON.stringify({ event: "load_abort", reason: "no_staff_token" }));
  }

  for (let round = 0; round < ROUNDS; round++) {
    // concurrent ticket creates
    const creates = await mapPool(
      Array.from({ length: CONCURRENCY }, (_, i) => i),
      CONCURRENCY,
      async (i) => {
        if (!STA) return { status: 0, ms: 0 };
        return http("POST", "/tickets", {
          token: STA,
          body: {
            short_description: `PHASE_F_LOAD_${Date.now()}_${i}`,
            category: "OTHER",
            issue_type: "OTHER",
            priority_level: "LOW",
          },
        });
      }
    );
    for (const c of creates) {
      scenarios.ticket_create.push(c.ms);
      if (c.status !== 200) errors.push({ scenario: "ticket_create", status: c.status });
      if (c.json?.ticket_number) ticketNumbers.push(c.json.ticket_number);
    }

    // concurrent searches / dashboard / sla / orgs
    const reads = await Promise.all([
      mapPool(Array.from({ length: CONCURRENCY }, (_, i) => i), CONCURRENCY, async () =>
        http("GET", "/data/tickets?limit=20&q=PHASE_F", { token: STA || ADM })
      ),
      mapPool(Array.from({ length: Math.ceil(CONCURRENCY / 2) }, (_, i) => i), 10, async () =>
        http("GET", "/data/dashboard/stats", { token: SA })
      ),
      mapPool(Array.from({ length: Math.ceil(CONCURRENCY / 2) }, (_, i) => i), 10, async () =>
        http("GET", "/data/sla/tracked-count", { token: SA })
      ),
      mapPool(Array.from({ length: Math.ceil(CONCURRENCY / 2) }, (_, i) => i), 10, async () =>
        http("GET", "/data/organisations?limit=20", { token: SA })
      ),
      FE
        ? mapPool(Array.from({ length: 10 }, (_, i) => i), 10, async () =>
            http("GET", "/fe/me/tickets", { token: FE })
          )
        : Promise.resolve([]),
    ]);

    for (const r of reads[0]) {
      scenarios.search.push(r.ms);
      if (r.status >= 500) errors.push({ scenario: "search", status: r.status });
    }
    for (const r of reads[1]) {
      scenarios.dashboard.push(r.ms);
      if (r.status >= 500) errors.push({ scenario: "dashboard", status: r.status });
    }
    for (const r of reads[2]) {
      scenarios.sla.push(r.ms);
      if (r.status >= 500) errors.push({ scenario: "sla", status: r.status });
    }
    for (const r of reads[3]) {
      scenarios.org_list.push(r.ms);
      if (r.status >= 500) errors.push({ scenario: "org_list", status: r.status });
    }
    for (const r of reads[4]) {
      scenarios.fe_me.push(r.ms);
      if (r.status >= 500) errors.push({ scenario: "fe_me", status: r.status });
    }

    // comments + assign on last created ticket
    const lastId = creates.find((c) => c.json?.id)?.json?.id;
    if (lastId && STA) {
      const cmt = await http("POST", `/data/tickets/${lastId}/comments`, {
        token: STA,
        body: { body: "PHASE_F_LOAD_COMMENT", source: "STAFF" },
      });
      scenarios.comment.push(cmt.ms);
      if (cmt.status >= 500) errors.push({ scenario: "comment", status: cmt.status });

      const fes = await http("GET", "/data/field-executives?limit=5", { token: STA });
      const feId = (fes.json?.items || [])[0]?.id;
      if (feId) {
        const assign = await http("POST", `/tickets/${lastId}/assign`, {
          token: STA,
          body: { feId: feId },
        });
        scenarios.assign.push(assign.ms);
        if (assign.status >= 500) errors.push({ scenario: "assign", status: assign.status });
      }
    }
  }

  // org CRUD light (SA only, serialized)
  let orgCrud = { create: null, patch: null };
  if (SA) {
    const slug = `phase-f-load-${Date.now().toString(36)}`;
    const create = await http("POST", "/data/organisations", {
      token: SA,
      body: { name: "PHASE_F_LOAD_ORG", slug, status: "active" },
    });
    orgCrud.create = { status: create.status, ms: create.ms };
    const id = create.json?.id || create.json?.item?.id;
    if (id) {
      const patch = await http("PATCH", `/data/organisations/${id}`, {
        token: SA,
        body: { name: "PHASE_F_LOAD_ORG_UPDATED" },
      });
      orgCrud.patch = { status: patch.status, ms: patch.ms };
    }
  }

  const uniq = new Set(ticketNumbers);
  const hostAfter = sampleHostMetrics();
  const totalReqs = Object.values(scenarios).reduce((a, b) => a + b.length, 0);
  const errorPct = totalReqs ? (errors.length / totalReqs) * 100 : 0;

  const report = {
    concurrency: CONCURRENCY,
    rounds: ROUNDS,
    roles: Object.fromEntries(
      Object.entries(emails).map(([k, v]) => [k, v ? redactEmail(v) : null])
    ),
    hostBefore,
    hostAfter,
    latency: Object.fromEntries(
      Object.entries(scenarios).map(([k, arr]) => [k, pctile(arr)])
    ),
    orgCrud,
    ticketNumbers: {
      created: ticketNumbers.length,
      unique: uniq.size,
      duplicates: ticketNumbers.length - uniq.size,
    },
    errors: errors.slice(0, 50),
    errorCount: errors.length,
    errorPct: Number(errorPct.toFixed(3)),
    throughputHint: {
      totalMeasuredOps: totalReqs,
      note: "ops across scenarios; not single-endpoint RPS",
    },
    recommendedProductionLimits: {
      loginRpsPerIp: 2,
      loginBurstPer15m: 100,
      ticketCreateRps: 5,
      dashboardRps: 10,
      prismaConnectionLimitHint: 20,
      pgMaxConnectionsHeadroom: "keep app pool << max_connections/2",
      concurrentFeProofUploads: 5,
    },
  };

  const out = writeJson("load-summary.json", report);
  console.log(
    JSON.stringify({
      event: "load_done",
      out,
      errorPct: report.errorPct,
      duplicates: report.ticketNumbers.duplicates,
      p95_ticket: report.latency.ticket_create?.p95,
      p95_dashboard: report.latency.dashboard?.p95,
    })
  );
  if (report.ticketNumbers.duplicates > 0 || report.errorPct > 5) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
