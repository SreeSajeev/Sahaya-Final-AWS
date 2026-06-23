# Component Migration Plan

> **Status:** Phase 0 complete — shared primitives created  
> **Primitives:** `PageHeader`, `MetricCard`, `StatGrid`, `FilterBar`, `DataTableShell`  
> **Location:** `src/components/common/`  
> **Spec:** `docs/design-system-v1.md` · **Audit:** `docs/ui-audit-v2.md`

No pages have been migrated yet. This document tracks the order, effort, and risks for replacing inline patterns with shared components.

---

## Primitives Available

| Component | Import | Purpose |
|-----------|--------|---------|
| `PageHeader` | `@/components/common` | Unified `h1` + optional icon + actions |
| `MetricCard` | `@/components/common` | KPI / stat tiles |
| `StatGrid` | `@/components/common` | Responsive grid for MetricCard rows |
| `FilterBar` | `@/components/common` | Search + filter slot layout |
| `DataTableShell` | `@/components/common` | Bordered table container |
| `typography` | `@/components/common` | Token class strings |

---

## Migration Order

### Wave 1 — Highest traffic staff workflows (3–4 days)

| # | Page | Components | Effort | Notes |
|---|------|------------|--------|-------|
| 1 | `Dashboard.tsx` | PageHeader, MetricCard, StatGrid | **L** | Remove local `MetricCard`; welcome stats strip needs design decision |
| 2 | `TicketsList.tsx` | PageHeader, FilterBar, DataTableShell | **M** | Keep `TicketFiltersBar` logic; wrap layout in FilterBar or refactor into children |
| 3 | `TicketDetail.tsx` | PageHeader | **S** | Title is ticket #; bold → semibold via PageHeader |
| 4 | `FieldExecutives.tsx` | PageHeader, StatGrid, MetricCard, FilterBar | **M** | Replace 4 inline stat divs |

**Wave 1 impact:** ~70% of daily STAFF usage.

---

### Wave 2 — Lists, monitoring, admin (3–4 days)

| # | Page | Components | Effort | Notes |
|---|------|------------|--------|-------|
| 5 | `Users.tsx` | PageHeader, StatGrid, FilterBar, DataTableShell | **M** | Green icon → standard primary gradient |
| 6 | `SLAMonitor.tsx` | PageHeader, StatGrid, FilterBar, DataTableShell | **L** | 10+ stat boxes; semantic color cleanup |
| 7 | `Analytics.tsx` | PageHeader, StatGrid | **M** | Chart cards unchanged |
| 8 | `AuditLogs.tsx` | PageHeader, FilterBar (`sticky`), DataTableShell | **L** | Complex filter panel → FilterBar children |
| 9 | `ReviewQueue.tsx` | PageHeader | **S** | Thin migration |
| 10 | `RawEmails.tsx` | PageHeader, FilterBar | **M** | Keep status pills above FilterBar |

---

### Wave 3 — Tenant & super-admin (2–3 days)

| # | Page | Components | Effort |
|---|------|------------|--------|
| 11 | `Organisations.tsx` | PageHeader, FilterBar | S |
| 12 | `TenantView.tsx` | PageHeader, StatGrid, DataTableShell | M |
| 13 | `SuperAdminDashboard.tsx` | PageHeader, StatGrid | M |
| 14 | `SuperAdminOrgView.tsx` | PageHeader, StatGrid, DataTableShell | M |
| 15 | `PlatformOverview.tsx` | PageHeader, DataTableShell | S |
| 16 | `TenantAdminDashboard.tsx` | PageHeader, StatGrid | M |
| 17 | `ServiceManagers.tsx` | PageHeader, StatGrid, DataTableShell | M |
| 18 | `Clients.tsx` | PageHeader, FilterBar, DataTableShell | S |
| 19 | `ClientDetail.tsx` | PageHeader, DataTableShell | S |
| 20 | `ComplaintPoints.tsx` | PageHeader, FilterBar | S |
| 21 | `Settings.tsx` | PageHeader | S |
| 22 | `TicketSettings.tsx` | PageHeader | S |

---

### Wave 4 — Client portal (3–4 days)

| # | Page | Components | Effort | Notes |
|---|------|------------|--------|-------|
| 23 | `ClientDashboard.tsx` | PageHeader, MetricCard, StatGrid, DataTableShell | **XL** | Largest diff: raw `<table>`, inline styles, local MetricCard |
| 24 | `ClientTicketDetail.tsx` | PageHeader | M | Align with TicketDetail |
| 25 | `ClientSupport.tsx` | PageHeader | S | |
| 26 | `ClientReports.tsx` | (via Analytics) | S | Reuses Analytics migration |

---

### Wave 5 — FE mobile & auth (2 days)

| # | Page | Components | Effort | Notes |
|---|------|------------|--------|-------|
| 27 | `FEMyTickets.tsx` | MetricCard (partial) | M | Dark shell may stay; card typography only |
| 28 | `FETicketView.tsx` | — | S | Meta token pass |
| 29 | `FEActionPage.tsx` | — | S | |
| 30 | `ForgotPassword.tsx` | — | S | Out of ops shell |
| 31 | `ResetPassword.tsx` | — | S | |
| 32 | `ChangePassword.tsx` | — | S | |

---

### Excluded from migration

| Page | Reason |
|------|--------|
| `SahayaLanding.tsx` | Marketing — separate token set |
| `EnquiryPage.tsx` | Marketing |
| `NotFound.tsx` | Edge case |
| `Index.tsx` | Router redirect |
| `public/PublicReportPage.tsx` | Public flow |

---

## Effort Key

| Size | Estimate | Meaning |
|------|----------|---------|
| **S** | 30–60 min | PageHeader swap only |
| **M** | 1–3 hours | Header + one primitive (filters or stats or table shell) |
| **L** | 3–6 hours | Multiple primitives or complex layout |
| **XL** | 1–2 days | Major rewrite (ClientDashboard) |

**Total estimated effort:** 15–22 engineering days for full platform.

**Staff-only fast path (Waves 1–2):** ~6–8 days.

---

## Per-Page Migration Checklist

Use this for each PR:

- [ ] Replace inline `h1` block with `<PageHeader />`
- [ ] Replace inline stat divs with `<StatGrid>` + `<MetricCard />`
- [ ] Replace filter rows with `<FilterBar />` (preserve existing state handlers)
- [ ] Wrap tables with `<DataTableShell />` (remove duplicate `rounded-xl border` wrappers)
- [ ] No `font-bold` introduced; use `typography` tokens
- [ ] Visual QA: mobile (375px) + desktop (1280px)
- [ ] No business logic changes
- [ ] Existing tests pass

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Visual regression on Dashboard welcome hero** | High | Migrate stats to MetricCard in a follow-up PR; snapshot welcome strip separately |
| **TicketFiltersBar duplication** | Medium | Wave 1 TicketsList: use FilterBar as layout wrapper first; merge TicketFiltersBar internals in Wave 2 |
| **ClientDashboard raw table** | High | Wave 4 only; migrate to shadcn Table inside DataTableShell; dedicated QA with client role |
| **SLA Monitor stat count mismatch** | Medium | Map each stat box 1:1 to MetricCard before removing inline markup |
| **AuditLogs sticky filter height** | Medium | Test `FilterBar sticky` with long filter sets; verify z-index vs sidebar |
| **CardTitle still `text-2xl` in ui/card** | Low | Separate PR to change CardTitle to `section-title`; many pages override today |
| **StatCard vs MetricCard** | Low | Deprecate `StatCard` after Dashboard migration; re-export shim if needed |
| **DataTableShell double borders** | Medium | Remove outer wrapper from pages when shell is added; domain tables must not add their own border |
| **Icon header color expectations** | Low | Users page green icon becomes primary — communicate in PR |
| **FE dark theme** | Low | Defer full FE shell; typography tokens only in Wave 5 |

---

## Suggested PR Strategy

1. **PR A** — Primitives only (this phase) ✅  
2. **PR B** — Wave 1: Dashboard + TicketsList  
3. **PR C** — Wave 1: TicketDetail + FieldExecutives  
4. **PR D** — Wave 2: Users + SLA Monitor  
5. **PR E** — Wave 2: Analytics + AuditLogs + RawEmails + ReviewQueue  
6. **PR F** — Wave 3: Admin pages (batch by role)  
7. **PR G** — Wave 4: Client portal  
8. **PR H** — Cleanup: deprecate StatCard, remove `.btn-primary` usages, ESLint rules  

One page per PR is safest for review; batch only thin migrations (Settings, ReviewQueue).

---

## Domain Component Updates (after page migrations)

| Component | Change |
|-----------|--------|
| `TicketsTable.tsx` | Apply `dataTableHeadClassName`; expect parent DataTableShell |
| `EmailsTable.tsx` | Same |
| `ComplaintPointTable.tsx` | Same |
| `TicketFiltersBar.tsx` | Optionally refactor to render inside FilterBar |
| `components/ui/card.tsx` | CardTitle → `text-lg font-semibold` |
| `components/dashboard/StatCard.tsx` | Deprecate → re-export MetricCard |

---

## Success Metrics

- Zero inline `h1` class strings in migrated pages
- All list pages use FilterBar or documented exception (RawEmails pills)
- All KPI rows use StatGrid + MetricCard
- All data tables wrapped in DataTableShell
- No new `font-bold` / `text-[Npx]` in migrated files

---

*Last updated: Phase 0 primitive implementation.*
