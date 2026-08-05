# Recommended Backports — Production → Sahaya-Final-AWS

**Rule:** Port **behavior**, not Supabase clients. Prefer AWS Prisma/JWT/S3 paths.

---

## Effort estimate

| Band | Scope | Eng-days (1 mid/senior) |
|------|-------|-------------------------|
| S | Backend `860d3b9` + `b02ecda` only | **1–2** |
| M | + location validation + FE table + proof UX align | **4–6** |
| L | + full enterprise analytics/Excel + PWA | **8–12** |
| XL | + marketing video + mobile polish + dash KPI drift | **10–14** |

**Recommended planning number for full post-divergence parity:** **~10–14 engineer-days**, including regression testing on TEST (analytics exports, FE proof upload, create-ticket validation).

Risk multiplier: analytics Excel surface is the largest FE blast radius; proof max must stay FE↔BE synchronized.

---

## Safest port order

### Phase 1 — Safety / data integrity (do first)
1. **Backend proof max 10** (`b02ecda`) — `proofController.js`  
2. **Frontend proof max 10 + compression** (`compressProofImage.ts`, FEActionPage) — keep in lockstep with #1  
3. **Required location + backfill** (`43dca0d`) — validation only, low coupling  
4. **Dashboard resolved KPI date filter alignment** — small backend fix, reduces silent metric wrongness

**Why first:** Prevents bad data / overload; no large UI redesign.

### Phase 2 — Analytics API contract
5. **`staff_users` on analytics summary** (`860d3b9` / Prisma `userRepository`)  
6. **Daily CSV Other columns + email OTHER enrichment** (`860d3b9`)

**Why next:** Unblocks frontend analytics port without fake FE-only data.

### Phase 3 — Enterprise Analytics UI
7. Port `analyticsMetrics.ts` + analytics components (strip any Supabase usage)  
8. Port `operationsReportExport.ts` / `operationsExcelExport.ts` + add `exceljs`  
9. Expand `Analytics.tsx` to match prod behaviors

**Why later:** Largest UI surface; depends on Phase 2 API.

### Phase 4 — FE portal UX
10. Port `components/fe/*` + `feTicketList.ts`; replace card `FEMyTickets`

### Phase 5 — Proof viewer polish
11. Port zoom/pan `ProofImageViewerOverlay` + preview restore (`f65d45b`, `fb1bd84`)

### Phase 6 — PWA / marketing / auth redirect (lowest operational risk)
12. PWA manifest + icons (`91d9ddc`)  
13. Hero demo video asset (`b4f055d`…)  
14. `PasswordRecoveryHashRedirect` adapted to AWS auth recovery flow  
15. Mobile drawer safe-area polish

---

## Do **not** backport

| Item | Reason |
|------|--------|
| Supabase Auth JWT REST validation (`416a3ff`) | AWS uses local JWT (Phase D) |
| Supabase Storage proof path | AWS S3 primary |
| Prod Prisma Ticket stub | AWS schema is already fuller |
| Demo audit seed commits (already reverted in prod) | Dead |
| Vercel-only redeploy commits | Irrelevant to AWS TEST |

---

## Suggested verification checklist (TEST)

- [ ] Upload 11 proof images → `TOO_MANY_IMAGES`  
- [ ] Upload 10 compressed images → success  
- [ ] Create ticket without location → blocked  
- [ ] Backfill location on ticket missing location  
- [ ] Analytics summary JSON contains `staff_users`  
- [ ] SM/FE scorecards render with attribution  
- [ ] Ops Excel download opens in Excel  
- [ ] Daily report CSV contains Other Details columns  
- [ ] Resolution email for OTHER includes details  
- [ ] FE portal table search/filter/pagination  
- [ ] Dashboard date filter resolved counts match prod semantics  
- [ ] PWA install prompt / manifest reachable  

---

## Commit mapping cheat-sheet

| Port item | Source SHA |
|-----------|------------|
| Analytics API + CSV + email | `860d3b9a492e54d399e30242b61e9ae6461c9c50` |
| Proof max backend | `b02ecdae64fc39941a0d33274de6c6d71612b7c6` |
| Enterprise analytics FE | `dd3edce8…`, `98e6e4de…` |
| PWA / compress intro | `91d9ddceab60bac935dc639a2110133e77b96a49` |
| FE table | `ae1b6473fce16a8b7c0145cf7f58a36f50e8a3e1` |
| Location required | `43dca0d5f64aa2fa55748311306db5476422516e` |
| Proof viewer / preview | `f65d45b9…`, `fb1bd841…` |
| Hero video | `b4f055d9…` → `68de95fa…` |
