# Design System Final Migration

> **Date:** 2026-06-11  
> **Scope:** Full-platform enforcement pass (`field-ops-assist/src`)  
> **Goal:** Single visual system via shared primitives — not page-by-page waves

---

## Summary

One migration pass replaced legacy page chrome, typography, KPI grids, table shells, and filter rows across **all staff operational pages** and **client portal pages**. Shared adapters were introduced where domain components needed composition (`TicketFiltersBar` → `FilterBar`, `DataTableEmptyState`, `PageHeader.titleSlot` / `leading`).

**Build:** `npm run build` passes.

---

## Shared Components Created / Updated

| File | Change |
|------|--------|
| `src/components/common/DataTableEmptyState.tsx` | **New** — reusable empty state + `DEFAULT_TABLE_LOADING_LABEL` |
| `src/components/common/PageHeader.tsx` | Added `titleSlot`, `leading` for detail pages |
| `src/components/common/FilterBar.tsx` | Standardized `gap-4`, secondary `p-4` |
| `src/components/common/MetricCard.tsx` | Standardized `gap-4`, `p-4 md:p-6` |
| `src/components/common/index.ts` | Export `DataTableEmptyState` |
| `src/components/tickets/TicketFiltersBar.tsx` | **Adapter** over `FilterBar` + `secondary` slot |
| `src/components/complaint-points/ComplaintPointTable.tsx` | Shell extracted; returns `null` when loading/empty |
| `src/components/sla/CountdownTimer.tsx` | **New** — extracted from `SLAMonitor.tsx` |
| `src/components/dashboard/StatCard.tsx` | **Deleted** — superseded by `MetricCard` |

---

## Pages Modified (30)

### Staff operational (`AppLayoutNew`) — 22

| Page | Header | KPI | Filter | Table |
|------|--------|-----|--------|-------|
| `Dashboard.tsx` | PageHeader | StatGrid + MetricCard | — | DataTableShell |
| `TicketsList.tsx` | PageHeader | — | FilterBar via TicketFiltersBar | DataTableShell |
| `ReviewQueue.tsx` | PageHeader | — | — | DataTableShell |
| `RawEmails.tsx` | PageHeader | — | FilterBar | DataTableShell |
| `SLAMonitor.tsx` | PageHeader | StatGrid + MetricCard | FilterBar | DataTableShell |
| `FieldExecutives.tsx` | PageHeader | StatGrid + MetricCard | FilterBar | FECard grid (N/A) |
| `Users.tsx` | PageHeader | StatGrid + MetricCard | FilterBar | DataTableShell |
| `ServiceManagers.tsx` | PageHeader | StatGrid + MetricCard | FilterBar | DataTableShell |
| `Clients.tsx` | PageHeader | — | FilterBar | DataTableShell |
| `ClientDetail.tsx` | PageHeader | — | — | DataTableShell |
| `Organisations.tsx` | PageHeader | — | — | Card nav (N/A) |
| `TenantView.tsx` | PageHeader | StatGrid + MetricCard | FilterBar | DataTableShell ×2 |
| `TenantAdminDashboard.tsx` | PageHeader | StatGrid + MetricCard | — | DataTableShell |
| `TicketSettings.tsx` | PageHeader | — | — | Forms (N/A) |
| `ComplaintPoints.tsx` | PageHeader | — | FilterBar | DataTableShell |
| `Analytics.tsx` | PageHeader | StatGrid + MetricCard | — | Charts (N/A) |
| `AuditLogs.tsx` | PageHeader | — | FilterBar sticky | DataTableShell |
| `Settings.tsx` | PageHeader | — | — | Forms (N/A) |
| `PlatformOverview.tsx` | PageHeader | StatGrid + MetricCard | — | DataTableShell |
| `SuperAdminDashboard.tsx` | PageHeader | StatGrid + MetricCard | — | DataTableShell |
| `SuperAdminOrgView.tsx` | PageHeader | StatGrid + MetricCard | — | DataTableShell |
| `TicketDetail.tsx` | PageHeader (`titleSlot` + `leading`) | — | — | Detail (N/A) |

### Client portal — 3

| Page | Changes |
|------|---------|
| `ClientDashboard.tsx` | PageHeader; deleted local `MetricCard`; StatGrid + shared MetricCard; raw `<table>` → shadcn `Table` + DataTableShell; typography tokens |
| `ClientTicketDetail.tsx` | PageHeader with `titleSlot` + `leading` |
| `ClientSupport.tsx` | PageHeader + PageContainer |

### Previously migrated (retained) — 3

`Dashboard.tsx`, `ReviewQueue.tsx`, `RawEmails.tsx` — spacing normalized (`rounded-xl`, `p-4`/`p-6`).

---

## Replacement Counts

| Category | Before (approx.) | After (approx.) | Net replacements |
|----------|------------------|-----------------|------------------|
| **Typography `text-[…]`** (operational `src/pages`) | ~30 | 8 | **~22 removed** |
| **`font-bold` / `font-extrabold`** (staff pages) | ~45 | 0 | **~45 removed** |
| **Custom page headers** (icon box + `h1`) | 22 | 0 | **22 → PageHeader** |
| **Local `MetricCard` implementations** | 1 (`ClientDashboard`) | 0 | **1 deleted** |
| **Custom KPI `text-2xl font-bold` grids** | ~12 pages | 0 | **~48 KPI tiles → MetricCard** |
| **Custom bordered table shells** | ~15 | 0 | **~15 → DataTableShell** |
| **Raw HTML `<table>`** | 1 (`ClientDashboard`) | 0 | **1 migrated** |
| **Custom search/filter rows** | ~12 | 0 | **~12 → FilterBar** |
| **Duplicate table loading UI** | ~10 inline spinners | 0 | **→ DataTableShell** |
| **Duplicate table empty UI** | ~10 inline blocks | 0 | **→ DataTableEmptyState / domain empty** |

### Typography token adoption

- `typography.pageTitle` — via `PageHeader`
- `typography.sectionTitle` — section headings, empty states
- `typography.kpiValue` — via `MetricCard`
- `typography.body` / `typography.meta` — table cells, descriptions, filters
- `dataTableHeadClassName` — all migrated operational tables

---

## Obsolete Implementations Removed

| Removed | Location |
|---------|----------|
| Local `MetricCard` function (~40 lines) | `ClientDashboard.tsx` |
| `StatCard.tsx` component | `src/components/dashboard/` |
| Custom welcome stats strip | `ClientDashboard.tsx` (metrics in StatGrid) |
| Raw HTML tickets table | `ClientDashboard.tsx` |
| Inline `CountdownTimer` (~80 lines) | `SLAMonitor.tsx` |
| `ComplaintPointTable` border wrapper | `ComplaintPointTable.tsx` |
| Per-page table `rounded-xl border bg-card` shells | Users, Clients, ServiceManagers, TenantView, etc. |
| Custom header icon gradient boxes | All staff list pages |

---

## Out of Scope (intentional)

| Area | Reason |
|------|--------|
| `SahayaLanding.tsx`, `EnquiryPage.tsx` | Marketing — custom brand typography |
| `FEMyTickets.tsx`, `FETicketView.tsx`, `FEActionPage.tsx` | Mobile FE shell — separate layout system |
| `ForgotPassword`, `ResetPassword`, `ChangePassword`, `LoginForm` | Auth branding |
| `NotFound.tsx` | Minimal utility page |
| Proof image overlay `text-[10px]` labels | `TicketDetail`, `ClientTicketDetail` — media chrome |
| Client sidebar nav in `ClientDashboard` | Domain-specific portal chrome (typography partially tokenized) |

---

## Standardization Applied

| Rule | Enforcement |
|------|-------------|
| Page structure | `<PageContainer><PageHeader />…</PageContainer>` on all `AppLayoutNew` pages |
| Gap scale | `gap-2`, `gap-4`, `gap-6`, `gap-8` in migrated/shared components |
| Padding scale | `p-4`, `p-6`, `p-8` in migrated/shared components |
| Border radius | `rounded-lg`, `rounded-xl` (removed `rounded-2xl` from Dashboard side panels) |

---

## Related Documentation

- [design-system-final-audit.md](./design-system-final-audit.md) — post-migration compliance %
- [design-system-adoption-report.md](./design-system-adoption-report.md) — pre-migration baseline
- [dashboard-migration.md](./dashboard-migration.md) — staff Dashboard reference

---

*Full-platform migration complete. `npm run build` verified.*
