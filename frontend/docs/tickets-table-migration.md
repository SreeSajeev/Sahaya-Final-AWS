# TicketsTable Migration — Phase A Part 1

> **Status:** Component refactored; **pages not yet updated**  
> **Date:** June 2026  
> **File:** `src/components/tickets/TicketsTable.tsx`

`TicketsTable` no longer owns table chrome (border, card background, loading, or empty UI). **`DataTableShell` is the single source of truth** for those concerns. Parent pages must be updated in Phase A Part 2 to restore full visual parity.

---

## What Changed in TicketsTable

### Removed from component

| Removed | Previous implementation |
|---------|-------------------------|
| Outer table shell | `rounded-xl border bg-card overflow-hidden` |
| Inner padding wrapper | `p-6 overflow-x-auto` (replaced with `overflow-x-auto` only) |
| Loading UI | Spinner + `text-sm text-muted-foreground` message (`h-48` centered) |
| Empty UI | Icon + `h3` + description (`h-48`, `p-8`) |
| Default table headers | shadcn default `font-medium` sentence-case heads |
| Inline body typography | `text-sm`, `text-xs text-muted-foreground` on cells |

### Added to component

| Addition | Purpose |
|----------|---------|
| `dataTableHeadClassName` on all `TableHead` | Uppercase meta-style column headers |
| `typography.body` / `typography.meta` on cells | Tokenized cell text |
| `TICKETS_TABLE_EMPTY_COPY` | Exported copy for parent empty states |
| `TICKETS_TABLE_LOADING_LABEL` | Exported label for parent loading state |
| `TicketsTableEmptyState` | Ready-made empty node for `DataTableShell` |
| `return null` when `loading` or `tickets.length === 0` | Defers chrome to parent shell |

### Preserved (unchanged behavior)

- Column set and order
- Row rendering (links, permissions via `canOpenTicketDetail`)
- Bulk select (`selectable`, checkboxes, `rowExtra` supplements)
- `compact` mode for Dashboard embed (still self-contained list, not wrapped in `DataTableShell`)
- `StatusBadge`, `ConfidenceScore`, priority star, zebra rows, hover styles
- All props on `TicketsTableProps` (API stable; `loading` / `filterEmpty` documented as parent concerns)

---

## Removed Styles (reference)

```tsx
// Shell — REMOVED
<div className="rounded-xl border bg-card overflow-hidden">
  <div className="p-6 overflow-x-auto">

// Loading — REMOVED
<div className="flex h-48 items-center justify-center">...</div>

// Empty — REMOVED
<div className="flex h-48 flex-col items-center justify-center text-center p-8">...</div>

// Headers — REPLACED
<TableHead>Ticket #</TableHead>
// →
<TableHead className={dataTableHeadClassName}>Ticket #</TableHead>
```

---

## Remaining Custom Styles (intentional)

| Style | Location | Reason |
|-------|----------|--------|
| `ring-yellow-300/60`, `fill-yellow-500 text-yellow-500` | Priority star | Domain indicator; not yet tokenized |
| `hover:bg-muted/40 hover:shadow-sm` | Row hover | Table interaction pattern |
| `bg-background` / `bg-muted/20` | Zebra striping | Readability |
| `ring-1 ring-primary/30` | Selected bulk row | Selection state |
| `text-primary hover:underline` | Ticket link | Semantic link color |
| `max-w-[160px]`, `max-w-[280px]`, `max-w-[140px]` | Column constraints | Layout |
| `font-mono` | Client slug | Data display convention |
| `divide-y divide-border` | Compact mode list | Dashboard embed pattern |
| `py-3 px-4 rounded-lg` | Compact rows | Dashboard embed pattern |
| `text-2xl` emoji | `TicketsTableEmptyState` only | Empty illustration (for parent use) |

### Header visual change (expected)

Column headers are now **uppercase** with `tracking-wide` per `dataTableHeadClassName`. This is an intentional design-system alignment; slightly different from previous sentence-case headers.

---

## Affected Pages (require Phase A Part 2)

Until pages are updated, **loading and empty states will not render** (component returns `null`). Pages with existing `DataTableShell` + transparent border hack need full shell wiring.

| Page | Current usage | Required follow-up |
|------|---------------|-------------------|
| `TicketsList.tsx` | Direct `<TicketsTable loading …>` | Wrap in `DataTableShell` with `loading`, `emptyState={<TicketsTableEmptyState filterEmpty={…} />}` |
| `ReviewQueue.tsx` | `DataTableShell` + transparent hack + `TicketsTable` | Remove transparent `className`; shell owns `loading` / `emptyState` |
| `Dashboard.tsx` | `compact` mode only | **No shell change** — compact path unchanged |
| `TenantAdminDashboard.tsx` | Full table | Add `DataTableShell` + loading/empty |
| `TenantView.tsx` | Full table + `rowExtra` | Add `DataTableShell` + loading/empty |

---

## Follow-Up Work (Phase A Part 2)

### Per-page pattern (full table)

```tsx
import {
  DataTableShell,
  TICKETS_TABLE_LOADING_LABEL,
} from '@/components/common';
import {
  TicketsTable,
  TicketsTableEmptyState,
} from '@/components/tickets/TicketsTable';

<DataTableShell
  aria-label="Tickets"
  loading={isLoading}
  loadingLabel={TICKETS_TABLE_LOADING_LABEL}
  emptyState={
    !isLoading && tickets.length === 0 ? (
      <TicketsTableEmptyState filterEmpty={hasActiveFilters} />
    ) : undefined
  }
>
  {!isLoading && tickets.length > 0 ? (
    <TicketsTable tickets={tickets} rowExtra={rowExtra} selectable={…} />
  ) : null}
</DataTableShell>
```

### Checklist

- [ ] `TicketsList.tsx` — shell + remove `loading` from `TicketsTable` (or leave prop; ignored)
- [ ] `ReviewQueue.tsx` — shell `loading` / `emptyState`; remove `border-0 shadow-none` hack
- [ ] `TenantAdminDashboard.tsx` — add shell
- [ ] `TenantView.tsx` — add shell
- [ ] `Dashboard.tsx` — verify compact embed only (no shell)
- [ ] Optional: add `p-4 md:p-6` wrapper inside shell if table feels flush against border (old shell had `p-6`)

### Phase A Part 3

- `EmailsTable` — same shell extraction pattern
- Domain audit: `docs/domain-component-audit.md`

---

## API Exports

| Export | Type | Use |
|--------|------|-----|
| `TicketsTable` | Component | Table markup only |
| `TICKETS_TABLE_EMPTY_COPY` | Constants | Custom empty copy |
| `TICKETS_TABLE_LOADING_LABEL` | string | `DataTableShell loadingLabel` |
| `TicketsTableEmptyState` | Component | `DataTableShell emptyState` |

---

## Regression Notes

| Scenario | Before Part 2 | After Part 2 |
|----------|---------------|--------------|
| Loading | Spinner inside table or shell | `DataTableShell` loading text |
| Empty | In-table empty UI | `TicketsTableEmptyState` in shell |
| Data rows | Bordered card table | Shell border + table inside |
| Compact Dashboard | Unchanged | Unchanged |
| Header case | Sentence case | UPPERCASE (design token) |

---

*Component-only migration complete. Update pages before release to production.*
