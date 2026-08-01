import dotenv from "dotenv";
dotenv.config();

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!process.env.SUPABASE_URL) {
  throw new Error("SUPABASE_URL missing in env");
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY missing in env");
}

if (process.env.NODE_ENV === "development") {
  try {
    const host = supabaseUrl ? new URL(supabaseUrl).host : "unknown";
    console.log("[SUPABASE_AUTH] client ready (dev)", { host });
  } catch {
    console.log("[SUPABASE_AUTH] client ready (dev)");
  }
}

/** Supabase client for auth.admin and storage only — no database access in application code. */
export const supabaseAuth = createClient(supabaseUrl, supabaseServiceRoleKey);
