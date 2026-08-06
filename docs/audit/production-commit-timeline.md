# Production Commit Timeline — Sahaya vs Sahaya-Final-AWS

**Audit date:** 2026-08-05  
**Mode:** Read-only (no merges, cherry-picks, commits, or branch switches)  
**Evidence basis:** Git history in production repos + Sahaya-Final-AWS clone metadata

---

## Divergence determination

| Signal | Evidence |
|--------|----------|
| Sahaya-Final-AWS first commit | `6553b4c0cefcca0004d2343840986ba82b421c15` — 2026-06-23 15:12 +0530 — *Initial Sahaya AWS migration workspace* (includes `backend/src/app.js`) |
| Sahaya-Final-AWS monorepo init | `7dd868be15cc67939dbce0bcb8aa964bd98e46c9` — 2026-06-23 15:45 +0530 |
| Last production backend commit on/before clone day | `399ddc661f093d204ce71aa32d7dbfaa34c4af71` — 2026-06-22 — *feat(ticket-numbering): add source-aware PKQS/PKQE/PKQC numbering* |
| User note (“around April 2026”) | April activity is the **production** `aws-migration` branch / PR #1 (`a758387`, 2026-04-08). That is **not** the Sahaya-Final-AWS monorepo birth date. |

**Authoritative divergence point used for this audit:** **2026-06-23** (Sahaya-Final-AWS workspace creation).

**Production HEADs inspected:**

| Repo | Branch | HEAD SHA | Date |
|------|--------|----------|------|
| `Pariskq-CRM-Backend` | `docker-ec2-migration` | `b02ecdae64fc39941a0d33274de6c6d71612b7c6` | 2026-07-24 |
| `field-ops-assist` | `main` | `fb1bd841329c95ecd3df60485d0f980b4b0c97b2` | 2026-07-24 |
| `Sahaya-Final-AWS` | (current) | `a1f450596c4cfde3dd15d62e4a00350ff75fe132` | 2026-08-05 |

---

## Chronological timeline — Backend (`Pariskq-CRM-Backend`)

Branch context: commits below are on the ancestry of `docker-ec2-migration` / related history since 2026-04-01.

| SHA | Date | Author | Title | Notes |
|-----|------|--------|-------|-------|
| `4926a9e` | 2026-04-08 | SreeSajeev | fixed issue | Pre-divergence |
| `a758387` | 2026-04-08 | Sreeparvathy Sajeev | Merge pull request #1 from SreeSajeev/aws-migration | Pre-divergence |
| `c4d874e` | 2026-04-08 | SreeSajeev | fix: remove duplicate resolveDbMode export | Pre-divergence |
| `35ef395` | 2026-04-08 | SreeSajeev | fix: handle CORS preflight in Express v5 | Pre-divergence |
| `416a3ff` | 2026-04-08 | SreeSajeev | fix: validate Supabase JWT via Auth REST | Pre-divergence (auth model differs on AWS) |
| `8c5b055` | 2026-05-07 | SreeSajeev | fix(fe): include name/email in appUser lookup for FE ticket resolution | Pre-divergence |
| `5d42180`…`88e98d3` | 2026-05-08→13 | SreeSajeev | SMS iteration + Airtel diagnostics | Pre-divergence |
| `ce6089a` | 2026-05-11 | SreeSajeev | assignment sla | Pre-divergence |
| `79eb1af` | 2026-05-14 | SreeSajeev | feat: dockerize backend with worker process split | Pre-divergence |
| `8a2f403` | 2026-05-19 | SreeSajeev | Add bulk assign endpoint and extract assignmentService | Pre-divergence |
| `c1bb8fd` | 2026-05-19 | SreeSajeev | Align audit logging with new audit_logs schema | Pre-divergence |
| `020c754` | 2026-05-19 | SreeSajeev | Fix audit tenant resolution for tenant-scoped visibility | Pre-divergence |
| `4e8acda`→`6e53759` | 2026-05-20 | SreeSajeev | S3 proof replication | Pre-divergence |
| `8d00823` | 2026-05-20 | SreeSajeev | Fix audit log query builder handling | Pre-divergence |
| `17dbb0b` | 2026-05-20 | SreeSajeev | Improve audit logs dashboard and backend display shaping | Pre-divergence |
| `8d068a2` | 2026-05-21 | SreeSajeev | Allow updating ticket priority after creation | Pre-divergence |
| `986f5e7` | 2026-05-21 | SreeSajeev | Support custom resolution details for Other category | Pre-divergence |
| `e08509e` | 2026-05-22 | SreeSajeev | Fix password reset email and redirect flow | Pre-divergence |
| `0a18c64` | 2026-05-22 | SreeSajeev | Add bulk ticket import service behind feature flag | Pre-divergence |
| `8ea4666` | 2026-05-24 | SreeSajeev | Add tenant client APIs behind feature flag | Pre-divergence |
| `b74b0c3` | 2026-05-25 | SreeSajeev | Use tenant clients for bulk import validation | Pre-divergence |
| `8858f69` | 2026-05-25 | SreeSajeev | Add feature-flagged server-side user provisioning | Pre-divergence |
| `ea56a01` | 2026-05-29 | SreeSajeev | Add complaint point management APIs | Pre-divergence |
| `e9ecb16` | 2026-05-30 | SreeSajeev | Add public complaint ticket creation | Pre-divergence |
| `a2bbc50` / `353c6fd` | 2026-06-01 | SreeSajeev | Audit logs | Pre-divergence |
| `630f4ad` | 2026-06-05 | SreeSajeev | feat(ticket-review): support configurable review notes | Pre-divergence |
| `025285e` | 2026-06-05 | SreeSajeev | feat(fe): make action token expiry configurable | Pre-divergence |
| `3ae0e4c` / `71cc90f` | 2026-06-11 | SreeSajeev | Security: redact PII / sensitive logs | Pre-divergence |
| `9f406ef` | 2026-06-12 | SreeSajeev | feat: include vehicle number in customer email subjects | Pre-divergence |
| `97975b7` | 2026-06-13 | SreeSajeev | feat: normalize location fields to uppercase | Pre-divergence |
| `b3cc386` | 2026-06-13 | SreeSajeev | feat: add daily tenant operations reports with CSV exports | Pre-divergence |
| `4f70a77` / `e3a8e31` | 2026-06-15 | SreeSajeev | Production hardening | Pre-divergence |
| `b145b7f` | 2026-06-15 | SreeSajeev | Extend ticket lifecycle reporting and resolution metadata | Pre-divergence |
| `170a556` | 2026-06-15 | SreeSajeev | Resolve complaint ID aliases during bulk ticket import | Pre-divergence |
| `3c23b69` | 2026-06-17 | SreeSajeev | feat: add low medium high ticket priority support | Pre-divergence |
| `b7b457f` | 2026-06-17 | SreeSajeev | feat(dashboard): add client and date range filters with KPI updates | Pre-divergence |
| `9c90ea4` | 2026-06-17 | SreeSajeev | feat(email): include vehicle number in FE assignment email subject | Pre-divergence |
| `54ad9b5` | 2026-06-17 | SreeSajeev | feat(ticket-state): support state lifecycle in create, assign and reporting | Pre-divergence |
| `1fb9937` | 2026-06-17 | SreeSajeev | feat(ticket-create): support client notification recipients | Pre-divergence |
| `1860857` | 2026-06-18 | SreeSajeev | due | Pre-divergence (assignment due) |
| `d30cc42` | 2026-06-19 | SreeSajeev | fe reassign | Pre-divergence |
| `399ddc6` | 2026-06-22 | SreeSajeev | feat(ticket-numbering): add source-aware PKQS/PKQE/PKQC numbering | **Snapshot boundary** |
| **`860d3b9`** | **2026-07-14** | SreeSajeev | **feat: extend analytics API and reporting exports** | **POST-DIVERGENCE** |
| **`b02ecda`** | **2026-07-24** | SreeSajeev | **feat: enforce maximum proof image upload limit** | **POST-DIVERGENCE** |

Full SHA list for post-divergence backend:

- `860d3b9a492e54d399e30242b61e9ae6461c9c50`
- `b02ecdae64fc39941a0d33274de6c6d71612b7c6`

---

## Chronological timeline — Frontend (`field-ops-assist`)

Branch: `main`.

### Pre-divergence highlights (May–Jun 22) — included in AWS snapshot evidence

Major functional themes present on both sides (file-level presence verified): bulk assign UI, bulk import UI, tenant clients, public QR complaints, audit logs, priority L/M/H, geographic state, notification recipients, FE reassign, ticket numbering display, tenant ticket config, outsourced FEs, review notes UI, SLA monitor fixes, client search/sort.

### Post-divergence (after 2026-06-23)

| SHA | Date | Author | Title | Branch |
|-----|------|--------|-------|--------|
| `b4f055d904ff14634fd85dec5999cdb56a7a8515` | 2026-06-30 | SreeSajeev | Replace hero dashboard with Sahaya demo video and add mute toggle | main |
| `b0524a8c8e206d32d36f6a3eaa2a14cbb4366a72` | 2026-06-30 | SreeSajeev | increased size of the video | main |
| `a6da3078ca069e49a3d72705d249d72eb65dae57` | 2026-06-30 | SreeSajeev | Increase hero video column width | main |
| `68de95fa6105e33fcf6659c05372da2909da8324` | 2026-06-30 | SreeSajeev | Add responsive hero video for mobile and tablet | main |
| `dd3edce8bb11ab254641fe1eba6824bf7162083c` | 2026-07-14 | SreeSajeev | feat: add enterprise analytics dashboard and operations reporting | main |
| `98e6e4deaf314d40ab4e9a16679ba80c0791541a` | 2026-07-14 | SreeSajeev | feat: add enterprise analytics dashboard and operations reporting part 2 | main |
| `a8f70bfcfda326c1873091c1a87d1cb0dbc951b7` | 2026-07-14 | SreeSajeev | feat: add enterprise analytics dashboard and operations reporting part 3 | main |
| `91d9ddceab60bac935dc639a2110133e77b96a49` | 2026-07-14 | SreeSajeev | feat: add installable PWA and mobile UX improvements | main |
| `78c7a5e29fba1986f2ddbd4bc2e48a296b6b995a` | 2026-07-14 | SreeSajeev | feat: made analytics page button better | main |
| `ae1b6473fce16a8b7c0145cf7f58a36f50e8a3e1` | 2026-07-16 | SreeSajeev | feat(fe): replace ticket cards with searchable management table | main |
| `43dca0d5f64aa2fa55748311306db5476422516e` | 2026-07-17 | SreeSajeev | Require location for manual ticket creation and allow backfilling existing tickets | main |
| `f65d45b91eba6d17348f834e7c5bb51285b37785` | 2026-07-24 | SreeSajeev | feat: improve proof image upload and image viewer UX | main |
| `fb1bd841329c95ecd3df60485d0f980b4b0c97b2` | 2026-07-24 | SreeSajeev | fix: restore proof image previews and improve upload UX | main |

---

## Counts

| Scope | Backend | Frontend | Combined |
|-------|---------|----------|----------|
| Commits since 2026-04-01 | 64 | 99 | 163 |
| Commits after divergence (2026-06-23) | **2** | **13** | **15** |

See `production-feature-parity.md` for functional vs ignored classification of the post-divergence set.
