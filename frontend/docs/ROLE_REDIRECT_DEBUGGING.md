# Service Manager Redirected to Client Dashboard — Debugging & Fix

## What’s happening

After login, the Service Manager is sent to **Client Dashboard** (`/app/client`) instead of the **Service Manager / Staff Dashboard** (`/app`). This is driven **only** by the **role** stored for that user in the database.

---

## How redirects work (no backend API change)

1. **Login** → User hits `/login`, which renders `Index.tsx`.
2. **Auth** → Supabase Auth identifies the user (session/token). No role is stored in the token.
3. **Profile** → The app loads the user profile from **`public.users`** by `auth_id`. The **`role`** column is the single source of truth.
4. **Redirect in `Index.tsx`** (exact logic):
   - `SUPER_ADMIN` → `/app/super-admin`
   - `CLIENT` → `/app/client`  ← **Service Manager ends up here only if role is CLIENT**
   - `FIELD_EXECUTIVE` → `/fe`
   - `ADMIN` or `STAFF` → `/app`  ← **Service Manager should have STAFF or ADMIN**
5. **Guards** → If a STAFF user opens `/app/client`, `RequireClient` sends them to `/app`. If a CLIENT user opens `/app`, `RequireStaff` sends them to `/app/client`. So once the role is wrong, every path leads to the wrong dashboard.

So: **if the Service Manager always lands on Client Dashboard, his `users.role` is almost certainly `'CLIENT'`.**

---

## Step-by-step debugging

### 1. Confirm the role in the database

Run this in Supabase SQL Editor (replace with the real email):

```sql
-- Replace with the Service Manager's login email
SELECT id, email, name, role, organisation_id, client_slug, is_active, approval_status
FROM public.users
WHERE email = 'service.manager@yourcompany.com';
```

- If **`role`** is `'CLIENT'` → that’s the bug. Fix it in step 3.
- If **`role`** is `'STAFF'` or `'ADMIN'`** but he still sees Client Dashboard → continue to step 2.

### 2. Confirm which auth user is used

Get the auth user id from Supabase Auth (Dashboard → Authentication → Users) for that email, then:

```sql
SELECT id, auth_id, email, name, role, organisation_id, client_slug
FROM public.users
WHERE auth_id = 'paste-auth-user-uuid-here';
```

- Ensure there is **exactly one** row and that **`role`** is `STAFF` or `ADMIN`, not `CLIENT`.
- If there are two rows (e.g. same person as CLIENT and STAFF), the one with **matching `auth_id`** is the one used after login. That row’s `role` must be `STAFF` or `ADMIN`.

### 3. Fix the role in the database (correct fix)

For the Service Manager’s user row, set role to `STAFF` (or `ADMIN` if they are an org admin):

```sql
-- Fix: set role to STAFF for the Service Manager (use correct email or id)
UPDATE public.users
SET role = 'STAFF'
WHERE email = 'service.manager@yourcompany.com'
  AND role = 'CLIENT';

-- Optional: clear client_slug if they should not act as a client
-- UPDATE public.users SET client_slug = NULL WHERE email = '...' AND role = 'STAFF';
```

Then:

1. Have the user **log out** (so the app drops in-memory profile).
2. Have them **log in again**. The app will re-read `users` and get `role = 'STAFF'`, and `Index.tsx` will redirect to `/app`.

### 4. Optional: see the role in the browser (dev only)

To confirm which role the app is using after login, you can temporarily log it:

- In **`Index.tsx`**, right before the role-based redirect block, add:

```ts
if (import.meta.env.DEV && userProfile) {
  console.info('[Auth redirect] role:', userProfile.role, 'email:', userProfile.email);
}
```

- Log in as the Service Manager and check the browser console. You should see `role: 'CLIENT'` before the fix and `role: 'STAFF'` after the DB update.

---

## Why this happens (common causes)

1. **User was created as CLIENT**  
   They were invited or signed up as a client; later they were supposed to be a Service Manager but the `role` was never updated.

2. **Wrong row updated**  
   Someone updated a different user’s role or updated the wrong column.

3. **Duplicate or mixed accounts**  
   Same email in Auth but two rows in `users` (e.g. one CLIENT, one STAFF). The row that matches `auth_id` is the one used; if that row is CLIENT, they will always get Client Dashboard.

4. **Case or typo**  
   The app only accepts exact strings: `STAFF`, `ADMIN`, `CLIENT`, `FIELD_EXECUTIVE`, `SUPER_ADMIN`. Values like `staff`, `Service Manager`, or `SERVICE_MANAGER` are invalid and result in no profile (pending/error), not in being treated as CLIENT. So if they *are* on Client Dashboard, the stored value is almost certainly `CLIENT`.

---

## Checklist after fix

- [ ] `users.role` for the Service Manager is `STAFF` (or `ADMIN`) in the DB.
- [ ] Service Manager logged out and logged in again.
- [ ] After login they land on `/app` (staff dashboard), not `/app/client`.
- [ ] Optional: remove or leave the dev `console.info` in `Index.tsx` depending on your policy.

---

## No code or API change required

Routing and redirects use only:

- Supabase Auth (who is logged in)
- `public.users` (role, organisation_id, etc.)

So you don’t need to change backend APIs, tokens, or session handling — only the **data** in `public.users`. Fixing `role` (and optionally `client_slug`) for that user resolves the issue.
