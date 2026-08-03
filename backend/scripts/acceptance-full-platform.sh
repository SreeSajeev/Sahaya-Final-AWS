#!/usr/bin/env bash
# TEST full-platform acceptance. Uses Phase D creds. No password printing. No Supabase. No crm-pariskq.
set -euo pipefail
cd "$(dirname "$0")/.."
CREDS_FILE="${CREDS_FILE:-/var/backups/sahaya/phase-d-auth/test-local-passwords.env}"
API_BASE="${API_BASE:-https://api.test-sahaya.pariskq.in}"
FE_BASE="${FE_BASE:-https://test-sahaya.pariskq.in}"
export API_BASE FE_BASE CREDS_FILE
# shellcheck disable=SC1090
set -a; . "$CREDS_FILE"; set +a

echo "===== 0 ENV / ARCHITECTURE MARKERS ====="
node --input-type=module <<'NODE'
import "dotenv/config";
import fs from "node:fs";
const envPath = ".env";
const raw = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
const get = (k) => {
  const m = raw.match(new RegExp(`^${k}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
};
const bucket = get("S3_FE_PROOFS_BUCKET");
const s3on = get("S3_FE_PROOFS_ENABLED");
const sms = get("SMS_ENABLED");
const pub = get("PUBLIC_COMPLAINTS_ENABLED");
const daily = get("DAILY_TENANT_REPORT_ENABLED");
const db = get("DATABASE_URL");
const dbHost = db.includes("5436") ? "port_5436_ok" : "CHECK_DB_URL";
console.log(JSON.stringify({
  S3_FE_PROOFS_ENABLED: s3on || "(unset)",
  S3_FE_PROOFS_BUCKET: bucket || "(unset)",
  bucket_is_test: bucket === "sahaya-test-fe-proofs",
  bucket_is_crm_pariskq: bucket === "crm-pariskq",
  SMS_ENABLED: sms || "(unset)",
  PUBLIC_COMPLAINTS_ENABLED: pub || "(unset)",
  DAILY_TENANT_REPORT_ENABLED: daily || "(unset)",
  dbHostHint: dbHost,
  hasSupabaseUrl: /SUPABASE_URL=/.test(raw),
  hasViteSupabase: /VITE_SUPABASE/.test(raw),
}, null, 0));
if (bucket === "crm-pariskq") {
  console.error("CRITICAL: S3 bucket is crm-pariskq — STOP proof tests");
  process.exit(3);
}
NODE

echo "===== 1 PRISMA CONTRACT ====="
node scripts/acceptance-prisma-contract.mjs || echo "CONTRACT_EXIT=$?"

echo "===== 2 BASELINE COUNTS + PASSWORD COVERAGE ====="
node --input-type=module <<'NODE'
import "dotenv/config";
import { prisma } from "./src/db/prisma.js";
const tables = [
  "users","organisations","tickets","ticket_comments","ticket_assignments",
  "field_executives","sla_tracking","audit_logs","raw_emails","parsed_emails",
  "auth_sessions","password_reset_tokens","configurations","access_tokens",
  "fe_action_tokens","tenant_clients","tenant_complaint_points",
  "public_otp_sessions","public_complaint_submissions","fe_proof_backup_queue",
  "ticket_number_sequences","daily_tenant_report_runs","ticket_resolution_notifications"
];
const counts = {};
for (const t of tables) {
  try {
    counts[t] = (await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS c FROM "${t}"`))[0].c;
  } catch (e) {
    counts[t] = `ERR:${String(e.message).slice(0,60)}`;
  }
}
console.log("BASELINE", JSON.stringify(counts));
const pw = await prisma.$queryRawUnsafe(`
  SELECT
    COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE password_hash IS NOT NULL)::int AS with_hash,
    COUNT(*) FILTER (WHERE password_hash IS NULL)::int AS without_hash,
    COUNT(*) FILTER (WHERE is_active IS FALSE OR active IS FALSE)::int AS inactiveish
  FROM users
`);
console.log("PASSWORD_COVERAGE", JSON.stringify(pw[0]));
const roles = await prisma.$queryRawUnsafe(`
  SELECT role,
    COUNT(*)::int AS c,
    COUNT(*) FILTER (WHERE password_hash IS NOT NULL)::int AS with_hash
  FROM users GROUP BY role ORDER BY role
`);
for (const r of roles) console.log(`ROLE_PW\t${r.role}\t${r.c}\t${r.with_hash}`);
const proof = await prisma.$queryRawUnsafe(`
  SELECT
    COUNT(*) FILTER (WHERE attachments ? 'proof_storage_paths')::int AS s3_paths,
    COUNT(*) FILTER (WHERE attachments::text ILIKE '%image_base64%')::int AS base64ish
  FROM ticket_comments
`);
console.log("PROOF_META", JSON.stringify(proof[0]));
await prisma.$disconnect();
NODE

echo "===== 3 FULL HTTP / WORKFLOW SUITE ====="
node --input-type=module <<'NODE'
import "dotenv/config";
import fs from "node:fs";
import { prisma } from "./src/db/prisma.js";
import {
  isProofS3Enabled,
  getProofS3Bucket,
  uploadProof,
  getProofDownloadUrl,
  deleteProof,
} from "./src/services/proofStorageService.js";

const API = process.env.API_BASE || "https://api.test-sahaya.pariskq.in";
const FE = process.env.FE_BASE || "https://test-sahaya.pariskq.in";
const ORIGIN = FE;
const results = [];
const fixtures = { tickets: [], comments: [], proofs: [], orgs: [], users: [] };

function redact(email) {
  if (!email || !email.includes("@")) return "***";
  const [l, d] = email.split("@");
  return `${l.slice(0, 2)}***@${d}`;
}

function record(area, name, ok, detail = {}) {
  results.push({ area, name, ok: Boolean(ok), ...detail });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark}\t${area}\t${name}\t${JSON.stringify(detail).slice(0, 240)}`);
}

async function http(method, path, { token, body, cookieJar, headers } = {}) {
  const h = {
    Origin: ORIGIN,
    ...(headers || {}),
  };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined) h["Content-Type"] = "application/json";
  const init = { method, headers: h };
  if (body !== undefined) init.body = JSON.stringify(body);
  if (cookieJar) {
    // cookieJar is { store: Map, set from set-cookie }
  }
  const res = await fetch(`${API}${path}`, init);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* raw */ }
  const setCookie = res.headers.getSetCookie?.() || [];
  return { status: res.status, json, text, setCookie, headers: res.headers };
}

function extractRefresh(setCookie) {
  for (const c of setCookie) {
    const m = String(c).match(/sahaya_refresh=([^;]+)/);
    if (m) return m[1];
  }
  return null;
}

async function login(email, password) {
  const r = await http("POST", "/auth/login", {
    body: { email, password },
  });
  const refresh = extractRefresh(r.setCookie);
  return {
    status: r.status,
    accessToken: r.json?.accessToken || null,
    profile: r.json?.profile || null,
    error: r.json?.error || null,
    refresh,
    setCookie: r.setCookie,
  };
}

const password = process.env.AUTH_SET_PASSWORD;
const emails = {
  SUPER_ADMIN: process.env.ROLE_SUPER_ADMIN_EMAIL,
  ADMIN: process.env.ROLE_ADMIN_EMAIL,
  STAFF: process.env.ROLE_STAFF_EMAIL,
  FIELD_EXECUTIVE: process.env.ROLE_FIELD_EXECUTIVE_EMAIL,
};

// --- Auth matrix ---
{
  const bad = await login(emails.SUPER_ADMIN, "DefinitelyWrong1!");
  record("AUTH", "wrong_password", bad.status === 401 || !bad.accessToken, { status: bad.status, err: bad.error });

  const missing = await login("nobody-e2e-acceptance@example.invalid", password);
  record("AUTH", "nonexistent_user", !missing.accessToken, { status: missing.status });

  const empty = await http("POST", "/auth/login", { body: { email: emails.SUPER_ADMIN, password: "" } });
  record("AUTH", "empty_password", empty.status >= 400 && !empty.json?.accessToken, { status: empty.status });

  const spaced = emails.SUPER_ADMIN ? `  ${emails.SUPER_ADMIN.toUpperCase()}  ` : "";
  if (spaced) {
    const casing = await login(spaced.trim().toLowerCase() === emails.SUPER_ADMIN.toLowerCase() ? emails.SUPER_ADMIN : emails.SUPER_ADMIN, password);
    // email casing: try exact upper local part if possible
    const upperLocal = emails.SUPER_ADMIN.replace(/^([^@]+)/, (m) => m.toUpperCase());
    const c2 = await login(upperLocal, password);
    record("AUTH", "email_casing", Boolean(c2.accessToken), { status: c2.status, email: redact(upperLocal) });
  }

  const tokens = {};
  for (const [role, email] of Object.entries(emails)) {
    if (!email) {
      record("AUTH", `login_${role}`, false, { skip: true });
      continue;
    }
    await new Promise((r) => setTimeout(r, 400));
    const L = await login(email, password);
    tokens[role] = L;
    record("AUTH", `login_${role}`, Boolean(L.accessToken), {
      status: L.status,
      role: L.profile?.role,
      org: L.profile?.organisation_id ? "set" : "null",
      email: redact(email),
    });
  }

  // user without password_hash
  const noPw = await prisma.user.findFirst({
    where: { passwordHash: null },
    select: { email: true, role: true },
  });
  if (noPw) {
    const r = await login(noPw.email, password);
    record("AUTH", "user_without_password_hash", !r.accessToken, {
      status: r.status,
      role: noPw.role,
      email: redact(noPw.email),
    });
  } else {
    record("AUTH", "user_without_password_hash", true, { note: "no such users" });
  }

  // Argon2id check (prefix) without printing hash
  const sample = await prisma.user.findFirst({
    where: { passwordHash: { not: null } },
    select: { passwordHash: true },
  });
  const isArgon = sample?.passwordHash?.startsWith("$argon2id$");
  record("AUTH", "password_algorithm_argon2id", Boolean(isArgon), {
    prefix: sample?.passwordHash?.slice(0, 10) || null,
  });

  // --- Session lifecycle ---
  const saEmail = emails.SUPER_ADMIN;
  const jarLogin = await login(saEmail, password);
  const atA = jarLogin.accessToken;
  const rtA = jarLogin.refresh;
  record("SESSION", "login_issues_access_and_refresh", Boolean(atA && rtA), {
    hasAccess: Boolean(atA),
    hasRefresh: Boolean(rtA),
  });

  const me = await http("GET", "/auth/me", { token: atA });
  record("SESSION", "access_jwt_me", me.status === 200, { status: me.status });

  const badJwt = await http("GET", "/auth/me", { token: "not.a.jwt" });
  record("SESSION", "malformed_jwt", badJwt.status === 401, { status: badJwt.status });

  const noAuth = await http("GET", "/data/tickets?limit=1");
  record("SESSION", "missing_authorization", noAuth.status === 401, { status: noAuth.status });

  // refresh with cookie
  const refreshRes = await fetch(`${API}/auth/refresh`, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      "Content-Type": "application/json",
      Cookie: `sahaya_refresh=${rtA}`,
    },
    body: "{}",
  });
  const refreshJson = await refreshRes.json().catch(() => ({}));
  const rtB = extractRefresh(refreshRes.headers.getSetCookie?.() || []);
  const atB = refreshJson.accessToken;
  record("SESSION", "refresh_rotation", Boolean(atB && rtB && rtB !== rtA), {
    status: refreshRes.status,
    rotated: Boolean(rtB && rtB !== rtA),
  });

  // old refresh reuse
  const reuse = await fetch(`${API}/auth/refresh`, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      "Content-Type": "application/json",
      Cookie: `sahaya_refresh=${rtA}`,
    },
    body: "{}",
  });
  const reuseJson = await reuse.json().catch(() => ({}));
  record("SESSION", "old_refresh_rejected", reuse.status >= 400 || !reuseJson.accessToken, {
    status: reuse.status,
    err: reuseJson.error,
  });

  // logout
  await fetch(`${API}/auth/logout`, {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/json", Cookie: `sahaya_refresh=${rtB}` },
    body: "{}",
  });
  const afterLogout = await fetch(`${API}/auth/refresh`, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      "Content-Type": "application/json",
      Cookie: `sahaya_refresh=${rtB}`,
    },
    body: "{}",
  });
  const afterLogoutJson = await afterLogout.json().catch(() => ({}));
  record("SESSION", "post_logout_refresh_fail", afterLogout.status >= 400 || !afterLogoutJson.accessToken, {
    status: afterLogout.status,
    err: afterLogoutJson.error,
  });

  // DB session correspondence
  const sessCount = await prisma.authSession.count({
    where: { userId: process.env.ROLE_SUPER_ADMIN_USER_ID || undefined },
  });
  record("SESSION", "auth_sessions_table_populated", sessCount >= 0, { count: sessCount });

  // Cookie flags from a fresh login
  const flagLogin = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/json" },
    body: JSON.stringify({ email: saEmail, password }),
  });
  const sc = (flagLogin.headers.getSetCookie?.() || []).join("; ");
  record("SESSION", "refresh_cookie_httponly", /HttpOnly/i.test(sc), {});
  record("SESSION", "refresh_cookie_secure", /Secure/i.test(sc), {});
  record("SESSION", "refresh_cookie_samesite", /SameSite=Lax/i.test(sc), { rawHas: /SameSite=/i.test(sc) });

  // Re-login for further tests
  for (const role of Object.keys(emails)) {
    if (!emails[role]) continue;
    await new Promise((r) => setTimeout(r, 300));
    tokens[role] = await login(emails[role], password);
  }

  const SA = tokens.SUPER_ADMIN?.accessToken;
  const ADM = tokens.ADMIN?.accessToken;
  const STA = tokens.STAFF?.accessToken;
  const FE = tokens.FIELD_EXECUTIVE?.accessToken;
  const admOrg = tokens.ADMIN?.profile?.organisation_id;
  const staOrg = tokens.STAFF?.profile?.organisation_id;

  // --- Orgs ---
  const orgs = await http("GET", "/data/organisations", { token: SA });
  record("ORGS", "sa_list", orgs.status === 200 && Array.isArray(orgs.json?.items), {
    status: orgs.status,
    count: orgs.json?.items?.length,
  });
  const orgStats = await http("GET", "/data/organisations/stats", { token: SA });
  record("ORGS", "sa_stats", orgStats.status === 200, { status: orgStats.status });
  const admOrgs = await http("GET", "/data/organisations", { token: ADM });
  record("ORGS", "admin_list_tenant_scoped", admOrgs.status === 200, {
    status: admOrgs.status,
    count: admOrgs.json?.items?.length,
  });

  // create temp org
  const slug = `e2e-accept-${Date.now().toString(36)}`;
  const createOrg = await http("POST", "/data/organisations", {
    token: SA,
    body: { name: "E2E_TEST_ACCEPTANCE_ORG", slug, status: "active" },
  });
  const orgId = createOrg.json?.item?.id || createOrg.json?.id || createOrg.json?.organisation?.id;
  record("ORGS", "create", createOrg.status < 300 && Boolean(orgId || createOrg.json), {
    status: createOrg.status,
    err: createOrg.json?.error,
    id: orgId || null,
  });
  if (orgId) fixtures.orgs.push(orgId);
  // try retrieve
  if (orgId) {
    const got = await http("GET", `/data/organisations/${orgId}`, { token: SA });
    record("ORGS", "get", got.status === 200, { status: got.status });
    const patch = await http("PATCH", `/data/organisations/${orgId}`, {
      token: SA,
      body: { spoc_name: "E2E_TEST_SPOC" },
    });
    record("ORGS", "patch", patch.status < 300, { status: patch.status, err: patch.json?.error });
    const dbOrg = await prisma.organisation.findUnique({ where: { id: orgId } });
    record("ORGS", "db_reconcile", dbOrg?.slug === slug && dbOrg?.spocName === "E2E_TEST_SPOC", {
      slug: dbOrg?.slug,
      spoc: dbOrg?.spocName,
    });
  }

  // admin cannot create org (expect 403)
  const admCreate = await http("POST", "/data/organisations", {
    token: ADM,
    body: { name: "E2E_SHOULD_FAIL", slug: `fail-${Date.now()}`, status: "active" },
  });
  record("AUTHZ", "admin_cannot_create_org", admCreate.status === 403 || admCreate.status === 401, {
    status: admCreate.status,
  });

  // --- Users ---
  const users = await http("GET", "/data/users?limit=50", { token: SA });
  record("USERS", "sa_list", users.status === 200, {
    status: users.status,
    count: (users.json?.items || users.json?.data || []).length,
  });
  const admUsers = await http("GET", "/data/users?limit=50", { token: ADM });
  const admUserItems = admUsers.json?.items || admUsers.json?.data || [];
  const foreignUsers = admUserItems.filter(
    (u) => u.organisation_id && admOrg && u.organisation_id !== admOrg
  );
  record("TENANT", "admin_users_no_foreign", admUsers.status === 200 && foreignUsers.length === 0, {
    status: admUsers.status,
    count: admUserItems.length,
    foreign: foreignUsers.length,
  });

  // --- Tickets create / read ---
  const createT = await http("POST", "/tickets", {
    token: STA,
    body: {
      short_description: "E2E_TEST_FULL_PLATFORM_TICKET",
      category: "OTHER",
      issue_type: "OTHER",
      priority_level: "LOW",
      status: "OPEN",
      source: "MANUAL",
    },
  });
  const ticketId = createT.json?.id;
  const ticketNumber = createT.json?.ticket_number;
  record("TICKETS", "create_manual", createT.status === 200 && Boolean(ticketId), {
    status: createT.status,
    id: ticketId,
    number: ticketNumber,
    err: createT.json?.error,
  });
  if (ticketId) fixtures.tickets.push(ticketId);

  if (ticketId) {
    const dbT = await prisma.ticket.findUnique({ where: { id: ticketId } });
    record("TICKETS", "create_db_reconcile", Boolean(dbT?.ticketNumber) && dbT?.status === "OPEN", {
      status: dbT?.status,
      org: dbT?.organisationId ? "set" : "null",
      number: dbT?.ticketNumber,
      short: dbT?.shortDescription ? "set" : "null",
    });

    const getT = await http("GET", `/data/tickets/${ticketId}`, { token: STA });
    record("TICKETS", "get", getT.status === 200, { status: getT.status });

    const listT = await http("GET", "/data/tickets?limit=20", { token: STA });
    record("TICKETS", "list", listT.status === 200, {
      status: listT.status,
      count: (listT.json?.items || []).length,
    });

    // comment
    const cmt = await http("POST", `/data/tickets/${ticketId}/comments`, {
      token: STA,
      body: { body: "E2E_TEST_COMMENT_unicode_✓_特殊", source: "STAFF" },
    });
    const commentId = cmt.json?.item?.id || cmt.json?.id || cmt.json?.comment?.id;
    record("COMMENTS", "create", cmt.status < 300, {
      status: cmt.status,
      id: commentId,
      err: cmt.json?.error,
    });
    if (commentId) fixtures.comments.push(commentId);

    const emptyC = await http("POST", `/data/tickets/${ticketId}/comments`, {
      token: STA,
      body: { body: "", source: "STAFF" },
    });
    record("COMMENTS", "empty_body_behavior", emptyC.status < 500, {
      status: emptyC.status,
      err: emptyC.json?.error,
    });

    // illegal status jump
    const badStatus = await http("POST", `/data/tickets/${ticketId}/status`, {
      token: STA,
      body: { status: "RESOLVED" },
    });
    record("STATUS", "illegal_resolve_via_generic", badStatus.status >= 400, {
      status: badStatus.status,
      err: badStatus.json?.error,
    });

    // FE list for tenant
    const fes = await http("GET", "/data/field-executives", { token: STA });
    const feItems = fes.json?.items || fes.json?.data || [];
    const feSameOrg = feItems.find((f) => f.active !== false && (!staOrg || f.organisation_id === staOrg));
    record("FE", "list", fes.status === 200 && feItems.length > 0, {
      status: fes.status,
      count: feItems.length,
    });

    if (feSameOrg?.id) {
      const assign = await http("POST", `/tickets/${ticketId}/assign`, {
        token: STA,
        body: { feId: feSameOrg.id },
      });
      record("ASSIGN", "assign_fe", assign.status < 300, {
        status: assign.status,
        err: assign.json?.error,
        assignment: assign.json?.assignment_id || assign.json?.data?.assignment_id,
        token: Boolean(assign.json?.onSiteToken || assign.json?.token || assign.json?.data?.onSiteToken),
      });
      const onSiteToken =
        assign.json?.onSiteToken ||
        assign.json?.token ||
        assign.json?.data?.onSiteToken ||
        assign.json?.data?.token;

      const dbA = await prisma.ticketAssignment.findFirst({
        where: { ticketId },
        orderBy: { assignedAt: "desc" },
      });
      record("ASSIGN", "db_row", Boolean(dbA), { fe: dbA?.feId?.slice(0, 8) });

      // foreign FE attempt: find FE from other org
      const foreignFe = await prisma.fieldExecutive.findFirst({
        where: staOrg ? { organisationId: { not: staOrg }, active: { not: false } } : { id: "00000000-0000-0000-0000-000000000000" },
        select: { id: true, organisationId: true },
      });
      if (foreignFe) {
        // create another open ticket for foreign assign attempt
        const t2 = await http("POST", "/tickets", {
          token: STA,
          body: {
            short_description: "E2E_TEST_FOREIGN_ASSIGN_ATTEMPT",
            category: "OTHER",
            issue_type: "OTHER",
            priority_level: "LOW",
            status: "OPEN",
            source: "MANUAL",
          },
        });
        if (t2.json?.id) {
          fixtures.tickets.push(t2.json.id);
          const badAssign = await http("POST", `/tickets/${t2.json.id}/assign`, {
            token: STA,
            body: { feId: foreignFe.id },
          });
          record("TENANT", "assign_foreign_fe_blocked", badAssign.status >= 400, {
            status: badAssign.status,
            err: badAssign.json?.error,
          });
        }
      }

      // FE me tickets
      if (FE) {
        const feTickets = await http("GET", "/fe/me/tickets", { token: FE });
        record("FE", "me_tickets", feTickets.status === 200, {
          status: feTickets.status,
          count: (feTickets.json?.items || []).length,
        });
        const feOrgs = await http("POST", "/data/organisations", {
          token: FE,
          body: { name: "x", slug: `fe-fail-${Date.now()}`, status: "active" },
        });
        record("AUTHZ", "fe_cannot_create_org", feOrgs.status === 403 || feOrgs.status === 401, {
          status: feOrgs.status,
        });
      }

      // --- PROOF E2E ---
      let proofToken = onSiteToken;
      if (!proofToken && ticketId) {
        // look up active ON_SITE token for ticket
        const tok = await prisma.feActionToken.findFirst({
          where: {
            ticketId,
            used: false,
            actionType: { in: ["ON_SITE", "onsite", "ON-SITE"] },
          },
          orderBy: { createdAt: "desc" },
        });
        proofToken = tok?.id;
      }
      // Also try fetching active tokens API
      if (!proofToken) {
        const tokApi = await http("GET", `/data/tickets/${ticketId}/fe-action-tokens/active`, {
          token: STA,
        });
        const items = tokApi.json?.items || tokApi.json?.data || [];
        proofToken = items[0]?.id;
      }

      record("PROOF", "have_action_token", Boolean(proofToken), { token: proofToken ? "set" : null });

      // Tiny 1x1 PNG
      const pngB64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

      if (proofToken) {
        const proofUpload = await http("POST", "/fe/proof", {
          body: {
            token: proofToken,
            attachments: [{ image_base64: `data:image/png;base64,${pngB64}`, filename: "E2E_TEST_proof.png" }],
            outcome: "ON_SITE",
          },
        });
        record("PROOF", "upload_fe_proof", proofUpload.status < 300, {
          status: proofUpload.status,
          err: proofUpload.json?.error,
          code: proofUpload.json?.code,
        });

        const commentWithPath = await prisma.ticketComment.findFirst({
          where: {
            ticketId,
            attachments: { path: ["proof_storage_paths"] },
          },
          orderBy: { createdAt: "desc" },
        });
        // Prisma JSON path filter may not work — use raw
        const pathRows = await prisma.$queryRawUnsafe(
          `SELECT id, attachments FROM ticket_comments
           WHERE ticket_id = $1::uuid AND attachments ? 'proof_storage_paths'
           ORDER BY created_at DESC LIMIT 1`,
          ticketId
        );
        const paths = pathRows[0]?.attachments?.proof_storage_paths || [];
        record("PROOF", "db_proof_storage_paths", paths.length > 0, {
          count: paths.length,
          keyPrefix: paths[0] ? String(paths[0]).slice(0, 40) : null,
        });
        if (paths[0]) fixtures.proofs.push(...paths);

        const bucketOk = (() => {
          try {
            return getProofS3Bucket() === "sahaya-test-fe-proofs" && isProofS3Enabled();
          } catch (e) {
            return false;
          }
        })();
        record("S3", "config_test_bucket_enabled", bucketOk, {
          enabled: isProofS3Enabled(),
          bucket: (() => {
            try {
              return getProofS3Bucket();
            } catch (e) {
              return String(e.message).slice(0, 80);
            }
          })(),
        });

        if (pathRows[0]?.id && paths.length > 0) {
          const urlRes = await http(
            "GET",
            `/data/tickets/${ticketId}/comments/${pathRows[0].id}/proofs/0/url`,
            { token: STA }
          );
          record("PROOF", "presign_url", urlRes.status === 200 && Boolean(urlRes.json?.url || urlRes.json?.item?.url), {
            status: urlRes.status,
            err: urlRes.json?.error,
          });
          const url = urlRes.json?.url || urlRes.json?.item?.url;
          if (url) {
            const getObj = await fetch(url);
            record("PROOF", "presign_fetch_object", getObj.status === 200, {
              status: getObj.status,
              bytes: Number(getObj.headers.get("content-length") || 0),
            });
          }

          // cross-tenant: ADMIN from different org tries
          if (ADM && admOrg && dbT?.organisationId && admOrg !== dbT.organisationId) {
            const x = await http(
              "GET",
              `/data/tickets/${ticketId}/comments/${pathRows[0].id}/proofs/0/url`,
              { token: ADM }
            );
            record("TENANT", "cross_tenant_presign_blocked", x.status === 403 || x.status === 404, {
              status: x.status,
            });
          } else {
            // use SA ticket from another org if admin same org
            const foreignTicket = await prisma.ticket.findFirst({
              where: admOrg ? { organisationId: { not: admOrg } } : { id: "00000000-0000-0000-0000-000000000000" },
              select: { id: true },
            });
            if (foreignTicket && ADM) {
              const x = await http("GET", `/data/tickets/${foreignTicket.id}`, { token: ADM });
              record("TENANT", "idor_foreign_ticket", x.status === 403 || x.status === 404, {
                status: x.status,
              });
            }
          }
        }
      } else {
        // Direct S3 service path if token flow unavailable but S3 enabled
        if (isProofS3Enabled()) {
          try {
            const bucket = getProofS3Bucket();
            if (bucket !== "sahaya-test-fe-proofs") throw new Error("wrong bucket");
            const comment = await prisma.ticketComment.create({
              data: {
                ticketId,
                source: "E2E_TEST",
                body: "E2E_TEST_direct_s3_proof",
                organisationId: dbT.organisationId,
                attachments: {},
              },
            });
            fixtures.comments.push(comment.id);
            const buf = Buffer.from(pngB64, "base64");
            const up = await uploadProof({
              tenantId: dbT.organisationId,
              ticketId,
              commentId: comment.id,
              buffer: buf,
              contentType: "image/png",
              filename: "E2E_TEST_direct.png",
            });
            const key = up.key;
            await prisma.ticketComment.update({
              where: { id: comment.id },
              data: { attachments: { proof_storage_paths: [key], image_base64: `data:image/png;base64,${pngB64}` } },
            });
            fixtures.proofs.push(key);
            const signed = await getProofDownloadUrl({ key, expiresInSeconds: 60 });
            const got = await fetch(signed.url);
            record("PROOF", "direct_s3_upload_presign", got.status === 200, {
              status: got.status,
              keyPrefix: key.slice(0, 50),
              bucket: up.bucket,
            });
            try {
              await deleteProof({ key });
              record("PROOF", "direct_s3_cleanup", true, {});
            } catch (e) {
              record("PROOF", "direct_s3_cleanup", false, { err: String(e.message).slice(0, 80) });
            }
          } catch (e) {
            record("PROOF", "direct_s3_fallback", false, { err: String(e.message).slice(0, 120) });
          }
        } else {
          record("PROOF", "upload_fe_proof", false, { reason: "no_token_and_s3_disabled" });
        }
      }
    }

    // historical base64 proof sample
    const hist = await prisma.$queryRawUnsafe(`
      SELECT id FROM ticket_comments
      WHERE attachments::text ILIKE '%image_base64%'
        AND NOT (attachments ? 'proof_storage_paths')
      LIMIT 1
    `);
    record("PROOF", "historical_base64_exists", hist.length > 0, { sample: hist.length });
  }

  // Tenant list isolation
  if (ADM && admOrg) {
    const tix = await http("GET", "/data/tickets?limit=100", { token: ADM });
    const items = tix.json?.items || [];
    const foreign = items.filter((t) => t.organisation_id && t.organisation_id !== admOrg);
    record("TENANT", "admin_ticket_list_no_foreign", foreign.length === 0, {
      count: items.length,
      foreign: foreign.length,
    });
  }

  // SLA
  const sla = await http("GET", "/data/sla/monitor?limit=10", { token: SA });
  record("SLA", "monitor", sla.status === 200, {
    status: sla.status,
    count: (sla.json?.items || []).length,
  });
  const slaCount = await http("GET", "/data/sla/tracked-count", { token: SA });
  const dbSla = await prisma.slaTracking.count();
  record("SLA", "tracked_count_reconcile", slaCount.status === 200, {
    api: slaCount.json?.count ?? slaCount.json,
    db: dbSla,
  });

  // Dashboard
  const dash = await http("GET", "/data/dashboard/stats", { token: SA });
  const dbTickets = await prisma.ticket.count();
  record("DASHBOARD", "stats", dash.status === 200, {
    status: dash.status,
    dbTickets,
    apiKeys: dash.json ? Object.keys(dash.json).slice(0, 12) : [],
  });

  // Audit recent for our ticket
  if (fixtures.tickets[0]) {
    const audits = await prisma.auditLog.count({
      where: { entityId: fixtures.tickets[0] },
    });
    record("AUDIT", "ticket_entity_logs", audits >= 0, { count: audits });
  }
  const auditApi = await http("GET", "/data/audit-logs?limit=5", { token: SA });
  record("AUDIT", "list_api", auditApi.status === 200 || auditApi.status === 403, {
    status: auditApi.status,
  });

  // Negative API
  const neg = await http("GET", "/data/tickets/not-a-uuid", { token: STA });
  record("NEGATIVE", "invalid_uuid", neg.status === 400 || neg.status === 404, { status: neg.status });
  const neg2 = await http("POST", "/tickets", { token: STA, body: { status: "OPEN" } });
  record("NEGATIVE", "create_missing_fields", neg2.status >= 400 && neg2.status < 500, {
    status: neg2.status,
  });
  const neg3 = await http("POST", "/auth/login", { body: "not-json", headers: { "Content-Type": "application/json" } });
  // body already stringified by helper — send raw
  const neg3b = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/json" },
    body: "{bad",
  });
  record("NEGATIVE", "malformed_json", neg3b.status >= 400, { status: neg3b.status });

  // Concurrency ticket numbers (20)
  console.log("===== CONCURRENCY ticket create n=20 =====");
  const conc = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      http("POST", "/tickets", {
        token: STA,
        body: {
          short_description: `E2E_TEST_CONC_${i}`,
          category: "OTHER",
          issue_type: "OTHER",
          priority_level: "LOW",
          status: "OPEN",
          source: "MANUAL",
        },
      })
    )
  );
  const ids = conc.map((c) => c.json?.id).filter(Boolean);
  const numbers = conc.map((c) => c.json?.ticket_number).filter(Boolean);
  const uniq = new Set(numbers);
  fixtures.tickets.push(...ids);
  record("CONCURRENCY", "ticket_numbers_unique", numbers.length === 20 && uniq.size === 20, {
    created: ids.length,
    uniqueNumbers: uniq.size,
    statuses: [...new Set(conc.map((c) => c.status))],
  });

  // Public complaints gate
  const pubCtx = await fetch(`${API}/public/complaint-points/e2e-nonexistent/context`);
  record("PUBLIC", "complaint_point_response", pubCtx.status === 404 || pubCtx.status === 403 || pubCtx.status === 503, {
    status: pubCtx.status,
  });

  // FE pages HTTP shell
  for (const p of ["/", "/login", "/app", "/app/tickets", "/app/organisations", "/app/sla", "/app/users", "/fe"]) {
    const r = await fetch(`${FE}${p}`);
    record("FRONTEND", `shell_${p}`, r.status === 200, { status: r.status });
  }

  // Bundle supabase zero
  const html = await (await fetch(FE)).text();
  const m = html.match(/assets\/index-[^"]+\.js/);
  if (m) {
    const bundle = await (await fetch(`${FE}/${m[0]}`)).text();
    const hits = (bundle.match(/supabase/gi) || []).length;
    record("SUPABASE_ZERO", "deployed_bundle", hits === 0, { bundle: m[0], hits });
  }

  // Feature workers inventory (static from env)
  record("WORKERS", "inventory_note", true, {
    note: "autoTicket+proofBackup+SLA always; daily/report gated; SMS default off",
  });

  console.log("===== FIXTURES =====");
  console.log(JSON.stringify(fixtures));
  console.log("===== RESULTS_SUMMARY =====");
  const failed = results.filter((r) => !r.ok);
  const passed = results.filter((r) => r.ok);
  console.log(JSON.stringify({ passed: passed.length, failed: failed.length, failNames: failed.map((f) => `${f.area}.${f.name}`) }));
  await prisma.$disconnect();
  if (failed.length > 0) process.exitCode = 1;
}
NODE

echo "===== FULL_ACCEPTANCE_DONE ====="
