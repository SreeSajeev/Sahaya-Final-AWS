# EmailsTable Phase B — Complete

> **Date:** 2026-06-11  
> **Status:** Complete  
> **Pattern reference:** [tickets-table-phase-a-complete.md](./tickets-table-phase-a-complete.md)

`EmailsTable` now matches the finalized `TicketsTable` architecture: table markup only, with `DataTableShell` owning loading, empty, and border chrome on the consuming page.

---

## Files Modified

| File | Change |
|------|--------|
| `src/components/emails/EmailsTable.tsx` | Removed shell/loading/empty; applied design tokens; exported helpers |
| `src/pages/RawEmails.tsx` | Shell owns loading/empty; removed transparent hack; conditional table render |

---

## What Changed in EmailsTable

### Removed (parent / shell now owns)

| Concern | Previous implementation |
|---------|-------------------------|
| Loading UI | 5× `Skeleton` rows (`h-20`) |
| Empty UI | Centered `Mail` icon + title/description block |
| Outer shell | `rounded-xl border bg-card` wrapper |
| Inner overflow | Nested `overflow-x-auto` inside shell (shell div removed; `overflow-x-auto` kept as sole wrapper) |

### Added

| Export | Purpose |
|--------|---------|
| `EMAILS_TABLE_LOADING_LABEL` | `'Loading emails...'` for `DataTableShell loadingLabel` |
| `EMAILS_TABLE_EMPTY_COPY` | Default + filtered empty copy constants |
| `EmailsTableEmptyState` | Ready-made empty node for `DataTableShell` |

### Design-system tokens applied

| Element | Token |
|---------|-------|
| Column headers | `dataTableHeadClassName` (uppercase, tracking-wide) |
| Subject line | `typography.body` + `font-medium` |
| Sender, dates, dashes | `typography.meta` |
| Badge text | `typography.meta` |

### Behaviour preserved

| Feature | Location | Status |
|---------|----------|--------|
| Refresh | `RawEmails` `PageHeader` action → `refetch()` | Unchanged |
| Status filtering | Status pill buttons + `statusFilter` state | Unchanged |
| Search | `FilterBar` + client-side `filteredEmails` | Unchanged |
| Email actions | View, reparse, create ticket, external link | Unchanged |
| Row click → detail sheet | `onViewEmail` on row + action buttons | Unchanged |
| Sorting | — | Not present (none removed) |
| Pagination | — | Not present (none removed) |

### Component contract

```tsx
// Returns null when loading or empty — parent must handle both via DataTableShell
if (loading || emails.length === 0) {
  return null;
}
```

Deprecated props (documented, ignored at render): `loading`, `filterEmpty`.

---

## RawEmails.tsx Pattern

```tsx
import {
  EmailsTable,
  EmailsTableEmptyState,
  EMAILS_TABLE_LOADING_LABEL,
} from '@/components/emails/EmailsTable';

const hasActiveFilters = Boolean(search.trim() || statusFilter !== 'all');

<DataTableShell
  aria-label="Raw emails"
  loading={isLoading}
  loadingLabel={EMAILS_TABLE_LOADING_LABEL}
  emptyState={
    !isLoading && filteredEmails.length === 0 ? (
      <EmailsTableEmptyState
        filterEmpty={hasActiveFilters && totalEmails > 0}
      />
    ) : undefined
  }
>
  {!isLoading && filteredEmails.length > 0 ? (
    <EmailsTable
      emails={filteredEmails}
      onViewEmail={handleViewEmail}
      onReparse={handleReparse}
      onCreateTicket={handleCreateTicket}
    />
  ) : null}
</DataTableShell>
```

**Removed:** `tableHasOwnShell` variable and `overflow-visible border-0 bg-transparent shadow-none` shell override (Wave 2 workaround).

---

## Styles Removed

| Class / pattern | Was on |
|-----------------|--------|
| `rounded-xl border bg-card` | `EmailsTable` outer wrapper |
| `Skeleton` loading rows | `EmailsTable` loading branch |
| `flex flex-col items-center justify-center py-16` | `EmailsTable` empty branch |
| `rounded-2xl bg-muted` + `h-16 w-16` icon box | Empty state (replaced by `EmailsTableEmptyState` using design tokens) |
| `text-lg font-semibold` | Empty title (→ `typography.sectionTitle`) |
| `text-sm` / `text-xs` ad-hoc cell text | Cells (→ `typography.body` / `typography.meta`) |
| Sentence-case headers | Column headers (→ uppercase via `dataTableHeadClassName`) |

### Intentionally retained (domain-specific)

| Style | Reason |
|-------|--------|
| `data-table-row cursor-pointer` | Row interaction |
| `text-green-600` on ticket-created link | Status affordance |
| `text-primary` on create-ticket button | Action emphasis |
| `EmailStatusLifecycle` internal styles | Domain sub-component |

---

## Remaining Custom Table Implementations

Places still using inline table shells instead of `DataTableShell` + domain table:

| Location | Pattern | Notes |
|----------|---------|-------|
| `Users.tsx` | `rounded-xl border bg-card overflow-hidden` | Full custom table |
| `TenantView.tsx` (users tab) | `rounded-xl border bg-card overflow-hidden` | Inline `Table` markup |
| `Dashboard.tsx` | Custom `dashboard-tickets-card` + `TicketsTable compact` | Compact embed; loading/empty gap |
| `ClientDashboard.tsx` | `ClientTicketsTable` local component | Client portal; separate from domain tables |
| `SLAMonitor.tsx` | `DataTableShell` + inline `Table` | Migrated to shell; not a domain table component |
| `AuditLogs.tsx` | Inline table in page | Custom implementation |
| `SuperAdminOrgView.tsx` | Inline table | Custom implementation |
| `ComplaintPointTable` | Domain table (if present) | Per domain audit — not yet migrated |

**EmailsTable consumers:** `RawEmails.tsx` only — fully migrated.

---

## Readiness for TicketNumberDisplay Migration

**Ready to proceed.** EmailsTable Phase B does not block `TicketNumberDisplay` tokenization.

| Prerequisite | Status |
|--------------|--------|
| Domain table shell extraction complete | TicketsTable ✅ EmailsTable ✅ |
| `DataTableShell` pattern stable | ✅ |
| `TicketNumberDisplay` already in `@/components/common` | ✅ |
| Prefix still uses `text-[10px]` hardcoded | ⚠️ Next migration target |

### TicketNumberDisplay call sites (for next phase)

| File | Usage |
|------|-------|
| `TicketsTable.tsx` | Full + compact rows |
| `TicketDetail.tsx` | Header display |
| `SLAMonitor.tsx` | SLA table column |
| `AuditLogs.tsx` | Entity reference |
| `ClientDashboard.tsx` | Ticket list + detail |
| `ClientTicketDetail.tsx` | Header |
| `SuperAdminOrgView.tsx` | Ticket column |
| `BulkGroupAssignModal.tsx` | Selection list |
| `FEAssignmentModal.tsx` | Assignment preview |
| `AssignmentConfirmDialog.tsx` | Confirm dialog |
| `CloseTicketDialog.tsx` | Close dialog |

### Recommended next step

1. Add `variant` / token props to `TicketNumberDisplay` (replace `text-[10px]` prefix with `typography.meta` or dedicated token).
2. Update `TicketsTable` callers first (highest visibility).
3. No changes required to `EmailsTable` — it does not use `TicketNumberDisplay`.

---

## Phase Summary

| Phase | Component | Consumer | Status |
|-------|-----------|----------|--------|
| A Part 1 | `TicketsTable` refactor | — | Done |
| A Part 2 | — | 4 ticket pages | Done |
| B | `EmailsTable` refactor | `RawEmails.tsx` | **Done** |
| C (proposed) | `TicketNumberDisplay` tokenization | 10+ call sites | Pending |
| D (proposed) | `Dashboard.tsx` compact loading/empty | 1 page | Pending |

---

*Build verified: `npm run build` passes after Phase B.*
