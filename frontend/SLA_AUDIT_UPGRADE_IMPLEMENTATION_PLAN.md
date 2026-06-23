# SLA Monitor & Audit Logs — Implementation Plan

**Source of truth:** `SLA_AUDIT_SYSTEM_ANALYSIS.md` only. No codebase re-scan. No schema assumptions. No shared hooks, lifecycle, or backend changes.

**Scope:** Frontend-only, read-only upgrades to `src/pages/SLAMonitor.tsx` and `src/pages/AuditLogs.tsx`. No impact on Dashboard, Analytics, TicketsList, shared hooks, or mutation flows.

---

## PART 1 — SLA MONITOR UPGRADE PLAN

### Current state (from system analysis)

- **File:** `src/pages/SLAMonitor.tsx`
- **Query key:** `['sla-tracking-with-tickets']` (isolated; no other consumer)
- **Queries:** (1) `sla_tracking` — `.select('*').order('created_at', { ascending: false })`. (2) `tickets` — `.select('*').in('id', ticketIds)`.
- **Read/Write:** Read-only. No shared hooks used.

All enhancements below are client-side only, using the data already returned by this page’s query (or one additional read scoped to this page only, where noted). No new tables or columns are assumed beyond what the current `select('*')` returns.

---

#### A. Enhanced SLA metrics (client-side only)

1. **Overdue SLA count**  
   - Derive from existing breach flags and deadline columns already used on the page (e.g. assignment_breached, onsite_breached, resolution_breached and corresponding deadline fields).  
   - Count rows where at least one of the three breach flags is true (or deadline is past and not breached yet, if that logic exists).  
   - Compute once per query result; do not depend on schema beyond current response shape.

2. **Breach trend (last 7 days)**  
   - Use a date column that exists on the fetched data (e.g. `created_at` on `sla_tracking` or `tickets` — whichever is used for “when” the SLA record applies). If both exist, choose one consistently.  
   - Client-side: group by day for the last 7 days, count breached records per day.  
   - No new API or schema; only use columns already present in the current query result.

3. **SLA breach by FE**  
   - Current page only loads `sla_tracking` and `tickets`. FE is not in those tables.  
   - **Option A (no extra read):** Omit “by FE” or show only “by ticket” until data allows.  
   - **Option B (single extra read in this page only):** In the same `queryFn`, after fetching `sla_tracking` and `tickets`, perform one additional read from `ticket_assignments` (and if needed `field_executives`) scoped to the same `ticket_id` set, only inside SLAMonitor. Use it to map ticket_id → FE name/id, then aggregate breach counts by FE. Same query key, e.g. `['sla-tracking-with-tickets', ...filterParams]`; no shared hook.  
   - Do not create a shared hook or touch `useDashboardStats` / `useTickets` / `useFieldExecutives`.

4. **SLA breach by category**  
   - Only if the current `tickets` `select('*')` response includes a category-like field (e.g. `category`). If it does, group breached SLA rows by that field (via joined ticket). If not present in the response, skip or label as “N/A” until the API returns it.  
   - No schema assumption; use only fields present in the current payload.

5. **SLA breach by priority**  
   - Only if the current `tickets` response includes a priority-like field (e.g. `priority`). If it does, group breached SLA rows by that field. If not present, skip or “N/A”.  
   - No schema assumption.

---

#### B. Filtering strategy

1. **Status filter (e.g. OPEN, RESOLVED)**  
   - Apply client-side to the joined `ticket.status` (already available in the page’s combined data).  
   - State: e.g. `statusFilter: 'all' | 'OPEN' | 'RESOLVED'` (or whatever status values exist in the data).  
   - Include in query key so the page can refetch when filter changes if you ever move filtering server-side later; for client-side-only, query key can stay `['sla-tracking-with-tickets']` or add filter for consistency (e.g. `['sla-tracking-with-tickets', statusFilter, ...]`).  
   - Default: “all” (current behavior).

2. **Breach type filter (assignment, onsite, resolution)**  
   - Client-side filter on the three breach flags already used on the page.  
   - State: e.g. `breachTypeFilter: 'all' | 'assignment' | 'onsite' | 'resolution'`.  
   - When not “all”, show only rows where the selected breach type is true.  
   - Safe: no new columns; use existing breach flags.

3. **FE filter**  
   - Only if “SLA breach by FE” is implemented (Option B above). Populate dropdown from the FE list derived in this page. Filter rows to those whose ticket maps to the selected FE.  
   - If Option A (no FE data): omit FE filter.

4. **Date range filter (existing columns only)**  
   - Use only a date/timestamp column that already exists on the data (e.g. `created_at` on `sla_tracking` or on `tickets`).  
   - **Client-side:** Filter the combined list by that column within [startDate, endDate].  
   - **Safe handling of missing dates:** If the chosen column is null/undefined for a row, either exclude the row from the date filter (treat as “no date”) or include it based on a written rule (e.g. “include if no date when filter is applied”). Do not assume column name beyond what is in the current response.  
   - If neither table’s response has a usable date field, document “date filter N/A until API provides one” and do not add a filter that would break.

5. **Query key and refetch**  
   - Extend query key only within this page, e.g. `['sla-tracking-with-tickets', statusFilter, breachTypeFilter, feFilter, startDate, endDate]`.  
   - If all filtering is client-side, the queryFn can ignore these and still fetch the same scope; key is for cache separation and optional future server-side use.  
   - No other page or hook may use this key.

---

#### C. Performance strategy

1. **Avoid N² filtering**  
   - Single pass over the combined SLA+ticket list to apply status, breach type, FE, and date filters.  
   - Build any “by FE” / “by category” / “by priority” aggregates in the same pass (e.g. one loop that both filters and increments counts).

2. **Avoid re-computation on every render**  
   - Derive filtered list and aggregates from `slaData` (query result) and filter state in `useMemo`.  
   - Dependencies: `slaData`, `statusFilter`, `breachTypeFilter`, `feFilter`, `startDate`, `endDate`.  
   - Keep the existing status/breach logic (e.g. getSLAStatus) pure; call from inside the memo.

3. **Memoization approach**  
   - One `useMemo` for “filtered rows” (and optionally “stats”): input = raw data + filter state; output = array for table + object for metric cards (overdue count, breach trend array, by FE, by category, by priority).  
   - If breach trend is expensive, a second `useMemo` with dependency on filtered or raw data + 7-day window.

4. **Query key strategy**  
   - Keep base key `['sla-tracking-with-tickets']`.  
   - Append only filter state that this page owns (e.g. status, breach type, FE, date range) so cache entries do not collide with other pages (none use this key).  
   - Do not introduce a key that could be reused by Dashboard, Analytics, or any shared hook.

---

#### D. UI enhancements

1. **Metric cards**  
   - Add cards above the table: Overdue SLA count, breach trend summary (e.g. “X in last 7 days”), and if implemented: breach by FE (e.g. top FE by breach count), by category, by priority.  
   - All values from the memoized stats object (no extra fetch).

2. **Charts**  
   - Use only existing chart dependencies already used elsewhere in the app (e.g. Recharts in Analytics). No new dependencies.  
   - One chart: breach trend (last 7 days) — e.g. bar or line of count per day.  
   - Optional: small “by category” or “by priority” bars if data supports it.  
   - Data source: same memoized stats.

3. **Export option**  
   - Client-side export of the **currently filtered** list (same data as the table).  
   - Format: CSV (or similar) via Blob + URL.createObjectURL + temporary link; no new libraries.  
   - Columns: only those already displayed or in the current data shape (no assumed schema).  
   - File name: e.g. `sla-monitor-export-{date}.csv`.

4. **Pagination**  
   - If filtered list length exceeds a chosen client-side page size (e.g. 50), paginate in the UI only (slice the filtered array).  
   - No change to Supabase query; still fetch the same scope as today.  
   - Optional: “Load more” or page size selector; state local to the page.

---

#### E. Risk assessment (SLA Monitor)

1. **What could accidentally break?**  
   - **Other pages:** Only if this page’s query key or table usage is shared. Per analysis, key `['sla-tracking-with-tickets']` is SLAMonitor-only; Dashboard uses `useDashboardStats` (key `['dashboard-stats']`); Analytics uses `['analytics-data', ...]`. So no overlap.  
   - **Risk:** Typos or copy-paste that introduce `['dashboard-stats']` or `['tickets']` or `['analytics-data']` into this page (e.g. in invalidateQueries). Mitigation: do not call `invalidateQueries` for any key other than `['sla-tracking-with-tickets']` (and its extended form). This page does not mutate, so invalidation is only for refetch button if desired.  
   - **Data shape:** If code assumes a column that does not exist (e.g. priority, category), runtime errors or wrong totals. Mitigation: guard all “by category” / “by priority” / “by FE” logic with presence checks on the current response (e.g. only group if field exists).

2. **Guarantee zero impact on other pages**  
   - Modify only `src/pages/SLAMonitor.tsx`.  
   - Do not import or call `useDashboardStats`, `useTickets`, `useFieldExecutives`, or any shared hook.  
   - Do not change query keys used by Dashboard, Analytics, or TicketsList.  
   - Do not write to any table; do not add mutations.  
   - If an extra read (ticket_assignments / field_executives) is added for “by FE”, keep it inside this page’s queryFn and same query key; do not expose a new hook.

---

## PART 2 — AUDIT LOGS UPGRADE PLAN

### Current state (from system analysis)

- **File:** `src/pages/AuditLogs.tsx`
- **Query key:** `['audit-logs']` (isolated; no other consumer)
- **Query:** `audit_logs` — `.select('*').order('created_at', { ascending: false }).limit(200)`.
- **Read/Write:** Read-only. No shared hooks.

All enhancements use only the columns already returned by `select('*')` (and the UI already references entity_type, action, entity_id, created_at, metadata, performed_by). No schema or column names are assumed beyond what the current response contains.

---

#### A. Advanced filtering

1. **Date range**  
   - Use a timestamp column that exists on the response (e.g. `created_at`).  
   - **Option A — Client-side:** Fetch same 200 rows; filter in memory by date range. Inconsistent with “pagination” if later you add server-side pagination.  
   - **Option B — Server-side:** Add `.gte('created_at', startDate)` and `.lte('created_at', endDate)` to the query when both are set; if either missing, omit that filter so the query does not break.  
   - Safe handling: validate start/end (e.g. start ≤ end); if invalid or missing, do not apply date filter.

2. **Entity type**  
   - Already in the analysis (UI shows entity_type).  
   - Filter: dropdown from distinct entity_type values in the current dataset (or a fixed set if known).  
   - Apply client-side to the 200 (or paginated) rows, or add `.eq('entity_type', value)` when a single value is selected.  
   - No new columns.

3. **Action type**  
   - Already in the analysis (UI shows action).  
   - Filter: dropdown from distinct action values or a fixed set.  
   - Client-side or `.eq('action', value)`.  
   - No new columns.

4. **User**  
   - Only if the current response includes a user identifier (e.g. `performed_by` or similar). If it does, add a filter (dropdown or text) and apply client-side or via `.eq()`. If the column does not exist in the response, omit “user” filter or label “N/A”.

5. **Free text search**  
   - Client-side: filter rows where a string column (e.g. action, entity_id, or stringified metadata) contains the search string (case-insensitive).  
   - Or server-side: use Supabase `ilike` on one or two columns if available; avoid full-text on large tables without schema confirmation.  
   - Scope to columns that exist in the current response.

All filters must be optional; when not set, behavior matches current “show last 200” (or paginated subset).

---

#### B. Pagination strategy

1. **Cursor-based vs offset-based**  
   - **Offset-based:** `.range(from, to)` with page size (e.g. 50). Simple; duplicate/missing rows possible if data is inserted between requests. Acceptable for read-only audit logs.  
   - **Cursor-based:** `.lt('created_at', cursor)` or similar, using a unique column. More stable under concurrent inserts; slightly more complex.  
   - **Recommendation:** Use offset-based with a fixed page size (e.g. 50) and `.range((page-1)*pageSize, page*pageSize-1)` to keep the same order. No schema assumption beyond the ordering column (e.g. created_at) and that it exists.

2. **Supabase-safe approach**  
   - Keep `.order('created_at', { ascending: false })`.  
   - Add `.range(offset, offset + pageSize - 1)` when paginating.  
   - Ensure `offset + pageSize` does not exceed a safe max (e.g. cap total requested rows per session or use a max page number).  
   - If date range or other filters are server-side, apply them before `.order()` and `.range()`.

3. **Avoid loading entire table**  
   - Do not remove the limit or set limit to a very high value.  
   - Either: (a) keep limit(200) and paginate only within those 200 client-side, or (b) replace fixed limit with pageSize and use range for true server-side pages.  
   - Choice (b) is preferred for “pagination” and “avoid loading entire table”; then max rows per page (e.g. 50) and a max page index (e.g. 20) to cap total rows fetched.

---

#### C. Aggregation possibilities (client-side)

1. **Action frequency**  
   - From the current page’s data (200 or paginated slice), compute counts per `action` (or per normalized action string).  
   - UseMemo: input = logs array; output = map or list of { action, count }.  
   - Display as a small table or bar chart (use existing chart lib if present).

2. **Most active user**  
   - Only if a “performer” column exists in the response (e.g. performed_by).  
   - Group by that column, count, take top. If column missing, skip or “N/A”.

3. **Entity change heatmap**  
   - Optional: time buckets (e.g. by hour or day) on the date column vs entity_type or action.  
   - Data: current page’s rows only (or current filter result).  
   - UseMemo to build counts; render with existing chart component.  
   - No new columns; use only existing fields.

All aggregations are derived from the already-fetched rows for the current view; no extra Supabase calls for aggregates unless you later add a dedicated summary endpoint (out of scope here).

---

#### D. Export strategy

1. **Export filtered logs to CSV**  
   - Use the **currently visible/filtered** list (same as table data).  
   - Build CSV from the current data shape (only fields present in the response).  
   - Blob + URL.createObjectURL + temporary anchor download; revoke URL after click.  
   - No new libraries.  
   - File name: e.g. `audit-logs-{date}.csv`.

2. **Export summary metrics**  
   - If “Action frequency” / “Most active user” are implemented, export a second CSV or a second sheet with one row per metric (e.g. “Action X”, count; “Top user”, id/name).  
   - Same Blob/URL approach.  
   - File name: e.g. `audit-logs-summary-{date}.csv`.

---

#### E. Performance guardrails

1. **Max rows per page**  
   - Fix page size (e.g. 50). Do not allow user to set page size above a cap (e.g. 100) to avoid heavy responses.

2. **Safe limit enforcement**  
   - When using `.range()`, ensure `from` and `to` are non-negative and `to - from + 1 ≤ pageSize`.  
   - If using server-side filters, apply filters first so `.range()` is applied on the filtered query, not on the full table without limit.

3. **Avoid heavy client-side filtering**  
   - Prefer server-side filters (date, entity_type, action) when possible so the client receives only the subset.  
   - If all filtering is client-side (e.g. still limit 200 then filter), document that export and aggregations are over at most 200 rows; for larger scope, a future backend change would be required (out of scope).

---

## Explicit list of files to modify

| # | File | Allowed changes |
|---|------|-----------------|
| 1 | `src/pages/SLAMonitor.tsx` | Query key (extend with local filter state only), queryFn (same tables; optional extra read for FE only in this file), filters (state + client-side application), useMemo for filtered data and stats, metric cards, charts, export button, pagination (client-side slice). No shared hooks. No mutations. |
| 2 | `src/pages/AuditLogs.tsx` | Query key (extend with pagination/filter state only), queryFn (same table; add optional server-side filters and .range()), filters (state + UI), useMemo for filtered list and aggregations, pagination UI, export (logs + summary), aggregation UI. No shared hooks. No mutations. |

No other files are to be modified. In particular:

- Do **not** modify: `src/hooks/useTickets.tsx`, `src/hooks/useDashboardStats.tsx`, `src/hooks/useFieldExecutives.tsx`, `src/pages/Dashboard.tsx`, `src/pages/Analytics.tsx`, `src/pages/TicketsList.tsx`, or any shared hook or lifecycle/mutation code.

---

## Confirmations

1. **No shared hooks will be modified.**  
   All changes are confined to inline logic and inline `useQuery` inside `SLAMonitor.tsx` and `AuditLogs.tsx`. No changes to `useTickets`, `useDashboardStats`, `useFieldExecutives`, `useRawEmails`, `useAuth`, or any other hook file.

2. **No query keys outside these pages will be touched.**  
   - SLA Monitor: only `['sla-tracking-with-tickets']` (possibly with suffix for local filter state). No reference to `['dashboard-stats']`, `['tickets', ...]`, or `['analytics-data', ...]`.  
   - Audit Logs: only `['audit-logs']` (possibly with suffix for pagination/filter state). No other keys.

3. **No schema assumptions were made.**  
   - All references to columns (e.g. created_at, entity_type, action, status, breach flags, priority, category, performed_by) are conditional on “if present in the current query response” or “use only existing columns already used on the page.” No new tables or columns are assumed; optional “by FE” for SLA Monitor is explicitly scoped to an optional extra read in the same page.

4. **No lifecycle mutations are affected.**  
   - Both pages remain read-only. No `.insert`, `.update`, or `.delete` on any table. No changes to TicketDetail, CreateTicketModal, FEAssignmentModal, FEMyTickets, FEActionPage, or to `useUpdateTicket`, `useUpdateTicketStatus`, `useAssignTicket`, or audit_log writers.

---

**End of implementation plan. No code; blueprint only.**
