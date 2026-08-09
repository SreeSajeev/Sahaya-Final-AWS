# SECURITY AUDIT

**Scope:** Metadata Platform engines, APIs, builders  
**Method:** Code review + live Node probes (2026-08-09)  
**Stance:** Assume hostile METADATA admin and hostile API client

---

## Critical findings (P0)

### S-01 — Formula sandbox escape via `new Function`

**Evidence (probe):**
```text
evaluateFormula('([]).constructor.constructor("return 1+1")()')
→ { ok: true, value: 2 }
```
Blocklist regex does **not** stop constructor chains. This is arbitrary JS evaluation in the Node process when formula APIs/publish paths are reachable.

**Location:** `backend/src/platform/form-engine/formula.js:67-78`  
**Also exposed via:** `POST /platform/engines/forms/formula`

### S-02 — Field validation ReDoS (parser fixed; forms not)

**Evidence (probe):**
```text
validateTicketDataAgainstSchema(
  { fields: [{ internalName:'x', fieldType:'single_line_text', regex:'(a+)+$' }] },
  { x: 'a'.repeat(25)+'!' }
)
→ ~4428 ms
```
Parser `safeRegex` correctly rejects `(a+)+$`, but **form field `regex` uses raw `new RegExp`**.

**Location:** `form-engine/index.js` validation loop

### S-03 — Client-supplied schema / workflow / automations on ticket create

**Evidence:**
- API: `api/index.js:234-236` passes `req.body.formSchema`, `workflowDefinition`, `automations`
- Runtime: `ticketRuntime.js:21-45` validates/applies client definitions
- UI: `MetadataTicketCreatePage.tsx` sends hardcoded `SAMPLE_SCHEMA`

**Impact:** Bypass published metadata; inject malicious validation regex; run attacker automations at create.

### S-04 — Registry / version publish races

Read-modify-write registry without row lock (`metadata-registry/index.js`).  
`MAX(version)+1` insert without serializable txn (`versioning.js`).  
Concurrent publishes can lose catalog fields or collide.

### S-05 — Dual authz (permission engine fail-closed, routes fail-open for engines)

Engine routes: ADMIN role only — **no resource grants**.  
`platformPermissions` never loaded onto `req` in production.  
Non-admin with stolen ADMIN JWT is full platform; fine-grained deny-by-default is largely decorative on engines.

---

## High findings (P1)

| ID | Issue | Notes |
|----|-------|-------|
| S-06 | XSS in notifications | **Mitigated** for `{{vars}}` — probe shows escaped HTML |
| S-07 | Automation recursion | **Mitigated** in simulate — probe `AUTOMATION_CYCLE` |
| S-08 | SQL identifier injection | **Mitigated** via allowlist in `platformCrud` |
| S-09 | Parser ReDoS | **Mitigated** via `safeRegex` |
| S-10 | Fake AI/plugin providers | Credential phishing / false security posture |
| S-11 | No CSRF tokens | Cookie/JWT patterns depend on app-wide auth; not platform-specific hardened |
| S-12 | Webhook SSRF | `validateWebhook` checks URL shape only — no private-IP deny list verified |
| S-13 | File upload attacks | Renderer accepts file names only; no malware/ZIP/PDF pipeline in platform |
| S-14 | Secrets in plugin JSON | Secrets referenced as strings in snapshots — no vault |
| S-15 | Report data leakage | Reports load up to 5000 org tickets into process memory for ADMIN |

---

## Attack classes requested — results

| Class | Result |
|-------|--------|
| SQL injection (identifiers) | Fail closed (allowlist) ✅ |
| Regex DoS (parser) | Fail closed ✅ |
| Regex DoS (form field regex) | **Fails open / slow** 💥 |
| Stored XSS (notification vars) | Escaped ✅ |
| Prompt injection | N/A real LLM — stub only; still unsafe formula surface |
| Path traversal | Not fully exercised; raw SQL ids are UUIDs |
| JWT tampering | Relies on shared auth — not re-audited here |
| Tenant escape | Org id from tenant context on queries — standard pattern; no adversarial multi-tenant soak |
| Builder bypass / direct API | Client schema = **bypass** 💥 |
| Version tampering | Client can choose formVersionId without proving publish ownership deeply |
| Webhook spoofing | Weak validation |
| ZIP bombs / malicious PDF | **No defenses** (features absent) |
| OAuth abuse | **No real OAuth** |
| Cross-builder leakage | Registry RMW race; shared admin role |

---

## Security score: **31 / 100**

P0 formula escape + field ReDoS + client schema trust alone block production.
