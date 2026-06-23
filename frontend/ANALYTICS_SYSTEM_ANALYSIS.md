# Analytics System Analysis (Phase 1 — No Code)

**Scope:** field-ops-assist frontend only. Read-only analysis of Analytics, SLA Monitor, Audit Logs, and related hooks. No code changes.

---

## 1. Page-by-page analysis

### 1.1 Analytics (`src/pages/Analytics.tsx`)

**Query key:** `['analytics-data']` (single inline `useQuery`; no shared hook).

**Queries run (inside one `queryFn`):**

| # | Table               | Select      | Order / filter                         |
|---|---------------------|------------|----------------------------------------|
| 1 | `tickets`           | `*`        | `created_at` descending                |
| 2 | `sla_tracking`      | `*`        | none                                   |
| 3 | `field_executives`  | `*`        | none                                   |
| 4 | `ticket_assignments`| `*`        | none                                   |

**Tables depended on:** `tickets`, `sla_tracking`, `field_executives`, `ticket_assignments`.

**Filters:** None at the DB layer. All data is fetched; aggregation and slicing are done in memory (e.g. top 6 categories, top 8 locations, last 7 days volume).

**Read/write:** Read-only. No `insert`, `update`, `delete`, or `useMutation`. Only reads and in-memory derivation.

---

### 1.2 SLA Monitor (`src/pages/SLAMonitor.tsx`)

**Query key:** `['sla-tracking-with-tickets']` (single inline `useQuery`; no shared hook).

**Queries run (inside one `queryFn`):**

| # | Table          | Select | Order / filter |
|---|----------------|--------|-----------------|
| 1 | `sla_tracking` | `*`    | `created_at` descending |
| 2 | `tickets`      | `*`    | `.in('id', ticketIds)` where `ticketIds` come from step 1 |

**Tables depended on:** `sla_tracking`, `tickets`.

**Filters:**

- **DB:** None beyond the ticket id list from SLA records.
- **Client:** `filter` state `'all' | 'at-risk' | 'breached'` filters the combined SLA+ticket list using `getSLAStatus()` (deadline/breach/ticket status).

**Read/write:** Read-only. No mutations. Only reads and client-side filtering/display.

---

### 1.3 Audit Logs (`src/pages/AuditLogs.tsx`)

**Query key:** `['audit-logs']` (single inline `useQuery`; no shared hook).

**Queries run:**

| # | Table        | Select | Order / limit                    |
|---|-------------|--------|----------------------------------|
| 1 | `audit_logs`| `*`    | `created_at` descending, limit 200 |

**Tables depended on:** `audit_logs` only.

**Filters:**

- **DB:** None (except fixed limit 200).
- **Client:** `search` (text across action, entity_type, entity_id, metadata), `entityFilter`, `actionFilter` (from unique values in loaded logs).

**Read/write:** Read-only. No mutations. Only reads and client-side filtering.

---

### 1.4 Dashboard (`src/pages/Dashboard.tsx`)

**Hooks used:** `useDashboardStats()`, `useTickets({ status: 'all' })`.

**Queries (via hooks):** See sections 2.1 and 2.2 below.

**Tables depended on:** `tickets`, `sla_tracking` (via useDashboardStats); `tickets` again (via useTickets).

**Read/write:** Read-only on this page. No mutations in Dashboard.tsx; it only consumes stats and recent tickets for display.

---

## 2. Shared hooks

### 2.1 `useDashboardStats` (`src/hooks/useDashboardStats.tsx`)

**Query key:** `['dashboard-stats']`.

**Queries:**

| Table          | Select                                                                 | Purpose |
|----------------|------------------------------------------------------------------------|---------|
| `tickets`      | `status, confidence_score, needs_review, created_at`                  | Counts and averages |
| `sla_tracking` | `assignment_breached, onsite_breached, resolution_breached`           | SLA breach count |

**Filters:** None (full table reads; aggregation in JS).

**Used by:** **Dashboard only** (`src/pages/Dashboard.tsx`).

**Mutates:** No. Read-only.

---

### 2.2 `useTickets` (`src/hooks/useTickets.tsx`)

**Query key:** `["tickets", filters]`.

**Query:** `tickets` with `select("*")`, optional filters: `status`, `needs_review`, `confidenceRange`, `search` (ticket_number / complaint_id / vehicle_number), `unassignedOnly` (current_assignment_id null).

**Used by:**

- **Dashboard** — `useTickets({ status: 'all' })` (recent tickets list)
- **TicketsList** — `useTickets(filters)` (main ticket list with filters)
- **ReviewQueue** — `useTickets({ needsReview: true, status: 'OPEN', unassignedOnly: true })`

**Also in same file:** `useTicket`, `useTicketComments`, `useTicketAssignments`, `useUpdateTicket`, `useUpdateTicketStatus`, `useAssignTicket`, `useAddComment`. Those are used by TicketDetail, FE flows, etc., and can mutate data. The **list query** `useTickets(filters)` itself is read-only.

**Mutates:** The hook file exports mutations, but the **query** used for listing tickets does not mutate. Analytics / SLA Monitor / Audit Logs do not use this hook.

---

## 3. Do Analytics, SLA Monitor, and Audit Logs share hooks?

**No.**

| Page         | Hook(s) used                    | Query key(s)                  |
|-------------|----------------------------------|-------------------------------|
| Analytics   | None (inline `useQuery`)         | `['analytics-data']`          |
| SLAMonitor  | None (inline `useQuery`)         | `['sla-tracking-with-tickets']` |
| AuditLogs   | None (inline `useQuery`)         | `['audit-logs']`              |
| Dashboard   | `useDashboardStats`, `useTickets`| `['dashboard-stats']`, `['tickets', filters]` |

- **Analytics** uses only its own `useQuery` with key `['analytics-data']`.
- **SLA Monitor** uses only its own `useQuery` with key `['sla-tracking-with-tickets']`.
- **Audit Logs** uses only its own `useQuery` with key `['audit-logs']`.

None of these three pages import or use `useDashboardStats` or `useTickets`.

---

## 4. Would changing a shared hook affect these pages?

**useDashboardStats**

- **Used by:** Dashboard only.
- **Effect of changes:** Only Dashboard is affected. Analytics, SLA Monitor, and Audit Logs do not use it, so they are unaffected.

**useTickets**

- **Used by:** Dashboard, TicketsList, ReviewQueue (and other components use `useTicket` / mutations from the same file).
- **Effect of changes:** Changing the **list query** in `useTickets` would affect Dashboard (recent tickets), TicketsList, and ReviewQueue. It would **not** affect Analytics, SLA Monitor, or Audit Logs, because they do not call `useTickets`.

**Conclusion:** Modifying shared hooks does **not** affect Analytics, SLA Monitor, or Audit Logs. Only Dashboard (and ticket list/review flows) use those hooks.

---

## 5. Confirmations

### 5.1 Analytics is read-only

- **Yes.** Single `useQuery`; queryFn only calls `supabase.from(...).select(...)`. No `insert`, `update`, `delete`, or `useMutation`. All logic is read + in-memory aggregation and chart data shaping.

### 5.2 SLA Monitor is read-only

- **Yes.** Single `useQuery`; queryFn only fetches from `sla_tracking` and `tickets`. No writes, no mutations. Filtering is client-side only.

### 5.3 Audit Logs is read-only

- **Yes.** Single `useQuery`; queryFn only fetches from `audit_logs`. No writes, no mutations. Filtering is client-side only.

### 5.4 None of these pages modify ticket lifecycle

- **Yes.** None of them call:
  - `useUpdateTicketStatus`, `useUpdateTicket`, `useAssignTicket`, `useAddComment`, or
  - Direct `supabase.from('tickets').update(...)` / `insert` / `delete`.

Ticket lifecycle changes happen in TicketDetail, FEMyTickets, FEActionPage, and related components, not in Analytics, SLAMonitor, or AuditLogs.

### 5.5 None of these pages affect worker logic

- **Yes.** Worker and email ingestion run in the backend (Pariskq-CRM-Backend). These frontend pages only query Supabase. They do not call any backend worker endpoints or alter data that the worker reads/writes. No impact on worker or email ingestion.

---

## 6. Summary table

| Page        | Query key                    | Tables used                          | Uses useDashboardStats? | Uses useTickets? | Read-only? | Affects lifecycle? | Affects worker? |
|------------|------------------------------|--------------------------------------|-------------------------|------------------|------------|---------------------|------------------|
| Analytics  | `analytics-data`             | tickets, sla_tracking, field_executives, ticket_assignments | No | No | Yes | No | No |
| SLAMonitor | `sla-tracking-with-tickets`  | sla_tracking, tickets                | No | No | Yes | No | No |
| AuditLogs  | `audit-logs`                 | audit_logs                            | No | No | Yes | No | No |
| Dashboard  | `dashboard-stats`, `tickets` | tickets, sla_tracking                 | Yes | Yes | Yes (on this page) | No | No |

---

**End of Phase 1 analysis. No code was written or modified.**
