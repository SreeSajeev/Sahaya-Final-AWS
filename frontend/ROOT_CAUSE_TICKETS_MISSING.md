# Root Cause Analysis: Tickets Missing from All Tickets / Dashboard

**Read-only analysis.** No architecture rewrite. Exact filtering mismatch identified.

---

## STEP 1 – Frontend Data Source

### 1.1 Page components

| Page | Component | Path |
|------|-----------|------|
| **All Tickets** | `TicketsList` | `field-ops-assist/src/pages/TicketsList.tsx` |
| **Dashboard** | `Dashboard` | `field-ops-assist/src/pages/Dashboard.tsx` |
| **Review Queue** | `ReviewQueue` | `field-ops-assist/src/pages/ReviewQueue.tsx` |

### 1.2 Data source per page

| Page | API / client | Endpoint / method |
|------|-------------|-------------------|
| **All Tickets** | **Supabase client directly** | No REST API. Uses `supabase.from("tickets").select("*")` inside `useTickets(filters)`. |
| **Dashboard** | **Supabase client directly** | Same: `useTickets({ status: "all" })` + `useDashboardStats()`. Both query `tickets` via Supabase client. |
| **Review Queue** | **Supabase client directly** | Same hook: `useTickets({ status: 'NEEDS_REVIEW', scopeAllOrganisations: true })`. |

All three use the **Supabase JS client** from `@/integrations/supabase/client`. No backend REST API and no server action for the ticket list.

### 1.3 Exact fetch logic and query parameters

**All Tickets** (`TicketsList.tsx` line 18):

```ts
const [filters, setFilters] = useState<TicketFilters>({});
const { data: tickets, isLoading } = useTickets(filters);
```

Default `filters = {}` → no `status`, no `scopeAllOrganisations`, no `organisationId`.

**Dashboard** (`Dashboard.tsx` lines 76–77):

```ts
const { data: stats, isLoading: statsLoading } = useDashboardStats();
const { data: recentTickets, isLoading: ticketsLoading } = useTickets({ status: "all" });
```

**Review Queue** (`ReviewQueue.tsx` line 10):

```ts
const { data: tickets, isLoading } = useTickets({ status: 'NEEDS_REVIEW', scopeAllOrganisations: true });
```

**Shared query builder** (`useTickets.tsx` lines 17–60):

```ts
let query = supabase
  .from("tickets")
  .select("*")
  .order("created_at", { ascending: false });

if (!isSuperAdmin && organisationId && !filters?.scopeAllOrganisations) {
  query = query.eq("organisation_id", organisationId);
}
if (isSuperAdmin && filters?.organisationId != null && filters.organisationId !== "") {
  query = query.eq("organisation_id", filters.organisationId);
}
if (filters?.status && filters.status !== "all") {
  query = query.eq("status", filters.status);
}
// ... confidenceRange, search, unassignedOnly, clientSlug
```

---

## STEP 2 – Filtering Logic

### 2.1 WHERE clauses applied (useTickets)

| Condition | When applied | Source |
|-----------|--------------|--------|
| `organisation_id = organisationId` | Non–Super Admin **and** `organisationId` present **and** `!filters.scopeAllOrganisations` | `useTickets.tsx` 23–25 |
| `organisation_id = filters.organisationId` | Super Admin **and** `filters.organisationId` set | 26–28 |
| `status = filters.status` | `filters.status` set and not `"all"` | 29–31 |
| `confidence_score` range | `filters.confidenceRange` (high/medium/low) | 32–43 |
| `ticket_number \| complaint_id \| vehicle_number ILIKE %search%` | `filters.search` set | 45–49 |
| `current_assignment_id IS NULL` | `filters.unassignedOnly` | 50–52 |
| `client_slug = filters.clientSlug` | `filters.clientSlug` set | 52–54 |

### 2.2 Per-page behaviour

- **All Tickets:** `useTickets({})` → **organisation_id filter applied** (for non–Super Admin with `organisationId`). No status filter, no limit.
- **Dashboard:** `useTickets({ status: "all" })` → **organisation_id filter applied**. No limit.
- **Review Queue:** `useTickets({ status: 'NEEDS_REVIEW', scopeAllOrganisations: true })` → **organisation_id filter NOT applied**. Status = NEEDS_REVIEW. No limit.

### 2.3 Filters checked

| Filter | All Tickets | Dashboard | Review Queue |
|--------|-------------|-----------|--------------|
| status | No default (all statuses) | `"all"` (no filter) | `NEEDS_REVIEW` |
| tenant_id | N/A (table uses organisation_id) | — | — |
| role | Only to decide Super Admin vs org filter | — | — |
| assigned_to | No | No | No |
| created_by | No | No | No |
| **organisation_id** | **Yes (when not Super Admin, and not scopeAllOrganisations)** | **Yes** | **No (scopeAllOrganisations: true)** |
| is_archived | No | No | No |
| confidence threshold | Only if user sets filter | No | No |

### 2.4 Default filters

- There is **no** default like `status != 'NEEDS_REVIEW'` or `status IN ('OPEN','ASSIGNED')`.
- The only implicit default for tenant users (non–Super Admin) is **`organisation_id = user's organisation_id`**.

### 2.5 Limit

- **No** `.limit(...)` in `useTickets`. All matching rows are returned. Limit is not hiding new tickets.

---

## STEP 3 – Tenant Scoping

1. **Does `tickets` table contain tenant_id?**  
   **No.** It has **`organisation_id`** (UUID, nullable, FK to `organisations`). Migration `20260222100000_add_organisations_and_organisation_id.sql` added it.

2. **Is frontend filtering by tenant_id?**  
   Frontend filters by **organisation_id** (not a column named tenant_id). Same concept: tenant = organisation.

3. **Are newly created tickets missing tenant_id / organisation_id?**  
   **Backend-created tickets (email worker):** Previously the insert did **not** set `organisation_id`, so they were stored with **`organisation_id = NULL`**.  
   **Fix applied:** `Pariskq-CRM-Backend/src/services/ticketService.js` now sets `organisation_id: DEFAULT_ORGANISATION_ID` in the insert payload. **New** email-created tickets will have an organisation. **Existing** rows created before that change (or before deploy) can still have `organisation_id IS NULL`.

4. **Where organisation_id is injected on create:**  
   In **`Pariskq-CRM-Backend/src/services/ticketService.js`**, inside `createTicket`, the object passed to `insertTicket()` includes `organisation_id: DEFAULT_ORGANISATION_ID` (env `DEFAULT_ORGANISATION_ID` or fallback `00000000-0000-0000-0000-000000000001`).

---

## STEP 4 – RLS (Supabase)

1. **Is RLS enabled on `tickets`?**  
   **Yes.** Migration `20260109071722_...` enables RLS; `20260127110842_...` replaces policies.

2. **What policies exist on `tickets`?**  
   - **"Staff can view tickets"** — `FOR SELECT TO authenticated USING (public.is_staff_or_above(auth.uid()));`  
   - **"Staff can insert tickets"** — `FOR INSERT ... WITH CHECK (public.is_staff_or_above(auth.uid()));`  
   - **"Staff can update tickets"** — `FOR UPDATE ... USING / WITH CHECK (public.is_staff_or_above(auth.uid()));`

3. **Do policies restrict rows by auth.uid()?**  
   Only by **role**: user must be staff or above. There is **no** condition on `tickets.organisation_id` or `tickets.created_by` in RLS. So RLS does **not** filter out rows by organisation.

4. **Backend-created tickets:**  
   Backend uses Supabase (service role or same client). Insert is allowed by "Staff can insert tickets" when done as a service/backend context; RLS does not require `organisation_id` to match the current user.

5. **Are frontend reads blocked because tenant_id or created_by doesn’t match?**  
   **No.** RLS does not reference `tenant_id` or `created_by`. Rows are **not** hidden by RLS. They are hidden by the **application-level** filter in the frontend: `.eq("organisation_id", organisationId)`. Rows with **`organisation_id IS NULL`** fail that equality in SQL (`NULL = '<uuid>'` is false), so they never appear in the result set for All Tickets or Dashboard.

**Conclusion:** RLS is **not** the cause. The cause is the **app-level** `organisation_id` filter in `useTickets` and `useDashboardStats`.

---

## STEP 5 – Status Mapping

- **DB constraint** (`20260221100000_add_fe_attempt_failed_status.sql`):  
  `status IN ('OPEN','NEEDS_REVIEW','ASSIGNED','EN_ROUTE','ON_SITE','RESOLVED_PENDING_VERIFICATION','RESOLVED','REOPENED','FE_ATTEMPT_FAILED')`.

- **Frontend** (`src/lib/types.ts`):  
  `TicketStatus` = `'OPEN' | 'NEEDS_REVIEW' | 'ASSIGNED' | ...` (same values, uppercase).

- **Backend** (`ticketService.js`):  
  Sets `status` to `'OPEN'` or `'NEEDS_REVIEW'` (uppercase).

No case mismatch. Status is **not** the reason rows are invisible.

---

## STEP 6 – Ordering

- **useTickets:** `.order("created_at", { ascending: false })` → **created_at DESC**. No “last 7 days” or “assigned only” in the query. Ordering is not excluding today’s tickets.

---

## STEP 7 – Why PKQ-20260303-6335 Is Excluded

1. **Does it match frontend filters?**  
   - Status OPEN → no status filter on All Tickets, so it would match.  
   - The only filter that can exclude it is **organisation_id**.

2. **Why is it excluded?**  
   For a non–Super Admin user, All Tickets runs:  
   `query.eq("organisation_id", organisationId)`.  
   If this ticket was created **before** the backend fix (or with an older deploy), it has **`organisation_id = NULL`**. In SQL, `WHERE organisation_id = '<user-org-uuid>'` does **not** match rows where `organisation_id IS NULL`. So the row is excluded.

3. **Exact condition that excludes it:**  
   **`WHERE organisation_id = '<logged-in user's organisation_id>'`**  
   and the ticket has **`organisation_id IS NULL`** (or any value different from the user’s org). So the row is not returned.

---

## OUTPUT REQUIRED – Summary

### 1. Exact query used by All Tickets

```ts
supabase
  .from("tickets")
  .select("*")
  .order("created_at", { ascending: false })
  .eq("organisation_id", organisationId)   // when !isSuperAdmin && organisationId && !scopeAllOrganisations
```

For a tenant user (e.g. Service Manager), `organisationId` is from `userProfile?.organisation_id`. No other default filters; no limit.

### 2. Exact filter conditions

- **All Tickets (tenant user):** `organisation_id = user's organisation_id`. Optional: status, confidenceRange, search, unassignedOnly, clientSlug from UI.
- **Dashboard (tenant user):** Same `organisation_id = user's organisation_id` in both `useTickets` and `useDashboardStats`.
- **Review Queue:** No organisation filter (`scopeAllOrganisations: true`), plus `status = 'NEEDS_REVIEW'`.

### 3. Tenant mismatch?

**Yes.**  
- **Tenant scoping:** Frontend uses **organisation_id** (not tenant_id).  
- **Mismatch:** Tickets created by the email worker **before** the backend fix had **organisation_id = NULL**. The frontend filter `organisation_id = <user org>` excludes those rows. So those tickets do not appear on All Tickets or Dashboard for any tenant user.  
- **After fix:** New tickets get `organisation_id = DEFAULT_ORGANISATION_ID`. Users whose org is that default will see them. Existing NULL-org rows need a one-time backfill (same as migration backfill) if they should appear for the default org.

### 4. Is RLS blocking?

**No.** RLS on `tickets` only checks `is_staff_or_above(auth.uid())`. It does not filter by organisation_id or created_by. RLS is not blocking.

### 5. Precise root cause

1. **Backend** (before fix): Email-created tickets were inserted **without** `organisation_id` → stored as **NULL**.  
2. **Frontend:** All Tickets and Dashboard use **`.eq("organisation_id", organisationId)`** for non–Super Admin users. Rows with **NULL organisation_id** do not match that equality.  
3. **Result:** Those tickets never appear on All Tickets or Dashboard. They **do** appear on Review Queue when status is NEEDS_REVIEW, because Review Queue uses **scopeAllOrganisations: true** and does not apply the org filter.  
4. **Surgical fix (already in code):** Set `organisation_id` in the backend on insert (`ticketService.js`). For **existing** NULL-org tickets, run a one-time backfill:  
   `UPDATE tickets SET organisation_id = '00000000-0000-0000-0000-000000000001'::uuid WHERE organisation_id IS NULL;`

---

**No filter by ticket_number prefix (TKT vs PKQ).**  
**No filter by status list that excludes OPEN/NEEDS_REVIEW.**  
**No date filter or limit hiding new tickets.**  
**Single root cause: organisation_id NULL on insert + frontend filter by organisation_id.**
