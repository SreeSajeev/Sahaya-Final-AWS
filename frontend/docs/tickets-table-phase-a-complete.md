# TicketsTable Phase A — Complete

> **Status:** Phase A Part 2 done (2026-06-11)  
> **Prerequisite:** [tickets-table-migration.md](./tickets-table-migration.md) (Part 1 — component refactor)

`TicketsTable` is now a pure table renderer. All full-table consumers own loading and empty UI via `DataTableShell`, `TICKETS_TABLE_LOADING_LABEL`, and `TicketsTableEmptyState`.

---

## Pages Updated (Part 2)

| Page | Changes |
|------|---------|
| `TicketsList.tsx` | `DataTableShell` wraps table; loading/empty from shell; `filterEmpty` via `hasActiveFilters`; bulk selection unchanged |
| `ReviewQueue.tsx` | Shell owns `loading` / `emptyState`; removed Wave 2 transparent `border-0 bg-transparent shadow-none` hack |
| `TenantAdminDashboard.tsx` | Shell inside Tickets `Card` (`border-0 shadow-none` on shell to avoid double border with parent `Card`) |
| `TenantView.tsx` | Shell on tickets tab; client-filter empty copy preserved |

### Per-page pattern

```tsx
import { DataTableShell } from '@/components/common';
import {
  TicketsTable,
  TicketsTableEmptyState,
  TICKETS_TABLE_LOADING_LABEL,
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
    <TicketsTable tickets={tickets} /* domain props only */ />
  ) : null}
</DataTableShell>
```

### Unchanged in Part 2

| Page | Reason |
|------|--------|
| `Dashboard.tsx` | `compact` embed only — no full-table shell; parent card provides chrome |

---

## Remaining Pages Using TicketsTable

| Page | Mode | Shell status |
|------|------|--------------|
| `Dashboard.tsx` | `compact` | Intentionally embedded in custom dashboard card — no `DataTableShell` |
| *(none other)* | — | All full-table consumers migrated |

---

## Remaining Custom Table Styling

Places that still duplicate the pre-migration `rounded-xl border bg-card` table shell pattern (not yet on `DataTableShell`):

| Location | Notes |
|----------|-------|
| `EmailsTable.tsx` | Own border wrapper + inline loading/empty — **Phase A Part 3 target** |
| `RawEmails.tsx` | `DataTableShell` + transparent hack around `EmailsTable` (same pattern ReviewQueue had) |
| `Users.tsx` | Inline `rounded-xl border bg-card overflow-hidden` wrapper |
| `TenantView.tsx` | Users tab — custom table shell (tickets tab now uses `DataTableShell`) |
| `SLAMonitor.tsx` | `DataTableShell` for SLA table (already migrated) |
| `BulkAssignToolbar.tsx` | Floating toolbar chrome — not a data table |

### Nested-shell note

`TenantAdminDashboard` Tickets section keeps the outer `Card` for section grouping; inner `DataTableShell` uses `border-0 shadow-none` so the card border is the single visual frame. A future cleanup could replace the Card body with a bare `DataTableShell` + section header.

---

## Readiness for EmailsTable Migration

**Ready.** The TicketsTable migration establishes the canonical pattern for domain tables:

1. **Component** — Remove shell, loading, and empty UI from `EmailsTable.tsx`; export `EMAILS_TABLE_LOADING_LABEL` and `EmailsTableEmptyState` (mirror TicketsTable exports).
2. **Consumer** — `RawEmails.tsx` already has `DataTableShell`; remove transparent `className` hack and wire `loading` / `emptyState` the same way as `ReviewQueue.tsx`.
3. **Tokens** — Apply `dataTableHeadClassName`, `typography.body`, `typography.meta` in `EmailsTable` (same as TicketsTable Part 1).
4. **Regression** — Verify filter bar, row actions, and link navigation unchanged.

### EmailsTable migration checklist (Part 3)

- [ ] Refactor `EmailsTable.tsx` — table markup only
- [ ] Export loading label + empty state component
- [ ] Update `RawEmails.tsx` — shell owns loading/empty; remove transparent hack
- [ ] Document in `docs/emails-table-migration.md`

---

## Phase A Summary

| Part | Scope | Status |
|------|-------|--------|
| Part 1 | `TicketsTable` component — remove shell/loading/empty | Done |
| Part 2 | Page consumers — `DataTableShell` ownership | Done |
| Part 3 | `EmailsTable` — same pattern | Pending |

### Behaviour preserved

- Filtering, sorting, pagination (`TicketsList`)
- Permissions and bulk selection (`TicketsList`)
- Row actions, links, `rowExtra`, `selectable` props
- Compact dashboard embed (`Dashboard.tsx`)

### Visual changes (intentional)

- Table headers: uppercase via `dataTableHeadClassName`
- Loading: centered text in shell (was spinner in old table shell)
- Empty: `TicketsTableEmptyState` in shell (same copy as before)

---

*Build verified: `npm run build` passes after Part 2.*
