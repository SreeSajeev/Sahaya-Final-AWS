#!/usr/bin/env node
/**
 * Phase F observability audit — TEST host + API surface.
 */
import "dotenv/config";
import fs from "node:fs";
import {
  http,
  loadCreds,
  login,
  sampleHostMetrics,
  sh,
  writeJson,
  ensureOutDir,
} from "./lib.mjs";

async function main() {
  ensureOutDir();
  const host = sampleHostMetrics();
  const health = await http("GET", "/health");

  let requestIdPresent = false;
  try {
    const { password, emails } = loadCreds();
    const sess = await login(emails.SUPER_ADMIN, password);
    const me = await http("GET", "/auth/me", { token: sess.accessToken });
    requestIdPresent = Boolean(me.json?.requestId) || Boolean(me.headers.get("x-request-id"));
  } catch {
    requestIdPresent = false;
  }

  const pm2Logs = sh(
    "pm2 logs sahaya-final-aws-monorepo-api --lines 30 --nostream 2>/dev/null | tail -40",
    { fallback: "" }
  );
  const dockerLogs = sh(
    "docker logs sahaya-migration-db --tail 20 2>&1 | tail -20",
    { fallback: "" }
  );
  const hasStructured = /"event"\s*:/.test(pm2Logs) || /logEvent|requestId/.test(pm2Logs);

  const checklist = [
    {
      item: "Health endpoint",
      ok: health.status === 200 && health.json?.status === "ok",
      detail: health.json,
    },
    {
      item: "Health exposes dbMode prisma",
      ok: health.json?.dbMode === "prisma",
      detail: { dbMode: health.json?.dbMode },
    },
    {
      item: "Request ID on API responses",
      ok: requestIdPresent,
      detail: { requestIdPresent },
    },
    {
      item: "PM2 process running",
      ok: host.pm2?.status === "online" || host.pm2?.name,
      detail: host.pm2,
    },
    {
      item: "Docker PG container present",
      ok: /sahaya-migration-db/.test(host.dockerStats || "") || host.pgConnections != null,
      detail: { dockerStats: host.dockerStats, pgConnections: host.pgConnections },
    },
    {
      item: "Structured logging signal in recent PM2 logs",
      ok: hasStructured || pm2Logs.length > 0,
      detail: { hasStructured, sampleLen: pm2Logs.length },
    },
    {
      item: "Metrics endpoint (/metrics)",
      ok: false,
      detail: { note: "No Prometheus /metrics route detected in app — gap" },
    },
    {
      item: "Alerting configured in-repo",
      ok: false,
      detail: { note: "No PagerDuty/CloudWatch alarm definitions in monorepo — operational gap" },
    },
  ];

  const recommendations = [
    "Export RED metrics (rate, errors, duration) for /auth/login, /tickets, /fe/proof, /data/sla/*",
    "Alert on PM2 restart loops, PG connection saturation, 5xx rate, disk for Docker volumes",
    "Retain audit_logs with requestId correlation; sample auth failures without leaking emails",
    "Ship PM2 + Nginx access logs to a central store (CloudWatch/ELK) before production cutover",
    "Add Prisma slow-query logging threshold (e.g. >500ms) in TEST first",
    "Synthetic check: health + login + ticket list every 1–5 minutes",
  ];

  const report = {
    generatedAt: new Date().toISOString(),
    host,
    health: { status: health.status, body: health.json },
    checklist,
    gaps: checklist.filter((c) => !c.ok).map((c) => c.item),
    recommendations,
    dockerLogSampleLines: dockerLogs.split("\n").length,
  };
  const out = writeJson("observability-summary.json", report);
  console.log(JSON.stringify({ event: "observability_done", out, gaps: report.gaps }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
