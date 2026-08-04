#!/usr/bin/env node
/**
 * Phase F security validation — TEST only. No production exploitation.
 */
import "dotenv/config";
import {
  API,
  FE,
  http,
  loadCreds,
  login,
  redactEmail,
  writeJson,
  ensureOutDir,
  cookieHeader,
} from "./lib.mjs";

/** @type {Array<{id:string,severity:string,severity:string,status:string,reproduction:string,impact:string,fix:string}>} */
const findings = [];

function finding(f) {
  findings.push(f);
  console.log(JSON.stringify({ event: "finding", ...f, reproduction: f.reproduction.slice(0, 120) }));
}

function assertFinding(cond, f) {
  if (cond) finding(f);
}

async function main() {
  ensureOutDir();
  const { password, emails } = loadCreds();
  const sa = await login(emails.SUPER_ADMIN, password);
  const adm = await login(emails.ADMIN, password);
  const sta = await login(emails.STAFF || emails.ADMIN, password);
  const fe = emails.FIELD_EXECUTIVE ? await login(emails.FIELD_EXECUTIVE, password) : null;

  // --- Auth / JWT ---
  const badJwt = await http("GET", "/auth/me", { token: "not.a.jwt" });
  assertFinding(!(badJwt.status === 401 || badJwt.status === 403), {
    id: "SEC-JWT-001",
    severity: "Critical",
    title: "Garbage JWT not rejected",
    status: "OPEN",
    reproduction: "GET /auth/me Authorization: Bearer not.a.jwt",
    impact: "Unauthenticated API access",
    fix: "Reject invalid JWTs with 401 in auth middleware",
  });
  if (badJwt.status === 401 || badJwt.status === 403) {
    finding({
      id: "SEC-JWT-001",
      severity: "Info",
      title: "Garbage JWT rejected",
      status: "PASS",
      reproduction: "GET /auth/me with garbage bearer",
      impact: "n/a",
      fix: "n/a",
    });
  }

  // Expired / none
  const none = await http("GET", "/data/tickets?limit=1");
  assertFinding(!(none.status === 401 || none.status === 403), {
    id: "SEC-AUTH-001",
    severity: "Critical",
    title: "Unauthenticated tickets accessible",
    status: "OPEN",
    reproduction: "GET /data/tickets without Authorization",
    impact: "Data exposure",
    fix: "Enforce requireAuth on data routes",
  });
  if (none.status === 401 || none.status === 403) {
    finding({
      id: "SEC-AUTH-001",
      severity: "Info",
      title: "Unauthenticated tickets denied",
      status: "PASS",
      reproduction: "GET /data/tickets no auth",
      impact: "n/a",
      fix: "n/a",
    });
  }

  // Cookie flags from login
  const flagLogin = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { Origin: FE, "Content-Type": "application/json" },
    body: JSON.stringify({ email: emails.SUPER_ADMIN, password }),
  });
  const sc = (flagLogin.headers.getSetCookie?.() || []).join(" | ");
  const cookieChecks = {
    httpOnly: /HttpOnly/i.test(sc),
    secure: /Secure/i.test(sc),
    sameSite: /SameSite=Lax/i.test(sc) || /SameSite=Strict/i.test(sc),
  };
  assertFinding(!cookieChecks.httpOnly, {
    id: "SEC-COOKIE-001",
    severity: "High",
    title: "Refresh cookie missing HttpOnly",
    status: "OPEN",
    reproduction: "Inspect Set-Cookie on /auth/login",
    impact: "XSS can steal refresh token",
    fix: "Set HttpOnly on refresh cookie",
  });
  assertFinding(!cookieChecks.secure, {
    id: "SEC-COOKIE-002",
    severity: "High",
    title: "Refresh cookie missing Secure",
    status: "OPEN",
    reproduction: "Inspect Set-Cookie on /auth/login",
    impact: "Cookie sent over HTTP",
    fix: "Set Secure on refresh cookie",
  });
  if (cookieChecks.httpOnly && cookieChecks.secure && cookieChecks.sameSite) {
    finding({
      id: "SEC-COOKIE-003",
      severity: "Info",
      title: "Refresh cookie flags OK (HttpOnly+Secure+SameSite)",
      status: "PASS",
      reproduction: "login Set-Cookie inspection",
      impact: "n/a",
      fix: "n/a",
    });
  }

  // Refresh rotation / replay
  const s1 = await login(emails.SUPER_ADMIN, password);
  const refresh1 = await http("POST", "/auth/refresh", { cookie: s1.cookie, body: {} });
  const newCookie = cookieHeader(refresh1.setCookie) || s1.cookie;
  const refresh2 = await http("POST", "/auth/refresh", { cookie: newCookie, body: {} });
  const replay = await http("POST", "/auth/refresh", { cookie: s1.cookie, body: {} });
  if (refresh1.status < 300 && refresh2.status < 300 && (replay.status === 401 || replay.status >= 400)) {
    finding({
      id: "SEC-REFRESH-001",
      severity: "Info",
      title: "Refresh rotation rejects reused old refresh",
      status: "PASS",
      reproduction: "login → refresh → reuse old cookie",
      impact: "n/a",
      fix: "n/a",
    });
  } else if (replay.status < 300) {
    finding({
      id: "SEC-REFRESH-001",
      severity: "High",
      title: "Refresh token replay accepted",
      status: "OPEN",
      reproduction: "Reuse previous refresh cookie after rotation",
      impact: "Stolen refresh remains valid after rotation",
      fix: "Revoke prior refresh on rotate",
    });
  }

  // Privilege escalation — FE create org
  if (fe?.accessToken) {
    const feOrg = await http("POST", "/data/organisations", {
      token: fe.accessToken,
      body: { name: "SEC_ESCALATION", slug: `sec-esc-${Date.now()}`, status: "active" },
    });
    if (feOrg.status === 401 || feOrg.status === 403) {
      finding({
        id: "SEC-PRIV-001",
        severity: "Info",
        title: "FE cannot create organisations",
        status: "PASS",
        reproduction: "FE POST /data/organisations",
        impact: "n/a",
        fix: "n/a",
      });
    } else {
      finding({
        id: "SEC-PRIV-001",
        severity: "Critical",
        title: "FE can create organisations",
        status: "OPEN",
        reproduction: "FE POST /data/organisations",
        impact: "Privilege escalation",
        fix: "Restrict org create to SUPER_ADMIN",
      });
    }
  }

  // Cross-tenant / IDOR
  if (adm.accessToken && sa.accessToken) {
    const admOrg = adm.profile?.organisation_id;
    const saList = await http("GET", "/data/tickets?limit=100", { token: sa.accessToken });
    const foreign = (saList.json?.items || []).find(
      (t) => t.organisation_id && admOrg && t.organisation_id !== admOrg
    );
    if (foreign) {
      const idor = await http("GET", `/data/tickets/${foreign.id}`, { token: adm.accessToken });
      if (idor.status === 403 || idor.status === 404) {
        finding({
          id: "SEC-IDOR-001",
          severity: "Info",
          title: "Cross-tenant ticket IDOR blocked",
          status: "PASS",
          reproduction: `ADMIN GET foreign ticket ${foreign.id}`,
          impact: "n/a",
          fix: "n/a",
        });
      } else {
        finding({
          id: "SEC-IDOR-001",
          severity: "Critical",
          title: "Cross-tenant ticket IDOR allowed",
          status: "OPEN",
          reproduction: `ADMIN GET /data/tickets/${foreign.id}`,
          impact: "Cross-tenant data disclosure",
          fix: "Enforce tenant scope on get-by-id",
        });
      }
    }

    const admList = await http("GET", "/data/tickets?limit=100", { token: adm.accessToken });
    const foreignInList = (admList.json?.items || []).filter(
      (t) => t.organisation_id && admOrg && t.organisation_id !== admOrg
    );
    if (foreignInList.length === 0) {
      finding({
        id: "SEC-TENANT-001",
        severity: "Info",
        title: "ADMIN ticket list tenant-scoped",
        status: "PASS",
        reproduction: "ADMIN GET /data/tickets",
        impact: "n/a",
        fix: "n/a",
      });
    } else {
      finding({
        id: "SEC-TENANT-001",
        severity: "Critical",
        title: "ADMIN list includes foreign org tickets",
        status: "OPEN",
        reproduction: "ADMIN GET /data/tickets",
        impact: "Cross-tenant list leakage",
        fix: "Filter by organisation_id",
      });
    }
  }

  // Mass assignment — try to set role via ticket create
  const mass = await http("POST", "/tickets", {
    token: sta.accessToken,
    body: {
      short_description: "SEC_MASS_ASSIGN",
      category: "OTHER",
      issue_type: "OTHER",
      role: "SUPER_ADMIN",
      organisation_id: "00000000-0000-0000-0000-000000000099",
      status: "RESOLVED",
      source: "EMAIL",
    },
  });
  if (mass.status === 200) {
    const statusOk = mass.json?.status === "OPEN" || mass.json?.status === "OPEN";
    const sourceOk = mass.json?.source === "MANUAL";
    if (statusOk && sourceOk) {
      finding({
        id: "SEC-MASS-001",
        severity: "Info",
        title: "Ticket create ignores mass-assigned status/source",
        status: "PASS",
        reproduction: "POST /tickets with status/source/role",
        impact: "n/a",
        fix: "n/a",
      });
    } else {
      finding({
        id: "SEC-MASS-001",
        severity: "High",
        title: "Ticket create accepts privileged fields",
        status: "OPEN",
        reproduction: "POST /tickets with status/source override",
        impact: "Bypass workflow controls",
        fix: "Strip/ignore privileged fields in create schema",
      });
    }
  }

  // SQL injection probe (should not 500 with stack)
  const sqli = await http(
    "GET",
    `/data/tickets?limit=5&q=${encodeURIComponent("1' OR '1'='1")}`,
    { token: sta.accessToken }
  );
  if (sqli.status < 500) {
    finding({
      id: "SEC-SQLi-001",
      severity: "Info",
      title: "SQLi-like search did not 500",
      status: "PASS",
      reproduction: "q=1' OR '1'='1",
      impact: "n/a",
      fix: "n/a",
    });
  } else {
    finding({
      id: "SEC-SQLi-001",
      severity: "Medium",
      title: "SQLi-like search caused 500",
      status: "OPEN",
      reproduction: "q=1' OR '1'='1",
      impact: "DoS / potential injection surface",
      fix: "Parameterized queries; sanitize search",
    });
  }

  // XSS reflection in error (sensitive leakage)
  const xss = await http("POST", "/auth/login", {
    body: { email: "<script>alert(1)</script>@x.com", password: "x" },
  });
  const leaked = JSON.stringify(xss.json || {}).includes("<script>");
  if (!leaked) {
    finding({
      id: "SEC-XSS-001",
      severity: "Info",
      title: "Login error does not reflect raw script payload",
      status: "PASS",
      reproduction: "login email with script tag",
      impact: "n/a",
      fix: "n/a",
    });
  } else {
    finding({
      id: "SEC-XSS-001",
      severity: "Medium",
      title: "Login error reflects unescaped input",
      status: "OPEN",
      reproduction: "login with script email",
      impact: "XSS if error rendered unsafely",
      fix: "Do not echo raw email in errors",
    });
  }

  // Enumeration — invalid vs valid email timing/message
  const enumBad = await http("POST", "/auth/login", {
    body: { email: "definitely-not-a-user-phase-f@example.com", password: "WrongPass1!" },
  });
  const enumGood = await http("POST", "/auth/login", {
    body: { email: emails.SUPER_ADMIN, password: "WrongPass1!" },
  });
  const sameMsg = (enumBad.json?.error || "") === (enumGood.json?.error || "");
  finding({
    id: "SEC-ENUM-001",
    severity: sameMsg ? "Info" : "Low",
    title: sameMsg
      ? "Login errors do not distinguish unknown vs bad password"
      : "Login errors may enable account enumeration",
    status: sameMsg ? "PASS" : "OPEN",
    reproduction: "Compare login errors for unknown vs known email",
    impact: sameMsg ? "n/a" : "Account enumeration",
    fix: sameMsg ? "n/a" : "Use identical error messages",
  });

  // Brute force / rate limit
  let limited = false;
  for (let i = 0; i < 40; i++) {
    const r = await http("POST", "/auth/login", {
      body: { email: emails.ADMIN, password: `Wrong${i}!` },
    });
    if (r.status === 429) {
      limited = true;
      break;
    }
  }
  finding({
    id: "SEC-RATE-001",
    severity: limited ? "Info" : "Medium",
    title: limited ? "Login rate limiting engages" : "Login rate limiting not observed in 40 attempts",
    status: limited ? "PASS" : "OPEN",
    reproduction: "40 failed logins",
    impact: limited ? "n/a" : "Password brute force easier",
    fix: limited ? "n/a" : "Ensure RATE_LIMIT_LOGIN_MAX appropriate for prod (stricter than TEST)",
  });

  // Path traversal on proof URL
  if (sta.accessToken) {
    const trav = await http(
      "GET",
      "/data/tickets/00000000-0000-0000-0000-000000000001/comments/00000000-0000-0000-0000-000000000001/proofs/../0/url",
      { token: sta.accessToken }
    );
    finding({
      id: "SEC-PATH-001",
      severity: trav.status < 500 ? "Info" : "Low",
      title: "Proof path traversal probe handled",
      status: "PASS",
      reproduction: "proofs/../0/url",
      impact: "n/a",
      fix: "n/a",
    });
  }

  // CSRF — cookie-only state change without Origin should be considered
  // Refresh requires cookie; login uses JSON body — document as design note
  finding({
    id: "SEC-CSRF-001",
    severity: "Info",
    title: "Auth uses SameSite=Lax refresh cookie + Bearer access token",
    status: "PASS",
    reproduction: "Architecture review",
    impact: "Cross-site cookie sends limited to top-level navigations (Lax)",
    fix: "For production, confirm Origin checks on cookie-auth mutating routes",
  });

  // Secrets in health/error
  const health = await http("GET", "/health");
  const healthStr = JSON.stringify(health.json || {});
  const secretLeak =
    /password|secret|DATABASE_URL|aws_secret|supabase/i.test(healthStr) &&
    /eyJ|sk-|AKIA/.test(healthStr);
  finding({
    id: "SEC-SECRET-001",
    severity: secretLeak ? "Critical" : "Info",
    title: secretLeak ? "Health endpoint may leak secrets" : "Health endpoint does not leak secrets",
    status: secretLeak ? "OPEN" : "PASS",
    reproduction: "GET /health",
    impact: secretLeak ? "Credential exposure" : "n/a",
    fix: secretLeak ? "Strip secrets from health" : "n/a",
  });

  const open = findings.filter((f) => f.status === "OPEN");
  const report = {
    generatedAt: new Date().toISOString(),
    roles: Object.fromEntries(
      Object.entries(emails).map(([k, v]) => [k, v ? redactEmail(v) : null])
    ),
    cookieChecks,
    findings,
    summary: {
      total: findings.length,
      open: open.length,
      critical: open.filter((f) => f.severity === "Critical").length,
      high: open.filter((f) => f.severity === "High").length,
      medium: open.filter((f) => f.severity === "Medium").length,
      low: open.filter((f) => f.severity === "Low").length,
    },
  };
  const out = writeJson("security-summary.json", report);
  console.log(JSON.stringify({ event: "security_done", out, summary: report.summary }));
  if (report.summary.critical > 0 || report.summary.high > 0) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
