# TicketsTable Final Audit

> **Date:** 2026-06-11  
> **Scope:** All `<TicketsTable` JSX usages in `field-ops-assist/src`  
> **Method:** Static code review (read-only)  
> **Related:** [tickets-table-phase-a-complete.md](./tickets-table-phase-a-complete.md)

Search pattern: `<TicketsTable`  
**Result:** 5 page-level usages (+ 1 JSDoc example in `DataTableShell.tsx`, not a runtime consumer)

---

## Summary Matrix

| # | File | `DataTableShell` | Loading owned by parent | Empty owned by parent | Pagination | Compact |
|---|------|------------------|---------------------------|------------------------|------------|---------|
| 1 | `TicketsList.tsx` | Yes | Yes | Yes | Yes | No |
| 2 | `ReviewQueue.tsx` | Yes | Yes | Yes | N/A | No |
| 3 | `TenantAdminDashboard.tsx` | Yes | Yes | Yes | N/A | No |
| 4 | `TenantView.tsx` | Yes | Yes | Yes | N/A | No |
| 5 | `Dashboard.tsx` | **No** | **No** | **No** | N/A (slice only) | **Yes** |

**Pass rate (full-table pattern):** 4 / 4  
**Outstanding TicketsTable follow-up:** 1 (`Dashboard.tsx` compact embed)

---

## Per-Usage Report

### 1. `src/pages/TicketsList.tsx`

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Wrapped by `DataTableShell` | **Yes** | `DataTableShell` wraps conditional `TicketsTable` render |
| Loading owned by parent | **Yes** | `loading={isLoading}`, `loadingLabel={TICKETS_TABLE_LOADING_LABEL}` on shell; `TicketsTable` not rendered while loading |
| Empty owned by parent | **Yes** | `emptyState={<TicketsTableEmptyState filterEmpty={hasActiveFilters} />}` when `!isLoading && total === 0` |
| Pagination working | **Yes** | Client-side: `PAGE_SIZE = 25`, `paginatedTickets` passed to table; prev/next controls below shell gated on `!isLoading && total > PAGE_SIZE` |
| Compact mode | **No** | Full table with bulk selection props |

**Notes:** Filtering, sorting, date range, bulk assign, and `rowExtra` supplement unchanged. Deprecated `loading` / `filterEmpty` props not passed to `TicketsTable`.

---

### 2. `src/pages/ReviewQueue.tsx`

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Wrapped by `DataTableShell` | **Yes** | Direct shell wrapper |
| Loading owned by parent | **Yes** | `loading={isLoading}` + `TICKETS_TABLE_LOADING_LABEL` on shell |
| Empty owned by parent | **Yes** | `TicketsTableEmptyState` when `!isLoading && displayTickets.length === 0` |
| Pagination working | **N/A** | Full result set from `useTickets({ status: 'NEEDS_REVIEW' })`; no pagination UI (pre-existing behaviour) |
| Compact mode | **No** | Full table |

**Notes:** Wave 2 transparent shell hack (`border-0 bg-transparent shadow-none`) removed. Shell is the sole chrome owner.

---

### 3. `src/pages/TenantAdminDashboard.tsx`

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Wrapped by `DataTableShell` | **Yes** | Inside Tickets `Card` → `CardContent className="p-0"` |
| Loading owned by parent | **Yes** | `loading={ticketsLoading}` on shell |
| Empty owned by parent | **Yes** | `TicketsTableEmptyState` when `!ticketsLoading && tickets.length === 0` |
| Pagination working | **N/A** | All tenant tickets rendered; no pagination UI (pre-existing behaviour) |
| Compact mode | **No** | Full table |

**Notes:** Shell uses `className="rounded-none border-0 shadow-none"` to avoid double border with parent `Card`. Loading/empty logic is correct; visual nesting is a cosmetic follow-up only.

---

### 4. `src/pages/TenantView.tsx`

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Wrapped by `DataTableShell` | **Yes** | On tickets `TabsContent` |
| Loading owned by parent | **Yes** | `loading={ticketsLoading}` on shell |
| Empty owned by parent | **Yes** | `TicketsTableEmptyState` with `filterEmpty={tenantTickets.length > 0 && clientFilter !== null}` |
| Pagination working | **N/A** | Client-slug filter only (`filteredTickets`); no page controls (pre-existing behaviour) |
| Compact mode | **No** | Full table |

**Notes:** Tickets error banner above shell unchanged. Users tab still uses a separate custom `rounded-xl border bg-card` table shell (unrelated to `TicketsTable`).

---

### 5. `src/pages/Dashboard.tsx` ⚠️

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Wrapped by `DataTableShell` | **No** | Embedded in custom `dashboard-tickets-card` with `bg-card p-6` wrapper |
| Loading owned by parent | **No** | `loading={ticketsLoading}` still passed to `TicketsTable`; component returns `null` when loading — parent shows blank padded area |
| Empty owned by parent | **No** | No shell `emptyState`; when slice is empty, `TicketsTable` returns `null` — parent shows blank padded area |
| Pagination working | **N/A** | Hard-coded `slice(0, 8)` for “Recent Tickets”; no pagination controls (by design) |
| Compact mode | **Yes** | `compact` prop set |

**Notes:** Intentionally deferred in Phase A Part 2. Compact path still uses deprecated in-component `loading` guard (`TicketsTable.tsx` lines 112–114). This is the **only failing consumer** for loading/empty ownership. Does not block EmailsTable migration (EmailsTable has no compact embed).

---

## Non-Consumers (excluded from audit)

| Location | Reason |
|----------|--------|
| `src/components/common/DataTableShell.tsx` | JSDoc `@example` only |
| `src/pages/ClientDashboard.tsx` | Uses local `ClientTicketsTable` component, not `TicketsTable` |

---

## Component Behaviour Reference

`TicketsTable` returns `null` when `loading === true` or `tickets.length === 0` (all modes including `compact`). Parents **must** own loading and empty UI via `DataTableShell` (full table) or equivalent parent markup (compact embed).

```112:114:field-ops-assist/src/components/tickets/TicketsTable.tsx
  if (loading || tickets.length === 0) {
    return null;
  }
```

---

## EmailsTable Migration Readiness

| Prerequisite | Status |
|--------------|--------|
| Full-table shell pattern proven | **Yes** — 4 pages |
| Shared exports (`LOADING_LABEL`, `EmptyState`) | **Yes** — `TICKETS_TABLE_LOADING_LABEL`, `TicketsTableEmptyState` |
| Transparent shell hack removed (reference) | **Yes** — `ReviewQueue.tsx` clean; `RawEmails.tsx` still has hack (EmailsTable Part 3 target) |
| Compact embed pattern migrated | **No** — `Dashboard.tsx` only; not applicable to `EmailsTable` |

`EmailsTable` has a single consumer (`RawEmails.tsx`) and no `compact` mode. The migration path mirrors Part 1 + Part 2 of TicketsTable:

1. Strip shell/loading/empty from `EmailsTable.tsx`
2. Wire `RawEmails.tsx` shell with `loading` / `emptyState` (remove transparent hack)

---

## Recommended Follow-Ups (non-blocking for EmailsTable)

| Priority | Item | File |
|----------|------|------|
| P2 | Add parent-owned loading/empty for compact embed (shell or inline status) | `Dashboard.tsx` |
| P3 | Flatten nested Card + shell double-chrome | `TenantAdminDashboard.tsx` |
| — | EmailsTable Part 3 | `EmailsTable.tsx`, `RawEmails.tsx` |

---

## Final Verdict

### **SAFE FOR EMAILSTABLE MIGRATION**

All four **full-table** `TicketsTable` consumers pass the Phase A contract (shell wrapper, parent-owned loading, parent-owned empty). The canonical pattern is production-ready and directly reusable for `EmailsTable` + `RawEmails.tsx`.

One outstanding `TicketsTable` item remains (`Dashboard.tsx` compact embed) but it is **out of scope for EmailsTable** and does not invalidate the migration template.
