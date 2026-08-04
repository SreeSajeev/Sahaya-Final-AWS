#!/usr/bin/env node
/**
 * Phase F soak — TEST only.
 * Env:
 *   SOAK_DURATION_SEC (default 21600 = 6h)
 *   SOAK_INTERVAL_SEC (default 20)
 *   SOAK_LABEL (default soak)
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import {
  appendJsonl,
  http,
  loadCreds,
  login,
  redactEmail,
  sampleHostMetrics,
  summarizeLatencies,
  writeJson,
  OUT_DIR,
  ensureOutDir,
} from "./lib.mjs";

const DURATION_SEC = Number(process.env.SOAK_DURATION_SEC || 21600);
const INTERVAL_SEC = Number(process.env.SOAK_INTERVAL_SEC || 20);
const LABEL = process.env.SOAK_LABEL || "soak";
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

ensureOutDir();
const startedAt = Date.now();
const endAt = startedAt + DURATION_SEC * 1000;
const metricsFile = `${LABEL}-metrics.jsonl`;
const eventsFile = `${LABEL}-events.jsonl`;
const pidFile = path.join(OUT_DIR, `${LABEL}.pid`);
fs.writeFileSync(pidFile, String(process.pid));

const latencies = {
  login: [],
  ticketCreate: [],
  assign: [],
  comment: [],
  dashboard: [],
  search: [],
  sla: [],
  orgs: [],
  proof: [],
};
const counters = {
  ok: 0,
  err: 0,
  byStatus: {},
  unhandled: 0,
};

function bumpStatus(code) {
  const k = String(code);
  counters.byStatus[k] = (counters.byStatus[k] || 0) + 1;
  if (code >= 500) counters.err += 1;
  else if (code >= 200 && code < 400) counters.ok += 1;
  else counters.err += 1;
}

process.on("uncaughtException", (e) => {
  counters.unhandled += 1;
  appendJsonl(eventsFile, { ts: new Date().toISOString(), type: "uncaught", err: String(e.message).slice(0, 200) });
});
process.on("unhandledRejection", (e) => {
  counters.unhandled += 1;
  appendJsonl(eventsFile, {
    ts: new Date().toISOString(),
    type: "unhandledRejection",
    err: String(e?.message || e).slice(0, 200),
  });
});

async function cycle(tokens, password, emails) {
  const cycleStart = Date.now();
  const results = [];

  // refresh tokens periodically
  for (const role of Object.keys(emails)) {
    if (!emails[role]) continue;
    if (!tokens[role]?.accessToken || Math.random() < 0.15) {
      const sess = await login(emails[role], password);
      bumpStatus(sess.status);
      latencies.login.push(sess.ms);
      if (sess.accessToken) tokens[role] = sess;
      results.push({ op: `login_${role}`, status: sess.status, ms: sess.ms });
    }
  }

  const SA = tokens.SUPER_ADMIN?.accessToken;
  const STA = tokens.STAFF?.accessToken || tokens.ADMIN?.accessToken;
  const ADM = tokens.ADMIN?.accessToken;

  if (SA) {
    const dash = await http("GET", "/data/dashboard/stats", { token: SA });
    bumpStatus(dash.status);
    latencies.dashboard.push(dash.ms);
    results.push({ op: "dashboard", status: dash.status, ms: dash.ms });

    const sla = await http("GET", "/data/sla/tracked-count", { token: SA });
    bumpStatus(sla.status);
    latencies.sla.push(sla.ms);
    results.push({ op: "sla", status: sla.status, ms: sla.ms });

    const orgs = await http("GET", "/data/organisations?limit=20", { token: SA });
    bumpStatus(orgs.status);
    latencies.orgs.push(orgs.ms);
    results.push({ op: "orgs", status: orgs.status, ms: orgs.ms });
  }

  if (STA) {
    const marker = `PHASE_F_SOAK_${Date.now()}`;
    const create = await http("POST", "/tickets", {
      token: STA,
      body: {
        short_description: marker,
        category: "OTHER",
        issue_type: "OTHER",
        priority_level: "LOW",
      },
    });
    bumpStatus(create.status);
    latencies.ticketCreate.push(create.ms);
    results.push({ op: "ticket_create", status: create.status, ms: create.ms });
    const ticketId = create.json?.id;

    const search = await http(
      "GET",
      `/data/tickets?limit=20&q=${encodeURIComponent("PHASE_F")}`,
      { token: STA }
    );
    bumpStatus(search.status);
    latencies.search.push(search.ms);
    results.push({ op: "search", status: search.status, ms: search.ms });

    if (ticketId) {
      const cmt = await http("POST", `/data/tickets/${ticketId}/comments`, {
        token: STA,
        body: { body: "PHASE_F_SOAK_COMMENT", source: "STAFF" },
      });
      bumpStatus(cmt.status);
      latencies.comment.push(cmt.ms);
      results.push({ op: "comment", status: cmt.status, ms: cmt.ms });

      // assign if FE list available
      const fes = await http("GET", "/data/field-executives?limit=20", { token: STA });
      bumpStatus(fes.status);
      const feItems = fes.json?.items || fes.json?.data || [];
      const feId = feItems[0]?.id || feItems[0]?.user_id;
      if (feId) {
        const assign = await http("POST", `/tickets/${ticketId}/assign`, {
          token: STA,
          body: { feId },
        });
        bumpStatus(assign.status);
        latencies.assign.push(assign.ms);
        results.push({ op: "assign", status: assign.status, ms: assign.ms });

        // try proof if token returned
        const tok =
          assign.json?.token?.id ||
          assign.json?.on_site_token ||
          assign.json?.fe_action_token_id;
        if (tok) {
          const proof = await http("POST", "/fe/proof", {
            body: {
              token: tok,
              attachments: {
                image_base64: `data:image/png;base64,${PNG_B64}`,
                images: [{ image_base64: `data:image/png;base64,${PNG_B64}`, filename: "soak.png" }],
              },
            },
          });
          bumpStatus(proof.status);
          latencies.proof.push(proof.ms);
          results.push({ op: "proof", status: proof.status, ms: proof.ms });
        }
      }
    }
  }

  if (ADM) {
    const list = await http("GET", "/data/tickets?limit=50", { token: ADM });
    bumpStatus(list.status);
    latencies.search.push(list.ms);
  }

  const host = sampleHostMetrics();
  appendJsonl(metricsFile, {
    ts: new Date().toISOString(),
    elapsedSec: Math.round((Date.now() - startedAt) / 1000),
    cycleMs: Date.now() - cycleStart,
    host,
    results,
    counters: { ...counters },
  });
}

async function main() {
  const { password, emails } = loadCreds();
  if (!password) throw new Error("AUTH_SET_PASSWORD missing");
  console.log(
    JSON.stringify({
      event: "soak_start",
      label: LABEL,
      durationSec: DURATION_SEC,
      intervalSec: INTERVAL_SEC,
      roles: Object.fromEntries(
        Object.entries(emails).map(([k, v]) => [k, v ? redactEmail(v) : null])
      ),
      out: OUT_DIR,
    })
  );

  /** @type {Record<string, any>} */
  const tokens = {};
  let cycles = 0;
  while (Date.now() < endAt) {
    cycles += 1;
    try {
      await cycle(tokens, password, emails);
    } catch (e) {
      counters.unhandled += 1;
      appendJsonl(eventsFile, {
        ts: new Date().toISOString(),
        type: "cycle_error",
        err: String(e.message || e).slice(0, 200),
      });
    }
    const remain = endAt - Date.now();
    if (remain <= 0) break;
    await new Promise((r) => setTimeout(r, Math.min(INTERVAL_SEC * 1000, remain)));
  }

  const summary = {
    label: LABEL,
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date().toISOString(),
    durationSec: Math.round((Date.now() - startedAt) / 1000),
    targetDurationSec: DURATION_SEC,
    cycles,
    counters,
    latency: Object.fromEntries(
      Object.entries(latencies).map(([k, arr]) => [k, summarizeLatencies(arr)])
    ),
    finalHost: sampleHostMetrics(),
    memoryGrowthHint: null,
  };

  // crude memory growth from first/last metrics samples
  try {
    const lines = fs.readFileSync(path.join(OUT_DIR, metricsFile), "utf8").trim().split("\n");
    if (lines.length >= 2) {
      const first = JSON.parse(lines[0]);
      const last = JSON.parse(lines[lines.length - 1]);
      summary.memoryGrowthHint = {
        hostMemUsedDeltaMb:
          (last.host?.memUsedMb ?? 0) - (first.host?.memUsedMb ?? 0),
        pm2MemoryDeltaBytes:
          (last.host?.pm2?.memory ?? 0) - (first.host?.pm2?.memory ?? 0),
        pgConnFirst: first.host?.pgConnections,
        pgConnLast: last.host?.pgConnections,
        pm2RestartsFirst: first.host?.pm2?.restarts,
        pm2RestartsLast: last.host?.pm2?.restarts,
      };
    }
  } catch {
    /* ignore */
  }

  const outPath = writeJson(`${LABEL}-summary.json`, summary);
  console.log(JSON.stringify({ event: "soak_done", summaryPath: outPath, cycles, counters }));
  try {
    fs.unlinkSync(pidFile);
  } catch {
    /* ignore */
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
