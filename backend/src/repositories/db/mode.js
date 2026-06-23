import { resolveDbMode } from "../../config/appConfig.js";

/** @returns {boolean} */
export function isPrismaDbMode() {
  return resolveDbMode() === "prisma";
}

/** @returns {boolean} */
export function isSupabaseDbMode() {
  const mode = resolveDbMode();
  return mode === "supabase" || mode === "shadow_pg" || mode === "shadow_prisma";
}
