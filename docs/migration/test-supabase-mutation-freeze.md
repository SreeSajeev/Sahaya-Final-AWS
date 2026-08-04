# TEST Shared-Supabase Mutation Freeze

## Why the freeze exists

TEST Sahaya (`test-sahaya.pariskq.in` / `api.test-sahaya.pariskq.in`) and PRODUCTION Sahaya (`sahaya.pariskq.in`) currently share the same Supabase project:

```text
bggumdvyvgpqvhqyksid
```

Strategy B (direct Supabase removal) means we will **not** create a temporary TEST Supabase project. Until Auth / PostgREST / Storage are replaced on AWS, TEST must not mutate that shared project.

This freeze is enforced in **TEST application code/configuration only**. It does **not** change Supabase dashboard settings, RLS, Auth settings, or Storage policies (those would affect production).

---

## Scope — frozen operations

When the freeze flags are enabled on TEST:

| Area | Blocked |
|------|---------|
| Auth | `signUp` / public signup |
| Auth | Password change (`updateUser` password) |
| Auth | Password reset completion (`updateUser` password) |
| Auth | Forgot-password `auth.admin.generateLink` (backend) |
| Auth | Admin `auth.admin.createUser` / compensating `deleteUser` |
| Auth | FE `createAdminUser` / portal user create (both browser signUp and server provision paths) |
| PostgREST | `organisations` **insert** / **update** (org CRUD + TicketSettings review fields) |
| Storage | `fe-proofs` **upload** (proof controller + proof backup worker) |

---

## Allowed temporary operations

| Operation | Risk | Rationale |
|-----------|------|-----------|
| Login (`signInWithPassword`) | Low — may update Auth last-sign-in | Needed to inspect TEST CRM with existing accounts |
| Session restore / refresh / `getSession` / `onAuthStateChange` | Low — session bookkeeping | Required for API Bearer tokens |
| Logout (`signOut`) | Low — session revoke | UX / security hygiene |
| `/auth/v1/user` JWT validation | Read | Required for backend `requireAuth` |
| PostgREST **SELECT** (tickets, users, orgs, SLA) | Read shared data plane | Temporary inspection only; do not treat as Docker DB truth |
| Prisma writes to `localhost:5436/sahaya` | None to Supabase | Unrelated to this freeze |
| Proof submit to Postgres (+ optional S3) | S3 still separate risk | Supabase Storage upload skipped; DB proof path remains |

**Do not** use password reset, signup, admin Auth create, or org PostgREST writes on TEST while freeze is active.

---

## Configuration

### Backend (runtime — TEST EC2 PM2 env / `backend/.env`)

```text
SHARED_SUPABASE_MUTATIONS_DISABLED=true
```

**Enablement rule (exact):** freeze is ON only when the trimmed, lowercased value equals `true`.

| Value | Freeze |
|-------|--------|
| missing / empty | OFF |
| `false` / `FALSE` / `0` / `1` / `yes` | OFF |
| `true` / `TRUE` / ` True ` | ON |

Default if unset: **mutations allowed** (production-safe).

### Frontend (build-time — Vite)

```text
VITE_SHARED_SUPABASE_MUTATIONS_DISABLED=true
```

Same enablement rule as backend (`=== "true"` after trim/lower).

Must be present in the env file used when running `npm run build` for TEST.

`deploy-test.yml` builds **on EC2** (`cd frontend && npm run build`). On each TEST deploy it **upserts** both freeze flags into EC2 `frontend/.env` and `backend/.env` before the Vite build and PM2 restart (TEST workflow only — production deploy paths must not copy this).

**Both flags must be enabled together on TEST.** Browser Auth signup / PostgREST writes only see the Vite flag; service-role Auth/Storage only see the backend flag.

### Production

```text
This freeze must not be enabled in production unless separately approved.
```

Leave both flags unset (or any non-`true` value) on production.

---

## Implementation pointers

| Layer | Module |
|-------|--------|
| Backend flag | `backend/src/security/sharedSupabaseMutationFreeze.js` |
| Frontend flag | `frontend/src/lib/sharedSupabaseMutationFreeze.ts` |
| Backend call sites | `publicAuth.js`, `userProvisioningService.js`, `proofController.js`, `proofBackupQueueProcessor.js` |
| Frontend call sites | `useAuth.tsx`, `createAdminUser.ts`, `ChangePassword.tsx`, `ResetPassword.tsx`, `useOrganisationsTable.ts`, `TicketSettings.tsx` |

Fail-closed message:

> This action is temporarily disabled in the Sahaya test environment while shared Supabase dependencies are being migrated.

Backend Auth mutation routes respond with **403** + `code: SHARED_SUPABASE_MUTATIONS_DISABLED`.

---

## Verification

### Without deploying

```bash
cd backend
SHARED_SUPABASE_MUTATIONS_DISABLED=true npx vitest run tests/unit/sharedSupabaseMutationFreeze.test.js tests/unit/forgotPasswordFreeze.test.js
```

Expect: all tests pass; mocked `createUser` / `generateLink` **never called**.

### After TEST deploy (operator)

1. Backend: confirm PM2 env has `SHARED_SUPABASE_MUTATIONS_DISABLED=true`, restart TEST API only.
2. Call `POST /auth/public/forgot-password` → expect **403** with freeze message; no email.
3. Frontend: rebuild with `VITE_SHARED_SUPABASE_MUTATIONS_DISABLED=true`; attempt org create / signup → freeze error; no Supabase mutation.

---

## Emergency rule

If an unknown TEST workflow is discovered that mutates shared Supabase:

1. **STOP** using that workflow.
2. Classify it (Auth / PostgREST / Storage).
3. Extend the freeze guard before continuing migration work.

---

## Removal condition

Remove this freeze only when TEST no longer depends on project `bggumdvyvgpqvhqyksid` for Auth, PostgREST, or Storage (AWS Auth + API data plane + S3 complete), or when a separately approved isolation approach replaces it.

---

## Related

- Phase 0 baseline: `docs/migration/phase-0-baseline.md`
- Shared project remains **GATE C FAIL** even while this freeze is active.
