# Production Frontend Gap Report

**Prod:** `field-ops-assist` @ `fb1bd841329c95ecd3df60485d0f980b4b0c97b2` (`main`)  
**AWS:** `Sahaya-Final-AWS/frontend`

---

## Route / page inventory

- **Page files:** Same set (38) in both `src/pages/` — **no page filename only in production**
- **Sidebar:** `Sidebar.tsx` byte-identical
- **Feature flags:** Same `VITE_ENABLE_*` helpers present in both

**Prod-only module (not a page):** `src/components/auth/PasswordRecoveryHashRedirect.tsx` wired in prod `App.tsx`; **absent** on AWS.

---

## Post-divergence frontend commits

### Hero demo video — `b4f055d` (+ size commits `b0524a8`, `a6da307`, `68de95f`) — 2026-06-30  
**Category:** Other (marketing)  
**What:** `HeroDemoVideo` in `SahayaLanding.tsx` + `public/sahaya-demo.mp4`  
**AWS:** No `<video>` / no demo asset  
**Status:** ❌ MISSING  
**User-visible:** Landing only | **Risk:** Low | **Breaking:** No

### Enterprise analytics — `dd3edce`, `98e6e4d`, `a8f70bf`, `78c7a5e` — 2026-07-14  
**Category:** Analytics / Reports  
**What:** `analyticsMetrics.ts`, `AnalyticsOpsSections.tsx`, `AnalyticsManagementPolish.tsx`, `operationsExcelExport.ts`, `operationsReportExport.ts`, `exceljs`, expanded `Analytics.tsx` consuming `staff_users`  
**AWS:** Older/slimmer `Analytics.tsx` (~1066 lines vs prod ~1425); **no** `src/lib/analyticsMetrics.ts`; **no** `operationsExcelExport.ts`  
**Status:** ❌ MISSING (base page shell only = PARTIAL at best)  
**Depends on:** backend `860d3b9` `staff_users`  
**Risk:** Medium–high (large UI + export surface)

### PWA + mobile UX — `91d9ddc` — 2026-07-14  
**Category:** Performance / Mobile  
**What:** `public/manifest.webmanifest`, icons, `index.html` meta, `compressProofImage.ts` introduced, mobile drawer polish, FEActionPage upgrades  
**AWS:** No manifest/icons; FEActionPage lacks compression pipeline  
**Status:** ❌ MISSING  
**Risk:** Low–medium

### FE portal searchable table — `ae1b647` — 2026-07-16  
**Category:** Field Executives / Search / Filtering  
**What:** `FETicketsTable.tsx`, `FETicketFiltersBar.tsx`, `feTicketList.ts`; `FEMyTickets.tsx` rewritten from cards → table  
**AWS:** Card-based `FEMyTickets.tsx`; **no** `src/components/fe/`  
**Status:** ❌ MISSING  
**Risk:** Low (UX); no API change

### Location required + backfill — `43dca0d` — 2026-07-17  
**Category:** Tickets / Validation / Bug-prevention  
**What:** `CreateTicketModal` + `CreateTicketSchema` require location; `TicketDetail` `locationDraft` backfill UI  
**AWS:** Location optional (`trim() || null`); no backfill UI  
**Status:** ❌ MISSING  
**Risk:** Medium (data quality)

### Proof upload / viewer UX — `f65d45b`, `fb1bd84` — 2026-07-24  
**Category:** Proof upload  
**What:** `MAX_PROOF_IMAGES = 10` via `compressProofImage.ts`; zoom/pan `ProofImageViewerOverlay`; preview restore fix  
**AWS:** `MAX_PROOF_IMAGES = 5` hardcoded in `FEActionPage.tsx`; basic lightbox; no compress helper  
**Status:** 🟡 PARTIAL  
**Risk:** Medium (must align with backend `b02ecda`)

---

## Production-only libraries / components (gap list)

| Path | Role |
|------|------|
| `src/lib/analyticsMetrics.ts` | FE/SM scorecards, ops health |
| `src/lib/operationsReportExport.ts` | Ops CSV packs |
| `src/lib/operationsExcelExport.ts` | Excel workbooks |
| `src/lib/compressProofImage.ts` | Compress + max 10 |
| `src/lib/feTicketList.ts` | FE portal filter/sort |
| `src/lib/resolutionDisplay.ts` | Resolution display helpers |
| `src/components/analytics/*` | Ops + management sections |
| `src/components/fe/*` | FE tickets table |
| `src/components/auth/PasswordRecoveryHashRedirect.tsx` | Recovery hash routing |
| `public/manifest.webmanifest` + icons | PWA |
| `public/sahaya-demo.mp4` | Landing video |

**Note:** Prod still has `src/integrations/supabase/*` for some paths; AWS removed Supabase client — do **not** port Supabase integrations; rewire to AWS CRM APIs where needed (org review notes already use `PATCH /data/organisations/:id` on AWS).
