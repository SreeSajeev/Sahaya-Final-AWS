# SLA Monitor & Audit Logs — Full System Analysis

**Scope:** Frontend only. No code changes. Facts derived from the codebase under `field-ops-assist/src`.

---

## A. File map: Page → hooks → tables → read/write

### SLA Monitor

| Item | Value |
|------|--------|
| **File** | `src/pages/SLAMonitor.tsx` |
| **Hooks used** | `useQuery` (from `@tanstack/react-query`) only. No shared hooks (`useTickets`, `useDashboardStats`, etc.). |
| **Query key** | `['sla-tracking-with-tickets']` |
| **Supabase queries** | 1) `sla_tracking` — `.select('*').order('created_at', { ascending: false })`. 2) `tickets` — `.select('*').in('id', ticketIds)` (ids from sla_tracking). |
| **Read/Write** | Read-only. No `.insert`, `.update`, `.delete`, `.upsert` in this file. |

### Audit Logs

| Item | Value |
|------|--------|
| **File** | `src/pages/AuditLogs.tsx` |
| **Hooks used** | `useQuery` (from `@tanstack/react-query`) only. No shared hooks. |
| **Query key** | `['audit-logs']` |
| **Supabase queries** | `audit_logs` — `.select('*').order('created_at', { ascending: false }).limit(200)`. |
| **Read/Write** | Read-only. No mutations in this file. |

### Other pages (for dependency graph and lifecycle)

| Page | Hooks used | Tables queried (via hook or inline) | Read/Write |
|------|------------|--------------------------------------|------------|
| **Dashboard** | `useDashboardStats`, `useTickets({ status: 'all' })` | `tickets` (both hooks), `sla_tracking` (useDashboardStats) | Read-only (page does not mutate) |
| **TicketsList** | `useTickets(filters)` | `tickets` | Read-only; modal `CreateTicketModal` mutates |
| **ReviewQueue** | `useTickets({ needsReview: true, status: 'OPEN', unassignedOnly: true })` | `tickets` | Read-only |
| **TicketDetail** | `useTicket`, `useTicketComments`, `useTicketAssignments`, `useUpdateTicketStatus`, `useUpdateTicket` | `tickets`, `ticket_comments`, `ticket_assignments` (reads); tickets + audit_logs (writes via hooks) | Mutates (status, ticket fields) |
| **FETicketView** | `useTicket`, `useTicketComments` | `tickets`, `ticket_comments` | Read-only |
| **FieldExecutives** | `useFieldExecutivesWithStats` | `field_executives`, `ticket_assignments` (with tickets relation) | Read-only; `CreateFEModal` mutates |
| **RawEmails** | `useRawEmails` | `raw_emails`, `parsed_emails` | Read-only |
| **Users** | Inline `useQuery` | `users` | Read-only |
| **Settings** | Inline `useQuery` | `configurations` | Read-only |
| **Analytics** | Inline `useQuery` | `tickets`, `sla_tracking`, `field_executives`, `ticket_assignments` | Read-only |
| **FEMyTickets** | `useQuery` (fe-my-tickets), `useQuery` (fe-active-tokens), `useMutation` (updateStatus) | `field_executives`, `ticket_assignments` (with ticket), `fe_action_tokens`; mutation: `tickets` update, `audit_logs` insert | Mutates (ticket status + audit_logs) |
| **FEActionPage** | None (useEffect + direct supabase) | `fe_action_tokens`, `tickets` (read); writes: `ticket_comments`, `tickets`, `fe_action_tokens` | Mutates (comments, status, token) |

---

## B. Lifecycle impact analysis

### Pages that mutate tickets

- **TicketDetail:** `useUpdateTicketStatus`, `useUpdateTicket` — updates `tickets`; `useUpdateTicketStatus` also inserts into `audit_logs`.
- **FEAssignmentModal** (used from TicketDetail): `useAssignTicket` — inserts `ticket_assignments`, updates `tickets`, inserts `audit_logs`.
- **CreateTicketModal** (used from TicketsList): direct Supabase — inserts `tickets`, `ticket_comments`, `audit_logs`.
- **FEMyTickets:** `useMutation` (updateStatus) — updates `tickets`, inserts `audit_logs`.
- **FEActionPage:** direct Supabase — updates `tickets`, inserts `ticket_comments`, updates `fe_action_tokens`.

### Pages that mutate assignments

- **FEAssignmentModal:** `useAssignTicket` — inserts `ticket_assignments`, updates `tickets`, inserts `audit_logs`.

### Pages that mutate comments

- **CreateTicketModal:** direct insert into `ticket_comments`.
- **FEActionPage:** direct insert into `ticket_comments`.

### Pages that mutate SLA tracking

- **None.** No frontend file performs `.insert`, `.update`, or `.delete` on `sla_tracking`.

### Pages that mutate audit logs

- **CreateTicketModal:** direct insert into `audit_logs`.
- **CreateFEModal:** direct insert into `audit_logs`.
- **FEMyTickets:** insert into `audit_logs` inside updateStatus mutation.
- **useTickets (useUpdateTicketStatus):** insert into `audit_logs`.
- **useTickets (useAssignTicket):** insert into `audit_logs`.

### SLA Monitor and Audit Logs: mutation summary

- **SLA Monitor:** Does not mutate any table. Read-only.
- **Audit Logs:** Does not mutate any table. Read-only.

---

## C. Dependency graph

### Shared hooks and consumers

| Hook | Defined in | Used by |
|------|------------|---------|
| **useTickets** | `hooks/useTickets.tsx` | Dashboard, TicketsList, ReviewQueue |
| **useTicket** | `hooks/useTickets.tsx` | TicketDetail, FETicketView |
| **useTicketComments** | `hooks/useTickets.tsx` | TicketDetail, FETicketView |
| **useTicketAssignments** | `hooks/useTickets.tsx` | TicketDetail |
| **useUpdateTicket** | `hooks/useTickets.tsx` | TicketDetail |
| **useUpdateTicketStatus** | `hooks/useTickets.tsx` | TicketDetail |
| **useAssignTicket** | `hooks/useTickets.tsx` | FEAssignmentModal only |
| **useAddComment** | `hooks/useTickets.tsx` | Not used by any page or component |
| **useDashboardStats** | `hooks/useDashboardStats.tsx` | Dashboard only |
| **useFieldExecutivesWithStats** | `hooks/useFieldExecutives.tsx` | FieldExecutives only |
| **useRawEmails** | `hooks/useRawEmails.tsx` | RawEmails only |

SLA Monitor and Audit Logs do not use any of the above hooks. They use only inline `useQuery` in their page file.

### Query keys

| Query key | Used by | Invalidation (who triggers) |
|-----------|---------|-----------------------------|
| `['tickets', filters]` | useTickets | useUpdateTicket, useUpdateTicketStatus, useAssignTicket, CreateTicketModal |
| `['ticket', ticketId]` | useTicket | useUpdateTicket |
| `['ticket-comments', ticketId]` | useTicketComments | useAddComment (hook not used) |
| `['ticket-assignments', ticketId]` | useTicketAssignments | useAssignTicket |
| `['dashboard-stats']` | useDashboardStats | CreateTicketModal |
| `['sla-tracking-with-tickets']` | SLAMonitor only | Nothing (no invalidation in codebase) |
| `['audit-logs']` | AuditLogs only | Nothing (no invalidation in codebase) |
| `['analytics-data', ...]` | Analytics only | Nothing |
| `['field-executives']` / `['field-executives-with-stats']` | useFieldExecutives / useFieldExecutivesWithStats | CreateFEModal |
| `['fe-my-tickets', ...]` | FEMyTickets | FEMyTickets updateStatus mutation |

**Overlap:** No query key is shared between SLA Monitor and any other page. No query key is shared between Audit Logs and any other page.

### Tables read in multiple places

| Table | Read by (page or hook) |
|-------|-------------------------|
| **tickets** | useTickets (Dashboard, TicketsList, ReviewQueue), useTicket (TicketDetail, FETicketView), SLAMonitor (inline), Analytics (inline), FEMyTickets (via assignment relation), useDashboardStats (status, confidence_score, needs_review, created_at) |
| **sla_tracking** | useDashboardStats, SLAMonitor (inline), Analytics (inline) |
| **audit_logs** | AuditLogs (inline) only for read. Written by CreateTicketModal, useUpdateTicketStatus, useAssignTicket, CreateFEModal, FEMyTickets |
| **ticket_assignments** | useTicketAssignments (TicketDetail), useFieldExecutivesWithStats, Analytics (inline), FEMyTickets |
| **field_executives** | useFieldExecutives / useFieldExecutive / useFieldExecutivesWithStats (FieldExecutives), Analytics (inline), FEMyTickets |

---

## D. Risk assessment

### If SLA Monitor is modified

- **Query key `['sla-tracking-with-tickets']`** is used only in SLAMonitor. No other file invalidates it or uses the same key.
- **Tables:** `sla_tracking` and `tickets` are also read by `useDashboardStats` (sla_tracking + tickets) and Analytics (both). Changing how SLAMonitor queries these tables does not affect those hooks or Analytics, because they use different query keys and their own queries.
- **Risk:** Limited to the SLA Monitor page and its UX/data shape. Dashboard’s SLA breach count and Analytics remain independent. No shared hooks are involved.

### If Audit Logs is modified

- **Query key `['audit-logs']`** is used only in AuditLogs. No other file invalidates it or uses the same key.
- **Table:** `audit_logs` is read only on the Audit Logs page. Other code only writes to `audit_logs` (CreateTicketModal, CreateFEModal, useUpdateTicketStatus, useAssignTicket, FEMyTickets). Changing how Audit Logs reads or displays data does not affect those writers.
- **Risk:** Limited to the Audit Logs page. No shared hooks; no other reader of this query key.

---

## E. Implementation constraints

### Must remain untouched (for safe changes to SLA Monitor / Audit Logs only)

- **Shared hooks:** `useTickets`, `useDashboardStats`, `useFieldExecutives`, `useRawEmails`, `useFEMyTickets`, `useFETokenForTicket`, `useFETokenAccess`, `useAuth`. SLA Monitor and Audit Logs do not use them; modifying these hooks would affect Dashboard, TicketsList, ReviewQueue, TicketDetail, FieldExecutives, RawEmails, etc.
- **Schema / backend:** No assumptions; no backend or schema changes in scope.
- **Lifecycle / worker logic:** No changes to ticket lifecycle, assignment flow, or worker logic.
- **Mutation behavior:** All existing writers of `audit_logs` and all ticket/assignment/comment mutations remain as-is.

### Safe to modify (when changing only SLA Monitor or Audit Logs)

- **`src/pages/SLAMonitor.tsx`:** Query key, queryFn, UI, filters, refetch interval — without changing shared hooks or other pages.
- **`src/pages/AuditLogs.tsx`:** Query key, queryFn, UI, filters — without changing shared hooks or other pages.

### New hooks vs inline useQuery

- **SLA Monitor and Audit Logs currently use inline `useQuery`** in the page file. Their query keys are not shared.
- **Adding new shared hooks** for SLA or audit data would introduce shared query keys and potential invalidation/refetch coupling with other features. Keeping **inline `useQuery`** in each page is safer if the goal is to keep SLA Monitor and Audit Logs isolated and avoid impacting Dashboard, Analytics, or mutation flows.
- **Conclusion:** For isolated changes to SLA Monitor or Audit Logs, continuing with inline `useQuery` in the page is the safer option; no new shared hooks are required.
