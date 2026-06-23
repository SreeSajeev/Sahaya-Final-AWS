# Password reset (Postmark + redirects)

**Full documentation:** [`../docs/PASSWORD_RESET_IMPLEMENTATION.md`](../docs/PASSWORD_RESET_IMPLEMENTATION.md)

That document covers:

- End-to-end flow and diagrams
- Postmark vs Supabase email change
- Localhost redirect fix
- All files changed (frontend + backend)
- API reference (`POST /auth/public/forgot-password`)
- Environment variables and Supabase dashboard settings
- Verification, troubleshooting, and rollback

## Quick ops checklist

**Backend `.env`:**

```bash
NODE_ENV=production
APP_BASE_URL=https://sahaya.pariskq.in
POSTMARK_SERVER_TOKEN=...
PASSWORD_RESET_REDIRECT_URL=https://sahaya.pariskq.in/reset-password  # optional
```

**Frontend build:**

```bash
VITE_APP_BASE_URL=https://sahaya.pariskq.in
```

**Supabase:** Site URL + redirect allowlist for `https://sahaya.pariskq.in/reset-password`

**Logs:** `auth.forgotPassword.sent` with `redirectHost: sahaya.pariskq.in` (no tokens logged).
