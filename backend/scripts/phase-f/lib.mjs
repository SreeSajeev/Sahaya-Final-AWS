/**
 * Phase F shared helpers — TEST only. Never prints passwords.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

export const API = process.env.API_BASE || "https://api.test-sahaya.pariskq.in";
export const FE = process.env.FE_BASE || "https://test-sahaya.pariskq.in";
export const ORIGIN = FE;
export const OUT_DIR =
  process.env.PHASE_F_OUT ||
  "/var/backups/sahaya/phase-f";

export function ensureOutDir() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  try {
    fs.chmodSync(OUT_DIR, 0o700);
  } catch {
    /* ignore */
  }
}

export function loadCreds() {
  const file =
    process.env.CREDS_FILE ||
    "/var/backups/sahaya/phase-d-auth/test-local-passwords.env";
  if (!fs.existsSync(file)) throw new Error(`Missing creds file: ${file}`);
  const text = fs.readFileSync(file, "utf8");
  /** @type {Record<string, string>} */
  const env = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return {
    password: env.AUTH_SET_PASSWORD,
    emails: {
      SUPER_ADMIN: env.ROLE_SUPER_ADMIN_EMAIL,
      ADMIN: env.ROLE_ADMIN_EMAIL,
      STAFF: env.ROLE_STAFF_EMAIL,
      FIELD_EXECUTIVE: env.ROLE_FIELD_EXECUTIVE_EMAIL,
    },
  };
}

export function redactEmail(email) {
  if (!email || !email.includes("@")) return "***";
  const [l, d] = email.split("@");
  return `${l.slice(0, 2)}***@${d}`;
}

/**
 * @returns {Promise<{ status: number, json: any, ms: number, headers: Headers, setCookie: string[] }>}
 */
export async function http(method, pathName, opts = {}) {
  const started = Date.now();
  const headers = {
    Origin: ORIGIN,
    Accept: "application/json",
    ...(opts.headers || {}),
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.cookie) headers.Cookie = opts.cookie;
  let body;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
  }
  const res = await fetch(`${API}${pathName}`, { method, headers, body });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text.slice(0, 300) };
  }
  const setCookie = res.headers.getSetCookie?.() || [];
  return {
    status: res.status,
    json,
    ms: Date.now() - started,
    headers: res.headers,
    setCookie,
  };
}

export function cookieHeader(setCookie) {
  return (setCookie || []).map((c) => c.split(";")[0]).join("; ");
}

export async function login(email, password) {
  const res = await http("POST", "/auth/login", {
    body: { email, password },
  });
  return {
    status: res.status,
    accessToken: res.json?.accessToken,
    profile: res.json?.profile || res.json?.user,
    cookie: cookieHeader(res.setCookie),
    ms: res.ms,
    error: res.json?.error,
    json: res.json,
  };
}

export function percentile(sortedAsc, p) {
  if (!sortedAsc.length) return null;
  const idx = Math.min(sortedAsc.length - 1, Math.ceil((p / 100) * sortedAsc.length) - 1);
  return sortedAsc[Math.max(0, idx)];
}

export function summarizeLatencies(samplesMs) {
  const sorted = [...samplesMs].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  return {
    n: sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1] ?? null,
    min: sorted[0] ?? null,
    mean: sorted.length
      ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length)
      : null,
  };
}

export function sh(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: opts.timeoutMs || 15_000,
    }).trim();
  } catch (e) {
    return opts.fallback ?? `ERR:${e.message?.slice(0, 80)}`;
  }
}

export function sampleHostMetrics() {
  const mem = sh("free -m | awk '/Mem:/ {print $2,$3,$7}'", { fallback: "" });
  const [memTotal, memUsed, memAvail] = mem.split(/\s+/).map(Number);
  const load = sh("cat /proc/loadavg", { fallback: "" });
  const pm2 = sh(
    "pm2 jlist 2>/dev/null | node -e \"let d='';try{d=require('fs').readFileSync(0,'utf8')}catch{};const a=JSON.parse(d||'[]');const p=a.find(x=>String(x.name||'').includes('monorepo-api'));if(!p){console.log('{}');process.exit(0)};console.log(JSON.stringify({name:p.name,status:p.pm2_env?.status,restarts:p.pm2_env?.restart_time,unstable:p.pm2_env?.unstable_restarts,memory:p.monit?.memory,cpu:p.monit?.cpu}))\"",
    { fallback: "{}" }
  );
  let pm2Json = {};
  try {
    pm2Json = JSON.parse(pm2 || "{}");
  } catch {
    pm2Json = {};
  }
  const dockerMem = sh(
    "docker stats --no-stream --format '{{.Name}} {{.MemUsage}} {{.CPUPerc}}' 2>/dev/null | grep -i sahaya | head -5",
    { fallback: "" }
  );
  const pgConns = sh(
    `docker exec sahaya-migration-db psql -U sahaya -d sahaya -tAc "SELECT count(*) FROM pg_stat_activity WHERE datname='sahaya'" 2>/dev/null || true`,
    { fallback: "" }
  );
  const nodeHeap = sh(
    "pm2 show sahaya-final-aws-monorepo-api 2>/dev/null | awk -F'│' '/heap|memory/ {print $2,$3}' | head -5",
    { fallback: "" }
  );
  return {
    ts: new Date().toISOString(),
    loadavg: load,
    memTotalMb: memTotal || null,
    memUsedMb: memUsed || null,
    memAvailMb: memAvail || null,
    pm2: pm2Json,
    dockerStats: dockerMem,
    pgConnections: Number(pgConns) || null,
    nodeHeapRaw: nodeHeap,
  };
}

export function writeJson(name, data) {
  ensureOutDir();
  const p = path.join(OUT_DIR, name);
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
  return p;
}

export function appendJsonl(name, row) {
  ensureOutDir();
  const p = path.join(OUT_DIR, name);
  fs.appendFileSync(p, JSON.stringify(row) + "\n");
  return p;
}
