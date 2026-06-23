# Postgres DB Cutover Plan (Keep Supabase Auth)

Goal: remove Supabase **database** usage while keeping Supabase **Auth** (and optionally Storage) without breaking:

`assignment → on-site proof → resolution → closure → webhook ingestion → admin intervention`

## 1) Configuration you received (maps to env vars)

Your team shared:

- host: `localhost`
- user: `pariskq-users`
- port: `5432`
- password: (secret)
- database: (secret)

Set these as:

```bash
PGHOST=localhost
PGUSER=pariskq-users
PGPORT=5432
PGPASSWORD=*** # secret
PGDATABASE=*** # secret
PGSSL=false
```

Preferred alternative (AWS often gives this):

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DBNAME
PGSSL=true # if AWS requires it
```

## 2) Non-breaking provisioning (already added)

- `src/db/postgresClient.js`: Postgres pool + `pgQuery()`
- `scripts/test-postgres-connection.js`: quick connectivity check
- `USE_POSTGRES_DB` flag (default OFF) in `src/config/appConfig.js`

With `USE_POSTGRES_DB=false` (default), **no behavior changes** occur.

## 3) How to test connectivity (safe)

From `Pariskq-CRM-Backend/`:

```bash
node scripts/test-postgres-connection.js
```

Expected: `[pg] ok ...`

## 4) Safe migration strategy (no downtime)

### Step A — Mirror schema + data

1. Restore `supabase_dump.sql` into Postgres.
2. Validate core tables exist (`tickets`, `ticket_assignments`, `ticket_comments`, `fe_action_tokens`, `raw_emails`, `parsed_emails`, queues).

### Step B — Dual-stack code (Supabase DB default)

3. Keep Supabase DB as the live source while you implement Postgres repositories behind `USE_POSTGRES_DB`.

### Step C — Cutover by vertical slice

Recommended order:

1. Webhook ingestion tables (`raw_emails`, `parsed_emails`)
2. Ticket reads (`GET /tickets`)
3. Ticket assignment + token issuance
4. Proof submission + token activation
5. Closure + notifications
6. Workers last (or in parallel if you can isolate processing)

Each slice:

- `USE_POSTGRES_DB=false`: baseline
- `USE_POSTGRES_DB=true` in staging: verify regression plan
- production canary → expand → rollback by flipping flag OFF

## 5) What is *not* changed yet

- Supabase Auth remains as-is (JWT verification via Supabase SDK in middleware)
- Supabase Storage usage remains as-is (proof upload worker)
- No Supabase DB query paths have been switched to Postgres yet (this is provisioning only)

