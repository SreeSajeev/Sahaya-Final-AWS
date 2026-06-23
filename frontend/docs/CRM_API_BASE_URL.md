# CRM API base URL resolution — resolved

This document describes how the Sahaya / Pariskq frontend chooses the **CRM REST API** origin (`https://api…` vs `http://localhost:3000`), why production briefly broke after login, and how it was stabilized.

**Status:** Resolved and documented for operators and future debugging.

---

## Summary

- All authenticated and most public CRM calls go through `**fetchJson` / `fetchPublicJson`** in `src/lib/backendDataApi.ts`, which always prefix paths with `**crmApiUrl()`** from `**src/lib/crmApiConfig.ts`**.
- The failing symptom was `**http://localhost:3000/auth/me**` (and similar) **from the production website hostname**, so hydration after Supabase login could not load `**public.users`** via the backend.
- **Root cause class:** the **compiled bundle** sometimes behaved like a **development** build regarding `**import.meta.env.PROD`**, or env injection failed at build time, so `**getCrmApiBase()`** fell through to `**CRM_API_DEVELOPMENT_FALLBACK**` (`http://localhost:3000`) even when the user opened `**https://sahaya.pariskq.in**`.

**Stabilization (minimal fix):** `**getCrmApiBase()`** now treats **any browser hostname other than `localhost` / `127.0.0.1`** as “not local dev” and uses `**CRM_API_PRODUCTION_FALLBACK**` when `**VITE_CRM_API_URL**` is unset. That prevents deployed sites from ever defaulting to localhost for the CRM API.

---

## Request path (for audits)


| Step | Location                                         | Role                                                             |
| ---- | ------------------------------------------------ | ---------------------------------------------------------------- |
| 1    | `src/hooks/useAuth.tsx` (and many other modules) | Calls `fetchJson('/auth/me')`, etc. — **relative path only**.    |
| 2    | `src/lib/backendDataApi.ts`                      | `fetch(crmApiUrl(path), …)` — **always** uses CRM base resolver. |
| 3    | `src/lib/crmApiConfig.ts`                        | `crmApiUrl(path)` → `${getCrmApiBase()}${path}`.                 |


There is **no** parallel “relative fetch to `window.location`” for these APIs in the standard auth flow. If DevTools shows `**localhost:3000`**, the base from `**getCrmApiBase()`** was wrong, not `fetchJson` ignoring config.

---

## Resolution order (`getCrmApiBase`)

Implemented in `**src/lib/crmApiConfig.ts**`.

1. `**VITE_CRM_API_URL**` (non-empty after trim)
  - Set at **build time** in CI (e.g. Vercel) or in `**.env` / `.env.local`** locally.  
  - **Always wins** when present.
2. **Browser safety (when `window` is defined)**
  - If `**window.location.hostname`** is **not** `localhost` and **not** `127.0.0.1` → use `**https://api.sahaya.pariskq.in`** (`CRM_API_PRODUCTION_FALLBACK`).  
  - Ensures **production / preview / any deployed hostname** does not fall back to localhost when the env var is missing.
3. **Development fallback**
  - `**http://localhost:3000`** (`CRM_API_DEVELOPMENT_FALLBACK`) when:  
    - env is unset **and** (hostname is `localhost` / `127.0.0.1` **or** code runs without `window`).

Constants:

- `CRM_API_PRODUCTION_FALLBACK` — `https://api.sahaya.pariskq.in`
- `CRM_API_DEVELOPMENT_FALLBACK` — `http://localhost:3000`

---

## Environment variables


| Variable               | When to set                                                                    | Effect                                            |
| ---------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------- |
| `**VITE_CRM_API_URL`** | Local dev (optional if API is on localhost:3000), **always recommended in CI** | Forces exact API origin; overrides all fallbacks. |


**Vite rule:** Only variables prefixed with `**VITE_`** are exposed to the client bundle. Values are **frozen at build time**, not read from the server at runtime.

Files (typical):

- **Local:** `.env.development` (used by `vite dev`), `.env.production` (used by `vite build`), `.env.local` (gitignored overrides).  
- **Hosted:** platform “Environment Variables” for the **Production** (and Preview if needed) build.

---

## Local development

- Open the app at `**http://localhost:8080`** (or whatever port Vite uses) with hostname `**localhost`** → without `VITE_CRM_API_URL`, CRM calls target `**http://localhost:3000`** (your local API).
- To point local UI at **remote** API: set `**VITE_CRM_API_URL=https://api.sahaya.pariskq.in`** in `.env.development` or `.env.local`.

---

## Production & preview deployments

- **Production (`sahaya.pariskq.in`):** Even if a build mis-reports dev/prod flags, **non-localhost hostname** forces `**https://api.sahaya.pariskq.in`** when env is absent.  
- **Preview (e.g. `*.vercel.app`):** Same rule — previews use **production CRM fallback** unless `**VITE_CRM_API_URL`** is set to a staging API.

**Recommendation:** Still set `**VITE_CRM_API_URL`** explicitly in CI for every environment so behavior does not depend on fallbacks.

---

## Content-Security-Policy note

`vercel.json` (and possibly `index.html` meta CSP) includes `connect-src` entries for `**https://api.sahaya.pariskq.in`** and localhost. If you change the API origin, update CSP to match or the browser will block `fetch`.

---

## Edge cases


| Scenario                                                    | Behavior                                                                                                                                                                                                                         |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `**VITE_CRM_API_URL` set**                                  | Always that URL (staging, custom domain, etc.).                                                                                                                                                                                  |
| `**vite` / `vite preview` via `localhost` or `127.0.0.1`**  | Dev fallback to `**http://localhost:3000`** if env unset.                                                                                                                                                                        |
| `**vite --host` then open via LAN IP** (e.g. `192.168.x.x`) | Hostname is **not** localhost → **production fallback** unless env is set. For LAN device testing against local API, set `**VITE_CRM_API_URL=http://<your-lan-ip>:3000`** or use `localhost` on the machine running the browser. |
| **IPv6 localhost `[::1]`**                                  | Not treated as local by hostname check → **production fallback** if env unset (rare).                                                                                                                                            |
| **No `window` (Node / tests)**                              | Falls through to **development fallback** if env unset; pure SPA rarely hits this at runtime.                                                                                                                                    |


---

## Debugging checklist (if CRM calls fail again)

1. **Network tab:** full URL for `/auth/me` — confirm host is the intended API.
2. **Sources / search built chunk** for `localhost:3000` vs `api.sahaya.pariskq.in` after deploy.
3. **CI:** confirm build command is `**npm run build`** / `**vite build`**, not a long-running dev server as “production”.
4. **Env:** confirm `**VITE_CRM_API_URL`** for the environment that performed the build.
5. **CSP:** confirm `connect-src` allows the API host.

---

## Related code (read-only reference)

- `src/lib/crmApiConfig.ts` — `getCrmApiBase`, `crmApiUrl`, dev-only log `[CRM API] base URL: …`
- `src/lib/backendDataApi.ts` — `fetchJson`, `fetchPublicJson`, `postFeProofPublic`

## Related docs

- `docs/AUTH_RACE_CONDITION_ANALYSIS.md` — broader auth timing notes (if present)
- `docs/ROLE_REDIRECT_DEBUGGING.md` — post-login redirects vs `users.role`

---

*Last updated: documents the production auth / CRM URL issue and its stabilization.*