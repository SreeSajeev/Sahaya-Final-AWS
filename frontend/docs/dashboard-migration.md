# Dashboard Migration — Complete

> **Date:** 2026-06-11  
> **Target:** `src/pages/Dashboard.tsx`  
> **Related:** [component-migration-plan.md](./component-migration-plan.md), [ticket-number-display-migration.md](./ticket-number-display-migration.md)

Staff Dashboard migrated to shared design-system primitives. Business logic, hooks, and calculations unchanged.

---

## Files Modified

| File | Change |
|------|--------|
| `src/pages/Dashboard.tsx` | Full UI migration to `PageHeader`, `MetricCard`, `StatGrid`, `DataTableShell`, typography tokens |

---

## KPI Cards Replaced

### Removed: local `MetricCard` (lines 25–74)

Inline component with gradient `style={{}}` shadows, `text-[10px]` labels, and manual hover handlers.

### Added: shared `StatGrid` + `MetricCard`

| Card | Variant | Icon | Value source |
|------|---------|------|--------------|
| Total Tickets | `primary` | `Ticket` | `stats?.totalTickets` |
| Open Tickets | `accent` | `Clock` | `stats?.openTickets` |
| Needs Review | `default` | `AlertTriangle` | `stats?.needsReviewCount` |
| SLA Breaches | `default` | `AlertCircle` | `stats?.slaBreaches` |

Loading state preserved: `"—"` while `statsLoading`.

Primary/accent cards use `interactive` for hover lift (via `.card-interactive`).

---

## Custom Typography Removed

| Removed | Replaced with |
|---------|---------------|
| `text-2xl md:text-3xl font-semibold` (page h1) | `PageHeader` → `typography.pageTitle` |
| `text-sm text-muted-foreground` (subtitle) | `PageHeader` → `typography.body` |
| `text-[10px] font-bold uppercase tracking-[0.1em]` (local MetricCard labels) | `MetricCard` → `typography.meta` |
| `text-2xl font-bold tracking-tight` (local MetricCard values) | `MetricCard` → `typography.kpiValue` |
| `text-xs` (local MetricCard descriptions) | `MetricCard` → `typography.meta` |
| `text-xl font-bold` (welcome stats strip) | **Removed** — strip dropped (duplicated KPIs) |
| `text-[11px]` (welcome stats labels) | **Removed** with welcome strip |
| `text-lg font-semibold` (section headings) | `typography.sectionTitle` |
| `text-base font-semibold` (side panel titles) | `typography.sectionTitle` |
| `text-3xl font-bold` (Field Team count) | `typography.kpiValue` |
| `text-sm text-muted-foreground` (side panel body) | `typography.body` |
| `font-semibold` (needs-review banner title) | `typography.sectionTitle` |

---

## Layout Changes

| Before | After |
|--------|-------|
| Custom welcome hero section (gradient bg, grid overlay) | `PageContainer` + `PageHeader` |
| Inline welcome stats strip (Total / Open / SLA text) | Removed — metrics in `StatGrid` |
| `dashboard-overview-section` gradient wrapper | Plain `section` + `StatGrid` |
| `dashboard-tickets-card` custom card chrome | Section title row + `DataTableShell` |
| `TicketsTable loading={…} compact` (blank on load/empty) | Shell owns loading/empty; `TicketsTable compact` when data exists |
| Multiple `max-w-7xl px-3` sections | Single `PageContainer` |

---

## Recent Tickets Pattern

```tsx
<DataTableShell
  aria-label="Recent tickets"
  loading={ticketsLoading}
  loadingLabel={TICKETS_TABLE_LOADING_LABEL}
  emptyState={
    !ticketsLoading && recentDisplayTickets.length === 0 ? (
      <TicketsTableEmptyState />
    ) : undefined
  }
>
  {!ticketsLoading && recentDisplayTickets.length > 0 ? (
    <TicketsTable tickets={recentDisplayTickets} compact />
  ) : null}
</DataTableShell>
```

Filter unchanged: reject `REJECTED`, slice to 8.

---

## Preserved (unchanged)

| Concern | Status |
|---------|--------|
| `useDashboardStats()` | ✅ |
| `useTickets({ status: "all" })` | ✅ |
| `useFieldExecutives(true)` | ✅ |
| Needs-review conditional banner + `/app/review` link | ✅ |
| Ticket status breakdown calculations | ✅ |
| Field executives count | ✅ |
| Automation Health static labels | ✅ |
| `.btn-primary` on Review Now CTA | ✅ |
| Chart logic | N/A — no charts on this page |

---

## Remaining Dashboard-Specific Components

| Item | Location | Notes |
|------|----------|-------|
| `GradientDivider` | `Dashboard.tsx` | Inline gradient line — candidate for shared primitive |
| Needs-review alert box | `Dashboard.tsx` | Custom warning `style={{}}` border/background |
| Side panels (`dashboard-side-card`) | `Dashboard.tsx` | Automation Health, Ticket Status, Field Team — inline border/shadow styles |
| Ticket status dot colors | `Dashboard.tsx` | Inline `hsl()` per status — not yet tokenized |
| `.btn-primary` | Review CTA | Orange gradient utility — design-system follow-up |
| Success status badges | Automation Health | `text-xs font-semibold` inline — not yet a shared badge primitive |

These are intentionally retained; not in scope for this migration.

---

## Readiness for ClientDashboard Migration

### **Ready — pattern established**

| Prerequisite | Staff Dashboard | ClientDashboard |
|--------------|-----------------|-----------------|
| Shared `PageHeader` | ✅ | Pending |
| Shared `MetricCard` + `StatGrid` | ✅ | Local clone still exists |
| `DataTableShell` for ticket list | ✅ (compact) | Raw `<table>` — largest diff |
| `TicketNumberDisplay` variants | ✅ (via TicketsTable) | ✅ already uses `compact` |
| `PageContainer` | ✅ | Custom section layout |
| Welcome stats strip | Removed (KPI grid) | Duplicate strip still present |
| Local `MetricCard` | **Deleted** | **Still present** — mirror this migration |
| `GradientDivider` | Kept inline | Duplicated inline |

### Recommended ClientDashboard wave

1. Replace local `MetricCard` clone → shared `MetricCard` + `StatGrid`
2. Replace custom nav header area → `PageHeader` (client-branded actions slot)
3. Migrate `ClientTicketsTable` raw HTML → shadcn `Table` inside `DataTableShell`
4. Apply `typography.*` tokens to remaining inline text
5. Adopt `PageContainer` or client-specific layout wrapper

**Verdict:** Staff Dashboard migration is the reference implementation for ClientDashboard Wave 4.

---

*Build verified: `npm run build` passes.*
