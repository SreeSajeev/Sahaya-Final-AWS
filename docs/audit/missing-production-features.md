# Missing Production Features (Post–June 23 Divergence)

Ordered by product risk / user impact.

| # | Feature | Prod SHA(s) | Layer | AWS status | Evidence |
|---|---------|-------------|-------|------------|----------|
| 1 | Analytics `staff_users` for SM scorecards | `860d3b9` | Backend API | ❌ | AWS `dataApi` summary omits field; prod includes STAFF/ADMIN users |
| 2 | Enterprise Analytics ops sections + metrics | `dd3edce`, `98e6e4d` | Frontend | ❌ | Missing `analyticsMetrics.ts`, `components/analytics/*` |
| 3 | Operations Excel/CSV report packs | `dd3edce`, `98e6e4d` | Frontend | ❌ | Missing `operationsExcelExport.ts`, `operationsReportExport.ts`, `exceljs` |
| 4 | Daily report CSV Other details columns | `860d3b9` | Backend | ❌ | AWS CSV headers lack Other Details/Display |
| 5 | Email OTHER category detail enrichment | `860d3b9` | Backend | ❌ | AWS emailService maps OTHER→"Other" only |
| 6 | Backend max proof images = 10 | `b02ecda` | Backend | ❌ | No `MAX_PROOF_IMAGES` / `TOO_MANY_IMAGES` in AWS proofController |
| 7 | FE proof max 10 + compression | `91d9ddc`, `f65d45b` | Frontend | 🟡 | AWS hardcoded max **5**, no `compressProofImage.ts` |
| 8 | Proof image viewer zoom/pan + preview restore | `f65d45b`, `fb1bd84` | Frontend | 🟡/❌ | Overlay/viewer less capable; preview fix not ported |
| 9 | Require location on create + TicketDetail backfill | `43dca0d` | Frontend | ❌ | AWS location optional; no `locationDraft` |
| 10 | FE portal searchable tickets table | `ae1b647` | Frontend | ❌ | No `components/fe/*`; cards remain |
| 11 | Installable PWA (manifest/icons) | `91d9ddc` | Frontend | ❌ | No `manifest.webmanifest` / icons |
| 12 | Landing hero demo video | `b4f055d`…`68de95f` | Frontend | ❌ | No HeroDemoVideo / mp4 |
| 13 | PasswordRecoveryHashRedirect | (prod App wiring) | Frontend | ❌ | Component absent on AWS |
| 14 | Dashboard resolved KPI date semantics | (drift vs `b7b457f` era) | Backend | 🟡 | AWS also filters `openedAt` |
| 15 | Mobile drawer safe-area polish | `91d9ddc` | Frontend | 🟡 | Simpler AWS MobileSidebarWrapper |

---

## Top 25 missing production features (expanded list for planning)

Includes the above plus granular sub-features for port planning:

1. `staff_users` on `/data/analytics/summary`
2. Service Manager scorecards UI
3. Field Executive scorecards UI
4. Ops health / leaderboard analytics sections
5. Analytics management polish components
6. Operations Excel multi-sheet export
7. Operations CSV pack export
8. Daily tenant CSV “Resolution Other Details”
9. Daily tenant CSV “Resolution Category Display”
10. Resolution email “Other: …” detail text
11. Backend `TOO_MANY_IMAGES` (max 10)
12. Frontend proof max raised 5→10
13. Client-side proof image compression
14. Proof viewer zoom/pan overlay
15. Proof preview restore behavior
16. Required location on manual create
17. Location backfill on TicketDetail
18. FEMyTickets searchable table
19. FETicketFiltersBar
20. feTicketList filter/sort helpers
21. PWA web manifest
22. PWA icons (192/512/maskable/apple)
23. Hero demo video + mute toggle
24. Password recovery hash redirect
25. Align dashboard resolved-count date filter with production

Items **not** missing (confirmed present): bulk import/assign, public complaints/OTP, tenant clients, audit logs page, priority L/M/H, geographic state, notify recipients, FE reassign, PKQS/E/C numbering display, outsourced FEs, review notes settings, SLA monitor page, core ticket workflow APIs.
