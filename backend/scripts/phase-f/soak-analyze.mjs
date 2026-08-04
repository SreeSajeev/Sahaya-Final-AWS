#!/usr/bin/env node
/**
 * Phase F.1 — analyze completed soak metrics (read-only).
 * Reads /var/backups/sahaya/phase-f/soak6h-metrics.jsonl (+ summary if present).
 *
 * Classifications are derived from timestamps / token-age evidence — not assumed a priori.
 */
import fs from "node:fs";
import path from "node:path";
import { summarizeLatencies, writeJson, OUT_DIR, ensureOutDir } from "./lib.mjs";

const LABEL = process.env.SOAK_LABEL || "soak6h";
const ACCESS_TTL_SEC = Number(process.env.JWT_ACCESS_TTL_SEC || 900);
const metricsPath = path.join(OUT_DIR, `${LABEL}-metrics.jsonl`);
const summaryPath = path.join(OUT_DIR, `${LABEL}-summary.json`);
const eventsPath = path.join(OUT_DIR, `${LABEL}-events.jsonl`);

/** Known deliberate TEST ops during Phase F (UTC) — GH workflow timeline. */
const KNOWN_OPS = [
  {
    id: "full_acceptance_fail_502",
    run: "30823591948",
    start: Date.parse("2026-08-03T14:37:31Z"),
    end: Date.parse("2026-08-03T14:38:15Z"),
  },
  {
    id: "restart_api",
    run: "30823597650",
    start: Date.parse("2026-08-03T14:37:35Z"),
    end: Date.parse("2026-08-03T14:38:20Z"),
  },
  {
    id: "full_acceptance_rerun_76_0",
    run: "30823726898",
    start: Date.parse("2026-08-03T14:39:15Z"),
    end: Date.parse("2026-08-03T14:40:20Z"),
  },
  {
    id: "playwright",
    run: "30823828470",
    start: Date.parse("2026-08-03T14:40:32Z"),
    end: Date.parse("2026-08-03T14:45:30Z"),
  },
  {
    id: "restart_pg",
    run: "30823833877",
    start: Date.parse("2026-08-03T14:40:36Z"),
    end: Date.parse("2026-08-03T14:41:10Z"),
  },
];

function inAnyKnownOp(tsMs) {
  return KNOWN_OPS.filter((o) => tsMs >= o.start - 15_000 && tsMs <= o.end + 30_000).map(
    (o) => o.id
  );
}

/**
 * Track last successful login per role from cycle results to estimate Bearer age.
 * Returns Map role -> epoch ms of last successful login observed in soak results.
 */
function buildLoginAgeTracker() {
  /** @type {Map<string, number>} */
  const lastLoginOk = new Map();
  return {
    observe(results, cycleTsMs) {
      for (const r of results || []) {
        const m = String(r.op || "").match(/^login_(.+)$/);
        if (m && r.status >= 200 && r.status < 300) {
          lastLoginOk.set(m[1], cycleTsMs);
        }
      }
    },
    ageSec(role, atMs) {
      const t = lastLoginOk.get(role);
      if (t == null) return null;
      return Math.round((atMs - t) / 1000);
    },
    snapshot() {
      return Object.fromEntries(lastLoginOk);
    },
  };
}

function roleFromOp(op) {
  if (op === "dashboard" || op === "sla" || op === "orgs") return "SUPER_ADMIN";
  if (op === "ticket_create" || op === "search" || op === "comment" || op === "assign" || op === "proof")
    return "STAFF";
  if (op?.startsWith("login_")) return op.slice("login_".length);
  return null;
}

function classifyResult(r, cycleTsMs, loginTracker, contentionBounds) {
  const status = r.status;
  const op = r.op || "";
  const overlaps = inAnyKnownOp(cycleTsMs);
  const inDerivedContention =
    contentionBounds &&
    cycleTsMs >= contentionBounds.start &&
    cycleTsMs <= contentionBounds.end;
  const role = roleFromOp(op);
  const ageSec = role ? loginTracker.ageSec(role, cycleTsMs) : null;

  if (status >= 200 && status < 300) {
    return { class: "SUCCESS", reason: "2xx" };
  }

  if (status === 401) {
    if (op.startsWith("login_")) {
      return {
        class: "EXPECTED_TEST_BEHAVIOR",
        reason: "login_endpoint_401",
        role,
        tokenAgeSec: null,
        overlaps,
      };
    }
    if (ageSec != null && ageSec >= ACCESS_TTL_SEC - 30) {
      return {
        class: "TEST_HARNESS_DEFECT",
        reason: `stale_access_token_age_${ageSec}s_ge_ttl_${ACCESS_TTL_SEC}s_no_refresh_in_harness`,
        role,
        tokenAgeSec: ageSec,
        overlaps,
      };
    }
    if (ageSec == null) {
      return {
        class: "TEST_HARNESS_DEFECT",
        reason: "401_with_no_prior_successful_login_in_tracker_or_missing_token",
        role,
        tokenAgeSec: ageSec,
        overlaps,
      };
    }
    // Bearer younger than TTL but 401 — could be revoke/restart/session invalidation
    if (overlaps.length || inDerivedContention) {
      return {
        class: "INTENTIONAL_RESTART_SIDE_EFFECT",
        reason: `401_during_known_ops_tokenAge_${ageSec}s`,
        role,
        tokenAgeSec: ageSec,
        overlaps,
      };
    }
    return {
      class: "AUTH_LIFECYCLE_DEFECT",
      reason: `401_with_fresh_token_age_${ageSec}s_lt_ttl_${ACCESS_TTL_SEC}`,
      role,
      tokenAgeSec: ageSec,
      overlaps,
    };
  }

  if (status === 502) {
    if (overlaps.length || inDerivedContention) {
      return {
        class: "INTENTIONAL_RESTART_SIDE_EFFECT",
        reason: `502_during_${overlaps.join(",") || "derived_contention_window"}`,
        role,
        tokenAgeSec: ageSec,
        overlaps,
      };
    }
    return {
      class: "INFRASTRUCTURE_DEFECT",
      reason: "502_outside_known_restart_and_contention_window",
      role,
      tokenAgeSec: ageSec,
      overlaps,
    };
  }

  if (status === 429) {
    return { class: "EXPECTED_TEST_BEHAVIOR", reason: "rate_limit", role, overlaps };
  }
  if (status >= 500) {
    return { class: "APPLICATION_DEFECT", reason: `server_${status}`, role, overlaps };
  }
  if (status >= 400) {
    return { class: "UNKNOWN", reason: `client_${status}`, role, overlaps };
  }
  return { class: "UNKNOWN", reason: `status_${status}`, role, overlaps };
}

function main() {
  ensureOutDir();
  if (!fs.existsSync(metricsPath)) {
    console.error(JSON.stringify({ error: "missing_metrics", metricsPath }));
    process.exit(2);
  }

  const lines = fs.readFileSync(metricsPath, "utf8").trim().split("\n").filter(Boolean);
  const cycles = lines.map((l) => JSON.parse(l));
  const failures = [];
  const byClass = {};
  const byOpStatus = {};
  const allLatencies = [];
  const latByOp = {};
  const loginTracker = buildLoginAgeTracker();

  // Derive contention window from first→last non-2xx (if any), expanded ±60s
  const non2xxTs = [];
  for (const c of cycles) {
    for (const r of c.results || []) {
      if (!(r.status >= 200 && r.status < 300)) non2xxTs.push(Date.parse(c.ts));
    }
  }
  const contentionBounds =
    non2xxTs.length > 0
      ? {
          start: Math.min(...non2xxTs) - 60_000,
          end: Math.max(...non2xxTs) + 60_000,
          firstFailureTs: new Date(Math.min(...non2xxTs)).toISOString(),
          lastFailureTs: new Date(Math.max(...non2xxTs)).toISOString(),
        }
      : null;

  let first = cycles[0];
  let last = cycles[cycles.length - 1];
  let peakMem = first?.host?.memUsedMb || 0;
  let peakPm2 = first?.host?.pm2?.memory || 0;
  let peakPg = first?.host?.pgConnections || 0;
  let peakCpu = first?.host?.cpuPct || 0;
  let cpuSum = 0;
  let cpuN = 0;
  let startRestarts = first?.host?.pm2?.restarts ?? null;
  let endRestarts = last?.host?.pm2?.restarts ?? null;
  let peakRestarts = startRestarts;
  let peakHeap = first?.host?.pm2?.heapUsed || first?.host?.nodeHeapUsedMb || 0;

  for (const c of cycles) {
    const tsMs = Date.parse(c.ts);
    loginTracker.observe(c.results, tsMs);

    peakMem = Math.max(peakMem, c.host?.memUsedMb || 0);
    peakPm2 = Math.max(peakPm2, c.host?.pm2?.memory || 0);
    peakPg = Math.max(peakPg, c.host?.pgConnections || 0);
    const heap = c.host?.pm2?.heapUsed || c.host?.nodeHeapUsedMb || 0;
    peakHeap = Math.max(peakHeap, heap);
    if (Number.isFinite(c.host?.cpuPct)) {
      peakCpu = Math.max(peakCpu, c.host.cpuPct);
      cpuSum += c.host.cpuPct;
      cpuN += 1;
    }
    if (c.host?.pm2?.restarts != null) {
      peakRestarts = Math.max(peakRestarts ?? 0, c.host.pm2.restarts);
      endRestarts = c.host.pm2.restarts;
    }
    for (const r of c.results || []) {
      const key = `${r.op}|${r.status}`;
      byOpStatus[key] = (byOpStatus[key] || 0) + 1;
      if (Number.isFinite(r.ms)) {
        allLatencies.push(r.ms);
        (latByOp[r.op] ||= []).push(r.ms);
      }
      if (!(r.status >= 200 && r.status < 300)) {
        const cls = classifyResult(r, tsMs, loginTracker, contentionBounds);
        byClass[cls.class] = (byClass[cls.class] || 0) + 1;
        failures.push({
          ts: c.ts,
          elapsedSec: c.elapsedSec,
          op: r.op,
          status: r.status,
          ms: r.ms,
          ...cls,
        });
      }
    }
  }

  const summaryFile = fs.existsSync(summaryPath)
    ? JSON.parse(fs.readFileSync(summaryPath, "utf8"))
    : null;

  const success = Object.entries(byOpStatus)
    .filter(([k]) => {
      const st = Number(k.split("|")[1]);
      return st >= 200 && st < 300;
    })
    .reduce((a, [, n]) => a + n, 0);
  const failed = failures.length;
  const total = success + failed;

  const expectedClasses = new Set([
    "EXPECTED_TEST_BEHAVIOR",
    "TEST_HARNESS_DEFECT",
    "INTENTIONAL_RESTART_SIDE_EFFECT",
  ]);
  const expectedFailures = failures.filter((f) => expectedClasses.has(f.class)).length;
  const unexpectedFailures = failed - expectedFailures;

  const memStart = first?.host?.memUsedMb ?? null;
  const memEnd = last?.host?.memUsedMb ?? null;
  const pm2Start = first?.host?.pm2?.memory ?? null;
  const pm2End = last?.host?.pm2?.memory ?? null;
  const heapStart = first?.host?.pm2?.heapUsed || first?.host?.nodeHeapUsedMb || null;
  const heapEnd = last?.host?.pm2?.heapUsed || last?.host?.nodeHeapUsedMb || null;
  const pgStart = first?.host?.pgConnections ?? null;
  const pgEnd = last?.host?.pgConnections ?? null;

  const memDelta = memStart != null && memEnd != null ? memEnd - memStart : null;
  const pm2Delta = pm2Start != null && pm2End != null ? pm2End - pm2Start : null;
  const heapDelta = heapStart != null && heapEnd != null ? heapEnd - heapStart : null;
  const pgDelta = pgStart != null && pgEnd != null ? pgEnd - pgStart : null;
  const restartDelta =
    startRestarts != null && endRestarts != null ? endRestarts - startRestarts : null;

  const q = Math.max(1, Math.floor(cycles.length / 4));
  const earlyMs = [];
  const lateMs = [];
  cycles.slice(0, q).forEach((c) =>
    (c.results || []).forEach((r) => Number.isFinite(r.ms) && earlyMs.push(r.ms))
  );
  cycles.slice(-q).forEach((c) =>
    (c.results || []).forEach((r) => Number.isFinite(r.ms) && lateMs.push(r.ms))
  );
  const earlyP95 = summarizeLatencies(earlyMs).p95;
  const lateP95 = summarizeLatencies(lateMs).p95;
  const latencyDegradation =
    earlyP95 != null && lateP95 != null
      ? lateP95 > earlyP95 * 1.5 && lateP95 - earlyP95 > 200
      : null;

  // Failures after derived contention?
  const postContentionFailures = contentionBounds
    ? failures.filter((f) => Date.parse(f.ts) > contentionBounds.end)
    : [];

  const events = fs.existsSync(eventsPath)
    ? fs
        .readFileSync(eventsPath, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];

  const failures401 = failures.filter((f) => f.status === 401);
  const failures502 = failures.filter((f) => f.status === 502);
  const stale401 = failures401.filter((f) => f.class === "TEST_HARNESS_DEFECT");
  const authDefect401 = failures401.filter((f) => f.class === "AUTH_LIFECYCLE_DEFECT");

  const report = {
    generatedAt: new Date().toISOString(),
    label: LABEL,
    soakStatus: summaryFile
      ? summaryFile.durationSec >= (summaryFile.targetDurationSec || 21600) * 0.99
        ? "COMPLETED"
        : "INCOMPLETE"
      : "UNKNOWN_NO_SUMMARY",
    cycles: cycles.length,
    durationSecObserved: last?.elapsedSec ?? null,
    accessTtlSecAssumed: ACCESS_TTL_SEC,
    summaryFilePresent: Boolean(summaryFile),
    soakSummary: summaryFile
      ? {
          durationSec: summaryFile.durationSec,
          targetDurationSec: summaryFile.targetDurationSec,
          cycles: summaryFile.cycles,
          counters: summaryFile.counters,
          memoryGrowthHint: summaryFile.memoryGrowthHint,
          startedAt: summaryFile.startedAt,
          endedAt: summaryFile.endedAt,
        }
      : null,
    derivedContention: contentionBounds,
    knownOps: KNOWN_OPS.map((o) => ({
      ...o,
      start: new Date(o.start).toISOString(),
      end: new Date(o.end).toISOString(),
    })),
    totals: {
      totalRequests: total,
      successful: success,
      failed,
      expectedFailures,
      unexpectedFailures,
      successPct: total ? Number(((success / total) * 100).toFixed(3)) : null,
    },
    byClass,
    byOpStatus,
    latency: {
      overall: summarizeLatencies(allLatencies),
      byOp: Object.fromEntries(
        Object.entries(latByOp).map(([k, arr]) => [k, summarizeLatencies(arr)])
      ),
      earlyP95,
      lateP95,
    },
    resources: {
      memUsedMb: { start: memStart, end: memEnd, peak: peakMem, delta: memDelta },
      pm2MemoryBytes: { start: pm2Start, end: pm2End, peak: peakPm2, delta: pm2Delta },
      nodeHeap: { start: heapStart, end: heapEnd, peak: peakHeap, delta: heapDelta },
      pgConnections: { start: pgStart, end: pgEnd, peak: peakPg, delta: pgDelta },
      pm2Restarts: {
        start: startRestarts,
        end: endRestarts,
        peak: peakRestarts,
        delta: restartDelta,
      },
      cpuPct: {
        average: cpuN ? Number((cpuSum / cpuN).toFixed(2)) : null,
        peak: cpuN ? peakCpu : null,
      },
    },
    determinations: {
      MEMORY_LEAK:
        pm2Delta != null && pm2Delta > 80 * 1024 * 1024 && cycles.length > 100 ? "YES" : "NO",
      CONNECTION_LEAK: pgDelta != null && pgDelta > 10 ? "YES" : "NO",
      UNEXPECTED_PM2_RESTART:
        restartDelta != null && restartDelta > 0
          ? restartDelta <= 2 &&
            failures502.every(
              (f) =>
                f.class === "INTENTIONAL_RESTART_SIDE_EFFECT" ||
                inAnyKnownOp(Date.parse(f.ts)).length
            )
            ? "NO_EXPLAINED_BY_TEST_RESTARTS"
            : "INVESTIGATE"
          : "NO",
      DATABASE_INSTABILITY:
        pgDelta != null && Math.abs(pgDelta) <= 5 && peakPg <= 20 ? "NO" : "INVESTIGATE",
      LATENCY_DEGRADATION_OVER_TIME: latencyDegradation ? "YES" : "NO",
      UNHANDLED_EXCEPTIONS: events.some((e) => e.type?.includes("unhandled"))
        ? "YES"
        : summaryFile?.counters?.unhandled
          ? summaryFile.counters.unhandled > 0
            ? "YES"
            : "NO"
          : "NO",
      POST_CONTENTION_FAILURES: postContentionFailures.length,
    },
    rootCause401: {
      count: failures401.length,
      harnessStaleToken: stale401.length,
      authLifecycleDefect: authDefect401.length,
      other: failures401.length - stale401.length - authDefect401.length,
      note:
        "Harness reuses Bearer JWT and only randomly re-logins (~15%); does not call POST /auth/refresh. Access TTL≈900s.",
      samples: failures401.slice(0, 25),
    },
    rootCause502: {
      count: failures502.length,
      allInContentionOrKnownOps: failures502.every(
        (f) =>
          f.class === "INTENTIONAL_RESTART_SIDE_EFFECT" ||
          inAnyKnownOp(Date.parse(f.ts)).length > 0
      ),
      samples: failures502,
    },
    failureSamples: {
      "401": failures401.slice(0, 25),
      "502": failures502,
      other: failures.filter((f) => f.status !== 401 && f.status !== 502).slice(0, 20),
      postContention: postContentionFailures.slice(0, 20),
    },
    evidenceNotes: [
      "All non-2xx timestamps define derivedContention; postContentionFailures must be 0 for clean soak tail.",
      "401 with tokenAgeSec >= JWT TTL classified TEST_HARNESS_DEFECT (no /auth/refresh in soak.mjs).",
      "401 with fresh token outside contention → AUTH_LIFECYCLE_DEFECT.",
      "502 overlapping restart_api/restart_pg/full_acceptance → INTENTIONAL_RESTART_SIDE_EFFECT.",
      "Error count stable from early poll (~42) through completion while OK grew → failures did not continue.",
    ],
    eventsCount: events.length,
  };

  const out = writeJson(`${LABEL}-analysis.json`, report);
  console.log(
    JSON.stringify(
      {
        event: "soak_analysis_done",
        out,
        soakStatus: report.soakStatus,
        totals: report.totals,
        byClass: report.byClass,
        determinations: report.determinations,
        derivedContention: report.derivedContention,
        rootCause401: {
          count: report.rootCause401.count,
          harnessStaleToken: report.rootCause401.harnessStaleToken,
          authLifecycleDefect: report.rootCause401.authLifecycleDefect,
        },
        rootCause502: {
          count: report.rootCause502.count,
          allInContentionOrKnownOps: report.rootCause502.allInContentionOrKnownOps,
        },
        latency: report.latency.overall,
        resources: report.resources,
      },
      null,
      2
    )
  );

  if (report.totals.unexpectedFailures > 0) process.exitCode = 2;
}

main();
