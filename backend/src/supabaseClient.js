import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!process.env.SUPABASE_URL) {
  throw new Error('SUPABASE_URL missing in env');
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY missing in env');
}

if (process.env.NODE_ENV === 'development') {
  try {
    const host = supabaseUrl ? new URL(supabaseUrl).host : 'unknown';
    console.log('[SUPABASE] client ready (dev)', { host });
  } catch {
    console.log('[SUPABASE] client ready (dev)');
  }
}

export const supabase = createClient(
  supabaseUrl,
  supabaseServiceRoleKey
);

// Startup probe: fail-fast diagnostics for common Supabase misconfigurations.
// This does not block boot; it logs actionable hints when PostgREST rejects schema access.
void (async () => {
  try {
    const { error } = await supabase.from("organisations").select("id").limit(1);
    if (error) {
      const msg = String(error.message || "");
      if (/permission denied for schema public/i.test(msg)) {
        console.error(
          [
            "[SUPABASE] permission denied for schema public.",
            "This usually means one of:",
            "1) Supabase Dashboard → Project Settings → API → 'Exposed schemas' does NOT include 'public', OR",
            "2) DB grants for role 'service_role' were revoked in this project.",
            "Fix: Ensure 'public' is exposed in API settings, and/or run:",
            "  GRANT USAGE ON SCHEMA public TO service_role;",
            "  GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;",
            "  GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;",
            "Then restart the backend.",
          ].join("\n")
        );
      } else {
        console.warn("[SUPABASE] startup probe failed:", msg);
      }
    }
  } catch (err) {
    console.warn("[SUPABASE] startup probe exception:", err?.message || err);
  }
})();
