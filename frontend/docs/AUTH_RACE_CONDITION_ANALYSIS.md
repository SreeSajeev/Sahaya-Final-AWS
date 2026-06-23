# Auth / Routing Race Condition Analysis

## 1. Guard logic: when do we allow routing before profile is loaded?

### RequireStaff (`AuthGuards.tsx`)

```ts
if (loading && !user) return <AuthLoading />;
if (!user) return <Navigate to="/" />;
if (isFieldExecutive) return <Navigate to="/" />;
if (isClient) return <Navigate to="/app/client" />;
return <Outlet />;
```

- **Loading condition:** `loading && !user`. So loading UI is shown only when **both** loading is true **and** user is falsy.
- **Can user exist while userProfile is still null?** Yes. In `hydrate()`: `setUser(sess?.user)` runs first, then `await resolveUserProfile()`, then `setUserProfile()` and `setLoading(false)`. So there is a window where `user` is set, `loading` is still `true`, and `userProfile` is still null (or stale).
- **In that window:** `loading && !user` → `true && false` → **false**. So we do **not** show loading; we fall through.
- **Then:** `isClient = userProfile?.role === "CLIENT"`. If `userProfile` is null, that is **false**. So we do **not** redirect to `/app/client`. We hit `return <Outlet />` and **allow STAFF routes to mount before profile is loaded.**

So: **RequireStaff does allow routing (and can render the Staff dashboard) before `userProfile` is loaded.** It does not redirect to Client in that case; it lets the Staff layout through.

### RequireClient (`AuthGuards.tsx`)

```ts
if (loading && !user) return <AuthLoading />;
if (!user) return <Navigate to="/login" />;
if (userProfile?.role !== "CLIENT") return <Navigate to="/app" />;
return children;
```

- **Same loading condition:** `loading && !user`. So when `user` is set and profile is still loading, we do **not** show loading.
- **Then:** `userProfile?.role !== "CLIENT"`. When `userProfile` is **null**, `undefined !== "CLIENT"` is **true**, so we **redirect to `/app`**. So we do **not** render the Client layout when profile is null.

So: **RequireClient does not allow the Client dashboard to mount when `userProfile` is null;** it sends the user to `/app`. The only way a STAFF user can see the Client dashboard is if **Index** has already redirected them to `/app/client` using a loaded profile with `role === "CLIENT"`, or some other code path.

---

## 2. Is `if (loading && !user)` safe?

**No, for role-based routing it is not safe.**

- It only treats “loading” as “we don’t know the user yet”.
- It does **not** treat “user known but profile not loaded” as loading.
- So as soon as `user` is set, guards stop showing loading and make decisions using `userProfile` / `isClient` / `isAdmin`. If `userProfile` is still null, then:
  - `isClient` is false → RequireStaff lets Staff routes render.
  - `userProfile?.role !== "CLIENT"` is true → RequireClient redirects to `/app`.

So the **incorrect** outcome (STAFF user on Client dashboard) cannot be explained by “we showed Client layout while profile was null.” It could only happen if **Index** (or something else) sent a STAFF user to `/app/client` **after** seeing a profile with `role === "CLIENT"`, which you’ve ruled out from the DB side. So the remaining risk is **stale or inconsistent profile state** when Index runs (see below), or a **second hydrate** overwriting profile in a bad way.

---

## 3. Can `<Navigate>` in Index use stale or partially loaded state?

**Index only redirects when `!loading` and `user` and `userProfile` are all set.** So by the time we hit the role checks, we are not “partially loaded” in the sense of null profile.

Possible problems:

1. **Multiple hydrates:**  
   `getSession()` and `onAuthStateChange` can both call `hydrate`. If two calls run (e.g. one with session, one with null), the one that runs **last** wins. If the last one is `hydrate(null)` (e.g. getSession() briefly returning null), we clear user and profile; then the next event might run `hydrate(session)` again. So we can get multiple redirects and flicker, but it’s harder to get “STAFF with correct DB” ending up with a **CLIENT** profile unless one of the hydrates returned a wrong profile (e.g. wrong row), which you’ve ruled out.

2. **Stale closure:**  
   Index uses `useAuth()`; it always reads the latest context. So it’s not a classic stale closure. The only “stale” would be if the **context** held an old profile (e.g. from a previous session or from another tab). The provider is per tab, so the only way would be a bug in how we set/clear profile in the provider.

3. **Redirect happening multiple times:**  
   Yes. Every time `Index` mounts (e.g. user navigates to `/login`) and auth state has user + profile, it runs the role checks and emits `<Navigate>`. So redirect can happen again if the user is sent back to `/login` and then auth state is still the same. That doesn’t by itself flip role from STAFF to CLIENT.

So: **Index can trigger redirect multiple times, but it only uses “fully loaded” state (user + userProfile). The risk is not “redirect with null profile” but “profile in context briefly wrong or overwritten by a race.”**

---

## 4. AuthProvider: does `loading` become false before `userProfile` is set?

**No.** In `hydrate()`:

1. `setSession(sess); setUser(sess?.user ?? null);`
2. If there’s a user: `let result = await resolveUserProfile(sess.user);` then `setUserProfile(result.profile);`
3. Then `setLoading(false);`

So `setLoading(false)` runs in the same synchronous block **after** `setUserProfile`. In React 18, these updates are batched when they’re in the same event/callback, so the next render typically has both `userProfile` and `loading === false` for a logged-in user. So we do **not** normally get a committed state where `user` is set, `loading` is false, and `userProfile` is null.

**Exception:** If `resolveUserProfile` throws before we call `setUserProfile` and `setLoading(false)`, we never set loading to false. Then we’d have `user` set, `loading` true, `userProfile` null. Index would stay on “Loading…”. Guards would not show their loading UI (because `loading && !user` is false) and would use null profile (RequireStaff → Outlet, RequireClient → redirect to `/app`). So we still wouldn’t show Client dashboard with null profile.

---

## 5. Intermediate state: session exists, user exists, profile still loading

- **State:** `session` set, `user` set, `resolveUserProfile` still in progress, so `userProfile` still null (or previous value), `loading` still true.
- **Index:** Renders with `loading === true` → shows “Loading…”. So **Index does not redirect in this state.**
- **RequireStaff:** `loading && !user` is false → no loading UI; `isClient` is false → **Outlet** (Staff layout can mount).
- **RequireClient:** `loading && !user` is false; `userProfile?.role !== "CLIENT"` is true → **Navigate to /app.**

So in this intermediate state, **guards can “misfire”** in the sense that RequireStaff allows the Staff tree to render even though profile isn’t loaded yet. They don’t send a STAFF user to the Client dashboard; they either show Staff layout or redirect to `/app`.

---

## 6. React Strict Mode / hydration / slow network

- **Strict Mode:** Can double-mount and run effects twice. So we can get two `hydrate` runs. If one is `hydrate(null)` (e.g. getSession() returning null once), we can clear user and profile and set loading false, then the other hydrate might set them again. That can cause flicker or a brief LoginForm, but not “STAFF user with CLIENT profile” unless one of the hydrates gets wrong data.
- **Slow network:** `resolveUserProfile` takes longer. So the “user set, profile null, loading true” window is longer. Again, Index keeps showing loading; RequireStaff can show Staff layout with null profile; RequireClient redirects to `/app`. So we still don’t show Client dashboard with null profile.
- **“RequireClient renders once with userProfile = null and allows Client layout”:** From the code, when `userProfile` is null, `userProfile?.role !== "CLIENT"` is true, so RequireClient **always** redirects to `/app`. So it does **not** allow the Client layout to mount when profile is null. So this specific scenario does not happen.

---

## 7. Step-by-step runtime flow

1. User submits login → `signIn()` → `supabase.auth.signInWithPassword()`.
2. Supabase updates auth state and persists session (e.g. localStorage).
3. `onAuthStateChange` fires with the new session.
4. `hydrate(newSession)` runs:
   - `setSession(sess); setUser(sess?.user);` → React schedules re-render (user set, loading still true).
   - `await resolveUserProfile(sess.user)` → DB fetch by `auth_id`.
   - `setUserProfile(result.profile); setLoading(false);` → React batches and commits; next render has user + userProfile + loading false.
5. **Index** (mounted at `/login`): previously showed “Loading…” while `loading` was true. Now it sees `!loading`, `user`, `userProfile`. It runs role checks and renders e.g. `<Navigate to="/app" replace />` for STAFF.
6. Router navigates to `/app`. **RequireStaff** runs:
   - `loading && !user` → false; `!user` → false; `isFieldExecutive` → false; `isClient` → false → **Outlet** → Staff dashboard.
7. If the user had been sent to `/app/client` (only if Index had seen role CLIENT), **RequireClient** would run and, if profile were STAFF, would send them to `/app`.

So the only way a STAFF user ends up on the Client dashboard is if **at the moment Index ran**, `userProfile.role` was `"CLIENT"`. That implies either wrong data from the DB (ruled out) or a race where the profile was overwritten or not yet updated when Index read it (e.g. double hydrate, or a render using an older context value).

---

## 8. Race-condition risks (summary)

| # | Risk | Where | Effect |
|---|------|--------|--------|
| 1 | Guards only wait for `loading && !user`, not for profile | RequireStaff, RequireClient | Staff layout can mount before profile loads; decisions use null/stale profile. |
| 2 | `loading` is set false only after profile is set; no separate “profile loading” | AuthProvider | “User set, loading false, profile null” should not occur; if it does (e.g. bug or second hydrate), guards treat null as non-CLIENT. |
| 3 | Two hydrates (getSession + onAuthStateChange) | AuthProvider | Last writer wins; brief null session can clear state and cause flicker or double redirect. |
| 4 | Index only checks `loading` and `user` and `userProfile`; it does not re-check after navigation | Index | If profile is wrong once, redirect is wrong; no “correcting” redirect from Index after that. |
| 5 | No explicit “profile ready” gate in guards | All guards | Any guard that uses `userProfile` or derived flags can see null or stale profile in the window where user is set but profile not yet (or just) updated. |

---

## 10. Implementation applied

In `src/components/auth/AuthGuards.tsx`, all role-based guards now treat **"user present but userProfile null"** as **not ready** and show the loading UI:

- **RequireStaff, RequireClient, RequireFE, RequireAdmin, RequireSuperAdmin** use:
  - `const authNotReady = loading || (user != null && userProfile == null);`
  - `if (authNotReady) return fallback ?? <AuthLoading />;`

No guard renders its outlet/children until profile is resolved (or there is no user). Index.tsx was already safe (it does not redirect until `userProfile` is set).

---

## 9. Safe pattern: block routing until auth + profile are resolved

- **Principle:** Do not make any **role-based** routing decision (and do not let role-based guards render their content) until **both** `user` and `userProfile` are resolved (or we have explicitly decided “no profile” for this user, e.g. pending org).

- **Concrete:**
  1. **Guards:** Treat “user present but userProfile null” as **still loading**. For example: show loading when `loading || (user && !userProfile)` (or use a single “authReady” flag that is true only when we’re not in that state).
  2. **Index:** Keep current behaviour: redirect only when `!loading` and `user` and `userProfile` (and optionally require a small delay or “profile resolved” flag so we never redirect on a transient null profile).
  3. **AuthProvider:** Optionally expose an explicit `profileResolved: boolean` (true when either we have no user or we have finished the first profile fetch for the current user) and have guards + Index depend on that instead of only `loading`.

Implementing the guard change (1) ensures that RequireStaff and RequireClient never render their outlets/children while profile is still missing for the current user, removing the window where role is undefined and avoiding any possibility of “mount then correct” behaviour that could interact badly with Strict Mode or slow networks.
