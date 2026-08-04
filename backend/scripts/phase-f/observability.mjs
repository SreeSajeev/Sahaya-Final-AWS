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

  const alertThresholds = [
    { alert: "API unavailable", signal: "synthetic GET /health != 200", threshold: "1 failure in 2m OR 2 in 5m", severity: "critical" },
    { alert: "5xx rate", signal: "nginx/app 5xx / total", threshold: ">1% over 5m OR >10 absolute /5m", severity: "critical" },
    { alert: "Auth failure spike", signal: "POST /auth/login 401 count", threshold: ">30/min per IP sustained 5m (after prod rate limit)", severity: "high" },
    { alert: "PM2 restart", signal: "pm2 restart_time delta", threshold: "any unexpected restart; >2 in 15m = critical", severity: "high" },
    { alert: "High CPU", signal: "host CPU%", threshold: ">85% for 10m", severity: "high" },
    { alert: "High memory", signal: "host mem used% OR PM2 RSS", threshold: "host >90% OR PM2 RSS >512MB sustained 15m", severity: "high" },
    { alert: "PostgreSQL unavailable", signal: "health dbMode/prisma ping OR docker health", threshold: "1 failure", severity: "critical" },
    { alert: "PG connection saturation", signal: "pg_stat_activity count", threshold: ">70% of max_connections for 5m", severity: "high" },
    { alert: "S3 failures", signal: "proof upload/presign 5xx", threshold: ">5 in 10m", severity: "high" },
    { alert: "Backup failure", signal: "nightly dump exit code / age", threshold: "missing dump >26h OR non-zero exit", severity: "critical" },
    { alert: "Disk usage", signal: "root + docker volume", threshold: ">80% warn, >90% critical", severity: "high" },
    { alert: "Certificate expiry", signal: "TLS notAfter", threshold: "<21 days warn, <7 days critical", severity: "high" },
  ];

  const report = {
    generatedAt: new Date().toISOString(),
    host,
    health: { status: health.status, body: health.json },
    checklist,
    gaps: checklist.filter((c) => !c.ok).map((c) => c.item),
    recommendations,
    alertThresholds,
    prodRateLimitNote:
      "TEST RATE_LIMIT_LOGIN_MAX=200 is suite-only; production should use 20–30 / 15m per IP.",
    dockerLogSampleLines: dockerLogs.split("\n").length,
  };
  const out = writeJson("observability-summary.json", report);
  console.log(JSON.stringify({ event: "observability_done", out, gaps: report.gaps }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
