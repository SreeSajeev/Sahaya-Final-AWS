# Post-parity TEST deployment report

**Date:** 2026-08-06  
**Branch:** `develop`  
**Latest develop SHA:** `e3f0ca2c759190c4a305edb41917190b49616c9f`  
**Product parity SHA:** `4931bba0cda994821b6581e46ff4aa7f72bcaea1`  
**Follow-up test-only commits:** `d35aa99`, `e69ad0a`, `e3f0ca2` (acceptance/Playwright fixtures only)

**Verdict:** PASS WITH NON-BLOCKING ISSUES — SAFE TO MERGE DEVELOP → MAIN

---

## Run IDs (e69ad0a / e3f0ca2 on TEST)

| Step | Run ID | SHA | Result |
|------|--------|-----|--------|
| Deploy Test Sahaya (parity smoke fix) | [31081522758](https://github.com/SreeSajeev/Sahaya-Final-AWS/actions/runs/31081522758) | `e69ad0a` | success |
| Deploy Test Sahaya (Playwright fixture) | [31094674765](https://github.com/SreeSajeev/Sahaya-Final-AWS/actions/runs/31094674765) | `e3f0ca2` | success |
| db_inspect (pre) | [31094453987](https://github.com/SreeSajeev/Sahaya-Final-AWS/actions/runs/31094453987) | `e69ad0a` | success |
| parity_smoke | [31094458799](https://github.com/SreeSajeev/Sahaya-Final-AWS/actions/runs/31094458799) | `e69ad0a` | **14/14 PASS** |
| full_acceptance | [31094462669](https://github.com/SreeSajeev/Sahaya-Final-AWS/actions/runs/31094462669) | `e69ad0a` | **77 passed / 0 failed** |
| Playwright (pre-fixture-fix) | [31081522303](https://github.com/SreeSajeev/Sahaya-Final-AWS/actions/runs/31081522303) | `e69ad0a` | fail (create missing location — harness) |
| Playwright (final) | [31094853040](https://github.com/SreeSajeev/Sahaya-Final-AWS/actions/runs/31094853040) | `e3f0ca2` | **22 passed / 0 failed / 2 skipped** |
| db_inspect (post) | [31095249946](https://github.com/SreeSajeev/Sahaya-Final-AWS/actions/runs/31095249946) | `e3f0ca2` | success |

---

## Local verification

| Check | Result |
|-------|--------|
| `backend` `npm test` | **33/33 passed** |
| `frontend` `npm run build` | **PASS** (~10.2s) |
| Vite chunk-size warning | Non-blocking (main chunk ~2.5 MB) |
| Browserslist age notice | Non-blocking |

---

## Live TEST architecture

`GET https://api.test-sahaya.pariskq.in/health`

```json
{"status":"ok","dbMode":"prisma"}
```

| Concern | Confirmed |
|---------|-----------|
| Browser → `test-sahaya.pariskq.in` | shell pages 200 |
| API → `api.test-sahaya.pariskq.in` | health ok |
| DB mode | Prisma |
| PostgreSQL | `sahaya-migration-db` on host port **5436** |
| Proofs | `S3_FE_PROOFS_BUCKET=sahaya-test-fe-proofs` (test bucket; not `crm-pariskq`) |
| Auth | Local JWT (`/auth/login`, argon2id) |
| Supabase Auth runtime | **0** |
| Supabase PostgREST runtime | **0** |
| Supabase Storage runtime | **0** |
| `@supabase` SDK in `backend/src` + `frontend/src` | **0 hits** |
| Deployed FE bundle `SUPABASE_ZERO` | `runtimeHits:0`, `wordHits:0` |

Prisma schema / migrations in this parity batch: **NO**  
Historical ticket mutation required: **NO**  
Env-var product changes required: **NO**

---

## Parity smoke (`31094458799`) — all PASS

| Check | Result |
|-------|--------|
| Manual ticket location required | PASS (HTTP 400 without location) |
| Valid manual ticket create | PASS |
| Location backfill `PATCH /data/tickets/:id` `{updates:{location}}` | PASS |
| Analytics `staff_users` | PASS (n=11) |
| Dashboard stats + date params (resolved KPI path) | PASS |
| FE portal tickets API | PASS |
| Proof `TOO_MANY_IMAGES` (>10) | PASS |
| PWA manifest / icons | PASS |
| Landing video asset | PASS (HTTP 206) |
| Password-reset deep-link shell | PASS |
| Health `dbMode=prisma` | PASS |
| Fixture cleanup | cleaned disposable ticket; count 929→929 |

Tenant isolation + S3 proof upload/presign/fetch + Supabase-zero covered by full acceptance on same deploy.

---

## Full acceptance (`31094462669`)

- **77 passed / 0 failed**
- Auth/session, tenant isolation, IDOR, historical proof paths, S3 test bucket, analytics `staff_users`, dashboard, ticket create **with location**, concurrency unique numbers, FE me tickets, SUPABASE_ZERO bundle
- Disposable `e2e-accept-*` fixtures cleaned by the suite

---

## Playwright (`31094853040`)

| Metric | Value |
|--------|-------|
| Passed | **22** |
| Failed | **0** |
| Skipped | **2** |
| Verdict | PASS — FULL PLATFORM ACCEPTED END TO END |

### Skips (not product failures)

1. **FE proof upload path when token provided** — skipped because `E2E_FE_ACTION_TOKEN_ID` is not set in the TEST Playwright env. Proof upload/S3 is covered by full acceptance + parity `TOO_MANY_IMAGES`.
2. **IDOR — ADMIN cannot fetch foreign ticket by id when SA finds one** — skipped when no foreign ticket appears in the SA sample window (`test.skip(!foreign, …)`). Tenant list isolation and IDOR-style checks still PASS in full acceptance.

---

## Data safety

### Counts

| Metric | Pre (`31094453987`) | Mid full-accept baseline | Post (`31095249946`) |
|--------|---------------------|--------------------------|----------------------|
| organisations | 4 | 4 | **5** |
| tickets | 929 | 930* | **930** |
| ticket_comments | 424 (exact) | 424 | 425 (exact) |
| ticket_assignments | 564 | 564 | 564 |
| sla_tracking | 708 | 708 | 708 |
| users | 34 | 34 | 34 |

\* Concurrent parity fixture briefly visible during full acceptance; parity cleaned back to 929; Playwright create left **+1** ticket.

### Historical orgs preserved

- `pariskq` — present  
- `demo` — present  
- `demoapex` — present  

### Integrity (post)

- orphan comments = **0**  
- orphan assignments = **0**  
- orphan SLA = **0**  
- duplicate ticket numbers = **0**  
- orphan tickets bad org = **0**

### Fixture cleanup

- Parity smoke: disposable ticket deleted; ticket count restored.  
- Full acceptance: suite deletes its ticket/org fixtures + `e2e-accept-*` orgs.  
- Playwright: creates `E2E_PW_*` ticket and can create `e2e-org-*`; **does not auto-delete** → leftover disposable TEST fixtures remain (`e2e-org-1786013570624`, prior `e2e-org-1786001969072`, +1 ticket).  
- **No broad marker cleanup performed** (per instructions). Historical data not deleted.

---

## 11-feature matrix

Legend: SOURCE = in tree on JWT/Prisma/S3; API = credentialed HTTP on TEST; BROWSER = Playwright/shell HTTP against live FE.

| # | Feature | Overall | SOURCE | API | BROWSER | Evidence |
|---|---------|---------|--------|-----|---------|----------|
| 1 | Backend proof max 10 + `TOO_MANY_IMAGES` | **PASS** | Y | Y | — | `proofController.js`; parity `proof_too_many_images` |
| 2 | FE proof compression / preview / zoom-pan / max 10 | **PASS** | Y | partial | partial | SOURCE: `compressProofImage`, `ProofImageViewerOverlay`, FEActionPage max 10. API: max/reject. Browser interaction of zoom/pan **not** exercised in Playwright. |
| 3 | Required location + historical backfill | **PASS** | Y | Y | partial | API create reject/create + `PATCH {updates:{location}}`; TicketDetail UI SOURCE; browser list shell only |
| 4 | Analytics `staff_users` + CSV Other + email enrichment | **PASS** | Y | Y | — | `staff_users` API; unit `dailyTicketReportCsvOther`; email enrichment SOURCE |
| 5 | Enterprise Analytics + Excel/CSV exports | **PASS** | Y | partial | partial | SOURCE Analytics + exceljs; summary API; Excel click path not Playwright-driven |
| 6 | FE searchable/filterable/sortable table | **PASS** | Y | Y | partial | FE tickets API + filters lib; browser `/fe/tickets` shell loads |
| 7 | Dashboard resolved KPI `resolved_at` | **PASS** | Y | Y | partial | `countResolvedTicketsWithDateFilter` uses `resolvedAt`; dashboard stats API + date params |
| 8 | JWT password-reset deep-link | **PASS** | Y | — | Y | `PasswordResetDeepLinkRedirect`; `/reset-password?token=` → 200; no Supabase auth |
| 9 | PWA manifest/icons | **PASS** | Y | — | Y | manifest + icons HTTP 200 |
| 10 | Landing hero video | **PASS** | Y | — | Y | `/sahaya-demo.mp4` 206; **~14.7 MB** (15446944 bytes), not 63 MB |
| 11 | Mobile drawer polish | **PASS** | Y | — | — | SOURCE: Escape close + body scroll lock in `MobileSidebarWrapper`; no dedicated Playwright drawer suite |

---

## Git hygiene

- Local `develop` == `origin/develop` == `e3f0ca2`  
- Working tree clean after report commit  
- Not committed: `node_modules/`, `test-results/`, `playwright-report/`, `.env`, credentials  
- No secrets in tracked filenames  
- Hero video ~15 MB compressed asset tracked intentionally  

---

## Known non-blockers

1. Playwright leaves disposable `E2E_PW_*` / `e2e-org-*` rows (not historical). Optional later TEST-only cleanup — not broad Phase 2A/2B.  
2. Vite main-chunk size warning.  
3. Playwright skips when optional env / sample foreign ticket absent.  
4. Zoom/pan, Excel download click, mobile drawer Escape not browser-automated (SOURCE + API coverage elsewhere).  

---

## Merge decision

**PASS WITH NON-BLOCKING ISSUES**  
**SAFE TO MERGE DEVELOP → MAIN**

Issues: disposable Playwright TEST fixtures left behind; some UX paths SOURCE-only; Vite chunk warning.

Do **not** merge from this agent. Suggested human steps (after review):

```bash
# On a clean machine / after review
git fetch origin
git checkout main
git pull origin main
git merge --no-ff origin/develop -m "Merge develop: post-divergence Sahaya production parity"
# Open PR preferred:
gh pr create --base main --head develop \
  --title "feat: restore post-divergence Sahaya production parity" \
  --body "See docs/audit/post-parity-test-deployment-report.md"
```

**Do not deploy production from this report.** Production cutover remains a separate approved step.
