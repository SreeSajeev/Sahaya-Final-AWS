# Audit Logs — Operational Dashboard

## Investigation findings (SQL “No rows returned”)

The Supabase SQL in the editor used **LEFT JOIN** from `audit_logs` to `tickets` on `t.id = al.entity_id`.

That join is **not wrong for ticket rows**, but:

1. **Empty table** — If `audit_logs` has zero rows in that project/environment, the query correctly returns no rows regardless of joins.
2. **Non-ticket `entity_type`** — The app writes multiple entity types:
   - `ticket` — `entity_id` = ticket UUID
   - `assignment` — `entity_id` = **assignment** UUID (not ticket); ticket link is in `metadata.ticket_id`
   - `bulk_assignment` — `entity_id` = first ticket id in batch
   - `field_executive` — `entity_id` = FE UUID
3. **LEFT JOIN still returns audit rows** — So “no rows” is not caused by INNER JOIN dropping assignment rows; it indicates **no data** or **wrong DB/project**.

Operational display must resolve ticket context via `entity_type` + `metadata`, not only `entity_id = tickets.id`.

## Architecture

| Layer | Responsibility |
|--------|----------------|
| `public.audit_logs` | Immutable source of truth (unchanged writes) |
| `auditLogService.js` | Inserts + tenant scoping (`scopeAuditLogsQuery`) — unchanged |
| `auditLogDisplayService.js` | List query builder, ticket search, batch enrichment, CSV |
| `GET /data/audit-logs` | Same route; additive query params + `display` object on each item |
| `AuditLogs.tsx` | Enterprise table UI |

## Backend vs frontend filtering

| Filter | Where |
|--------|--------|
| Tenant scope | Backend (`scopeAuditLogsQuery`) — unchanged |
| Date range | Backend (`dateFrom` / `dateTo` ISO) |
| Entity type, action | Backend |
| Ticket number | Backend (ticket lookup → `entity_id` or `metadata.ticket_id`) |
| Actor user / FE | Backend (`actor_user_id`, `actor_fe_id`) |
| Organisation (super admin) | Backend (`organisationId`) |
| Sort | Backend (`sortBy`, `sortDir` on allowlisted columns) |
| Pagination | Backend (`limit`, `offset`) |
| Quick presets (Today, 7d, etc.) | Frontend sets date params only |
| CSV export | Backend `format=csv` with same filters (cap 5000 rows) |

No broad client-only search over paginated data.

## `display` shape (additive)

Each item includes existing audit fields plus:

```json
{
  "display": {
    "timestamp": "...",
    "ticket_number": "TKT-...",
    "action": "status_changed_to_ON_SITE",
    "action_label": "Status → ON_SITE",
    "ticket_status": "ON_SITE",
    "done_by": "Jane Doe",
    "actor_role": "FIELD_EXECUTIVE",
    "field_executive_name": "Raj FE",
    "organisation_name": "Hitachi",
    "summary": "..."
  }
}
```

**Note:** `ticket_status` is **current** ticket status from `tickets`, not historical at event time.

## Performance

- Page size default 50; export max 5000.
- Enrichment: up to 4 batch lookups per page (tickets, users, FEs, orgs) in chunks of 100.
- Recommended indexes (existing / migration): `(organisation_id, created_at DESC)`, `tickets(ticket_number)` for search.

## Safety

No auth/session/routing/business workflow changes. Only audit read path + `AuditLogs.tsx` UI.
