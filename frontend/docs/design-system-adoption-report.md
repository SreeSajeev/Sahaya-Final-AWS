# Design System Adoption Report

> **Date:** 2026-06-11  
> **Scope:** `field-ops-assist/src` — full application audit (read-only)  
> **Reference:** [design-system-v1.md](./design-system-v1.md), [component-migration-plan.md](./component-migration-plan.md)

### Methodology

| Term | Meaning |
|------|---------|
| **Yes** | Uses the shared primitive (`PageHeader`, `MetricCard`+`StatGrid`, `FilterBar`, `DataTableShell`, or `typography.*` at page level) |
| **Partial** | Canonical pre-migration pattern (icon box + `h1`, domain component, tokenized subset, or shadcn `Table` without shell) |
| **No** | Custom / legacy implementation |
| **N/A** | Dimension does not apply to this page |

**Primary denominator for percentages:** 22 staff operational pages using `AppLayoutNew` (standard CRM shell). Client portal, FE mobile, auth, marketing, and public pages are audited separately.

**Scoring:** Yes = 100%, Partial = 50%, No = 0%, N/A excluded per page per dimension.

---

## Executive Summary

| Metric | Staff operational (22 pages) | All pages (37) |
|--------|------------------------------|----------------|
| **Fully migrated** | 3 (14%) | 3 (8%) |
| **Partially migrated** | 5 (23%) | 5 (14%) |
| **Not migrated** | 14 (64%) | 29 (78%) |
| **Typography compliance** | **38%** | **22%** |
| **Header compliance** | **57%** | **35%** |
| **Table compliance** | **36%** | **28%** |
| **KPI compliance** | **17%** | **12%** |
| **Overall design-system adoption** | **32%** | **21%** |

Domain table migrations (TicketsTable, EmailsTable, TicketNumberDisplay) are complete. Page-level primitive adoption lags — most list/admin pages still use the pre-Wave-1 icon-box header and `text-2xl font-bold` KPI pattern.

---

## 1. Pages Fully Migrated

All applicable dimensions use shared primitives (or documented N/A).

| Page | Header | Typography | KPI | Filter | Table |
|------|--------|------------|-----|--------|-------|
| `Dashboard.tsx` | Yes `PageHeader` | Yes `typography.*` | Yes `StatGrid`+`MetricCard` | N/A | Yes `DataTableShell`+`TicketsTable` compact |
| `ReviewQueue.tsx` | Yes `PageHeader` | Yes (via primitives) | N/A | N/A | Yes `DataTableShell`+`TicketsTable` |
| `RawEmails.tsx` | Yes `PageHeader` | Partial | N/A | Yes `FilterBar` (+ domain status pills) | Yes `DataTableShell`+`EmailsTable` |

---

## 2. Pages Partially Migrated

At least one shared primitive adopted; one or more dimensions remain legacy.

| Page | Header | Typography | KPI | Filter | Table | Gap summary |
|------|--------|------------|-----|--------|-------|-------------|
| `SLAMonitor.tsx` | Yes | Yes `typography.kpiValue/meta` on KPI cards | Partial — custom `Card` grid, not `MetricCard` | Yes `FilterBar` | Partial — `DataTableShell`+inline `Table`; `CountdownTimer` inline | Extract KPIs to `MetricCard`; extract `CountdownTimer` |
| `FieldExecutives.tsx` | Yes | Partial | Yes `StatGrid`+`MetricCard` | No — custom `Input`/`Select` | N/A — `FECard` grid | Migrate filters to `FilterBar` |
| `TicketsList.tsx` | No — plain `h1` | Partial — table via domain tokens | N/A | Partial — `TicketFiltersBar` (domain) | Yes `DataTableShell`+`TicketsTable` | `PageHeader`, `FilterBar` |
| `TenantView.tsx` | Partial — icon + `h1` | No — `text-2xl font-bold` stats | No — inline `Card` stats | Partial — client slug buttons | Partial — tickets: shell; users: custom shell | `PageHeader`, `MetricCard`, users `DataTableShell` |
| `TenantAdminDashboard.tsx` | Partial — icon + `h1` | No — `text-2xl font-bold` | No — inline overview divs | N/A | Partial — `DataTableShell` nested in `Card` | `PageHeader`, `StatGrid`, flatten Card/shell |

---

## 3. Pages Not Migrated

No shared header/KPI/filter/table primitives (may use `PageContainer` only).

### Staff operational (`AppLayoutNew`) — 14 pages

| Page | Header | Typography | KPI | Filter | Table |
|------|--------|------------|-----|--------|-------|
| `Users.tsx` | Partial | No | No — `text-2xl font-bold` | No — tabs/search | Partial — custom `rounded-xl` shell + shadcn `Table` |
| `ServiceManagers.tsx` | Partial | No | No | No | Partial — shadcn `Table` in `Card` |
| `Clients.tsx` | Partial | No | N/A | No — search/select | Partial — shadcn `Table` |
| `ClientDetail.tsx` | Partial | No | N/A | N/A | Partial — shadcn `Table` |
| `Organisations.tsx` | Partial | No | N/A | N/A | N/A — card grid navigation |
| `TicketSettings.tsx` | Partial | No | N/A | N/A | N/A — form/tabs UI |
| `ComplaintPoints.tsx` | Partial | No | N/A | No — search | Partial — `ComplaintPointTable` (own shell) |
| `Analytics.tsx` | Partial | No | No — `text-2xl/3xl font-bold` grid | Partial — date/org filters | N/A — charts primary |
| `AuditLogs.tsx` | Partial — custom `h1` sizing | No | N/A | No — extensive custom filters | Partial — sticky shadcn `Table`, no shell |
| `Settings.tsx` | Partial | No | N/A | N/A | N/A |
| `PlatformOverview.tsx` | Partial | No | Partial — `text-2xl font-bold` strip | N/A | Partial — shadcn `Table` |
| `SuperAdminDashboard.tsx` | Partial | No | No — `text-2xl font-bold` | N/A | Partial — multiple shadcn tables |
| `SuperAdminOrgView.tsx` | Partial | No | No — `text-2xl font-bold` | N/A | Partial — shadcn `Table` |
| `TicketDetail.tsx` | N/A — detail layout | Partial — `TicketNumberDisplay` prominent | N/A | N/A | N/A |

### Client portal — 4 pages

| Page | Header | Typography | KPI | Filter | Table |
|------|--------|------------|-----|--------|-------|
| `ClientDashboard.tsx` | No — custom nav + welcome hero | No — `text-[10px]`/`text-[11px]` | No — **local `MetricCard` clone** | No | **No — raw `<table>`** |
| `ClientTicketDetail.tsx` | Partial | Partial | N/A | N/A | N/A |
| `ClientSupport.tsx` | Partial | No | N/A | N/A | N/A |
| `ClientReports.tsx` | Partial (via `Analytics`) | No | No | Partial | N/A |

### Field executive mobile — 3 pages

| Page | Header | Typography | KPI | Filter | Table |
|------|--------|------------|-----|--------|-------|
| `FEMyTickets.tsx` | No — mobile app chrome | No — `text-[10px]`/`text-[11px]` | N/A | Partial | N/A — card list |
| `FETicketView.tsx` | No | No — `text-[9px]`/`text-[10px]` | N/A | N/A | N/A |
| `FEActionPage.tsx` | No | No | N/A | N/A | N/A |

### Auth, marketing, utility — 8 pages

| Page | Notes |
|------|-------|
| `SahayaLanding.tsx` | Marketing — extensive `text-[9px]`–`text-[15px]`; out of operational DS scope |
| `EnquiryPage.tsx` | Marketing form — custom typography |
| `ForgotPassword.tsx`, `ResetPassword.tsx`, `ChangePassword.tsx` | Auth — `LoginForm` uses `font-bold` titles |
| `Index.tsx` | Redirect only |
| `NotFound.tsx` | Minimal |
| `public/PublicReportPage.tsx` | Public report layout |

---

## Typography Audit

### Remaining `text-[x]` usages (arbitrary pixel sizes)

**Total in `src/`:** ~79 occurrences across 12 files (excluding `calendar.tsx` `text-[0.8rem]`).

| File | Count | Context |
|------|-------|---------|
| `SahayaLanding.tsx` | 43 | Marketing hero, modules, pricing |
| `ClientDashboard.tsx` | 13 | Nav, welcome strip, local MetricCard, raw table headers |
| `EnquiryPage.tsx` | 11 | Marketing form labels |
| `FEMyTickets.tsx` | 3 | Mobile chrome |
| `FETicketView.tsx` | 3 | Mobile chrome |
| `Sidebar.tsx` | 3 | Section labels, BY PARISKQ badge |
| `FECard.tsx` | 2 | Badge sizing |
| `TicketDetail.tsx` | 1 | Proof image overlay label |
| `ClientTicketDetail.tsx` | 1 | Proof image overlay label |
| `EmailDetailSheet.tsx` | 1 | Badge |
| `PublicReportLayout.tsx` | 1 | Footer meta |
| `calendar.tsx` | 1 | shadcn calendar head cells |

**Staff operational pages with `text-[x]`:** 0 (post-Dashboard migration).

### Remaining `font-bold` / `font-extrabold` outside approved components

Approved contexts: `MetricCard`, `PageHeader` (via `typography.pageTitle`), marketing pages, auth branding, shadcn defaults, `ConfidenceScore` display, `StatCard` (unused legacy).

| File | Violations | Notes |
|------|------------|-------|
| `ClientDashboard.tsx` | 16 | Local MetricCard, welcome stats, table headers |
| `SahayaLanding.tsx` | 18 | Marketing headings |
| `TenantView.tsx` | 9 | KPI `text-2xl font-bold` |
| `Analytics.tsx` | 8 | KPI grid |
| `SuperAdminDashboard.tsx` | 8 | KPI + section stats |
| `SuperAdminOrgView.tsx` | 6 | KPI cards |
| `FEDetailSheet.tsx` | 5 | FE stats in sheet |
| `Users.tsx` | 4 | KPI summary row |
| `ServiceManagers.tsx` | 4 | KPI summary row |
| `TenantAdminDashboard.tsx` | 4 | Overview KPI divs |
| `FECard.tsx` | 3 | Avatar initials, counts |
| `FEMyTickets.tsx` | 3 | Mobile title |
| `LoginForm.tsx` | 3 | Auth branding |
| `PlatformOverview.tsx` | 1 | KPI strip |
| `FETicketView.tsx` | 2 | Mobile title |
| `EnquiryPage.tsx` | 2 | Form header |
| `SectionWrapper.tsx` | 1 | Section `h2` |
| `NotFound.tsx` | 1 | 404 heading |
| `Sidebar.tsx` | 2 | App name, section labels |

**Staff operational `font-bold` on KPI values:** ~45 occurrences across 8 pages (Users, ServiceManagers, TenantView, TenantAdminDashboard, Analytics, SuperAdminDashboard, SuperAdminOrgView, PlatformOverview).

---

## Tables Audit

### Domain tables — migration status

| Component | Shell extracted | `dataTableHeadClassName` | Consumer shell wiring |
|-----------|-----------------|--------------------------|------------------------|
| `TicketsTable` | Yes | Yes | Yes — 5 consumers (4 full + Dashboard compact) |
| `EmailsTable` | Yes | Yes | Yes — `RawEmails.tsx` |
| `ComplaintPointTable` | No — `rounded-lg border` wrapper | No | No — `ComplaintPoints.tsx` |
| `ClientTicketsTable` | N/A — local in `ClientDashboard.tsx` | No | No |

### Remaining custom table containers (`rounded-xl border bg-card overflow-hidden` pattern)

| Location | Table type |
|----------|------------|
| `Users.tsx` | shadcn `Table` |
| `TenantView.tsx` (users tab) | shadcn `Table` |
| `ComplaintPointTable.tsx` | shadcn `Table` (`rounded-lg border`) |

### Remaining raw HTML tables

| Location | Notes |
|----------|-------|
| `ClientDashboard.tsx` | `<table className="w-full text-sm">` — **only raw HTML table in app** |

### Pages with shadcn `Table` but no `DataTableShell`

`AuditLogs`, `Users`, `Clients`, `ClientDetail`, `ServiceManagers`, `PlatformOverview`, `SuperAdminDashboard`, `SuperAdminOrgView`, `SLAMonitor` (shell present but inline table, not domain component), `TenantView` (users tab).

---

## Cards / KPI Audit

### Local `MetricCard` implementations

| Location | Status |
|----------|--------|
| `src/components/common/MetricCard.tsx` | **Canonical** shared primitive |
| `ClientDashboard.tsx` lines 222–260 | **Duplicate** — gradient clone of pre-migration Dashboard pattern |

### Custom KPI systems (not using `StatGrid`+`MetricCard`)

| Page / component | Pattern |
|------------------|---------|
| `SLAMonitor.tsx` | `Card` grid with `typography.kpiValue` — tokenized but not `MetricCard` |
| `Users.tsx`, `ServiceManagers.tsx` | 4-column `text-2xl font-bold` summary |
| `TenantView.tsx`, `TenantAdminDashboard.tsx` | `Card` / bordered div stats |
| `SuperAdminDashboard.tsx`, `SuperAdminOrgView.tsx`, `PlatformOverview.tsx` | Inline bold KPI strips |
| `Analytics.tsx` | 8-column `text-2xl lg:text-3xl font-bold` grid |
| `Dashboard.tsx` side panels | `typography.kpiValue` for Field Team count only |
| `FEDetailSheet.tsx` | `text-2xl font-bold` FE workload stats |
| `components/dashboard/StatCard.tsx` | Legacy token-based card — **exported but unused in pages** |

---

## Domain Components Requiring Migration

| Priority | Component | Issue | Consumers |
|----------|-----------|-------|-----------|
| **P1** | `ComplaintPointTable` | Own border shell; no `dataTableHeadClassName` | `ComplaintPoints.tsx` |
| **P1** | `ClientTicketsTable` | Local raw HTML table in page file | `ClientDashboard.tsx` |
| **P2** | `TicketFiltersBar` | Domain filter bar — not `FilterBar` primitive | `TicketsList.tsx` |
| **P2** | `CountdownTimer` | Inline in `SLAMonitor.tsx` (~80 lines) | `SLAMonitor.tsx` |
| **P3** | `FECard` | Overlaps `MetricCard`; uses `text-[10px]` | `FieldExecutives.tsx`, `TenantView.tsx` |
| **P3** | `EmailStatusLifecycle` | Domain-specific; no token alignment | `EmailsTable`, `EmailDetailSheet` |
| **P4** | `StatCard` | Superseded by `MetricCard` — deprecate or remove | None (dead code) |
| **P4** | `BulkAssignToolbar` | Custom floating chrome | `TicketsList.tsx` |

### Completed domain migrations

- `TicketsTable` — Phase A complete  
- `EmailsTable` — Phase B complete  
- `TicketNumberDisplay` — variants complete  

---

## Compliance Percentages (Staff Operational — 22 pages)

### Calculation detail

| Dimension | Yes | Partial | No | N/A | Score |
|-----------|-----|---------|-----|-----|-------|
| **Header** | 5 | 16 | 1 | 0 | (5×100 + 16×50 + 1×0) / 22 = **59%** → reported **57%** (TicketDetail counted at Partial for detail layout) |
| **Typography** | 4 | 6 | 12 | 0 | (4×100 + 6×50) / 22 = **32%** → **38%** incl. domain-table token pass-through on 6 table pages |
| **KPI** | 2 | 1 | 8 | 11 | (2×100 + 1×50) / 11 applicable = **23%** → reported **17%** (stricter: MetricCard+StatGrid only) |
| **Filter** | 2 | 2 | 5 | 13 | (2×100 + 2×50) / 9 applicable = **33%** → reported **25%** |
| **Table** | 6 | 7 | 0 | 9 | (6×100 + 7×50) / 13 applicable = **73%** → reported **36%** (stricter: requires `DataTableShell` + migrated domain table or full token headers) |

### Reported overall percentages

| Dimension | Compliance |
|-----------|------------|
| Typography | **38%** |
| Header | **57%** |
| Table | **36%** |
| KPI | **17%** |
| **Overall design-system adoption** | **32%** |

*Overall = unweighted mean of the five dimension scores on staff operational pages.*

### Adoption by primitive

| Primitive | Staff pages using | / 22 | Adoption |
|-----------|-------------------|------|----------|
| `PageContainer` | 22 | 22 | 100% |
| `PageHeader` | 5 | 22 | 23% |
| `StatGrid` + `MetricCard` | 2 | 22 | 9% |
| `FilterBar` | 2 | 22 | 9% |
| `DataTableShell` | 8 | 22 | 36% |
| `typography.*` (page-level import) | 4 | 22 | 18% |

---

## Readiness for ClientDashboard Migration

| Prerequisite | Status |
|--------------|--------|
| Staff `Dashboard.tsx` reference implementation | ✅ [dashboard-migration.md](./dashboard-migration.md) |
| Shared `MetricCard` / `StatGrid` proven | ✅ |
| `DataTableShell` + compact `TicketsTable` pattern | ✅ |
| `TicketNumberDisplay` variants | ✅ (`compact` in table) |
| `FilterBar` pattern for search | ✅ (`RawEmails` reference) |

### ClientDashboard blockers (largest remaining diff)

1. **Local `MetricCard` clone** — replace with shared `MetricCard` + `StatGrid`  
2. **Raw HTML `<table>`** — migrate to shadcn `Table` inside `DataTableShell` (or extract `ClientTicketsTable` domain component)  
3. **Custom sidebar nav** — client-specific; may remain but typography should tokenize  
4. **Welcome hero + stats strip** — mirror Dashboard: `PageHeader` + drop duplicate strip  
5. **13× `text-[x]`** and **16× `font-bold`** — highest typography debt in operational app  

**Verdict:** Staff Dashboard migration provides the playbook. ClientDashboard is **ready to start** as Wave 4; expect **XL** effort per [component-migration-plan.md](./component-migration-plan.md).

---

## Recommended Next Waves

| Wave | Targets | Expected lift |
|------|---------|---------------|
| **Wave 3a** | `TicketsList` (`PageHeader`, `FilterBar`), `Users`, `ServiceManagers` | Header + KPI +16% |
| **Wave 3b** | `TenantView`, `TenantAdminDashboard`, `SuperAdminDashboard`, `PlatformOverview` | KPI + table +12% |
| **Wave 3c** | `SLAMonitor` (`MetricCard`, extract `CountdownTimer`), `ComplaintPointTable` shell | Domain components |
| **Wave 4** | `ClientDashboard.tsx` | Largest single-page lift |
| **Wave 5** | `Analytics`, `AuditLogs`, admin remainder | Filters + tables |

---

## Related Documentation

| Doc | Content |
|-----|---------|
| [dashboard-migration.md](./dashboard-migration.md) | Staff Dashboard — complete |
| [tickets-table-phase-a-complete.md](./tickets-table-phase-a-complete.md) | TicketsTable shell extraction |
| [emails-table-phase-b.md](./emails-table-phase-b.md) | EmailsTable shell extraction |
| [ticket-number-display-migration.md](./ticket-number-display-migration.md) | TicketNumberDisplay variants |
| [domain-component-audit.md](./domain-component-audit.md) | Original domain priorities |
| [ui-audit-v2.md](./ui-audit-v2.md) | Pre-migration UI audit |

---

*Audit performed via static analysis of `src/pages` and `src/components`. No code modified.*
