/**
 * Temporary TEST migration safety: block mutations against the shared Supabase project.
 *
 * Default: OFF (mutations allowed) — production-safe unless explicitly enabled.
 * Enable only on TEST: SHARED_SUPABASE_MUTATIONS_DISABLED=true
 *
 * Does NOT modify the shared Supabase project itself.
 */

export const SHARED_SUPABASE_MUTATION_FREEZE_CODE = "SHARED_SUPABASE_MUTATIONS_DISABLED";

export const SHARED_SUPABASE_MUTATION_FREEZE_MESSAGE =
  "This action is temporarily disabled in the Sahaya test environment while shared Supabase dependencies are being migrated.";

/**
 * @returns {boolean}
 */
export function areSharedSupabaseMutationsDisabled() {
  return String(process.env.SHARED_SUPABASE_MUTATIONS_DISABLED || "")
    .trim()
    .toLowerCase() === "true";
}

/**
 * @returns {{ blocked: true, message: string, code: string } | null}
 */
export function sharedSupabaseMutationBlock() {
  if (!areSharedSupabaseMutationsDisabled()) return null;
  return {
    blocked: true,
    message: SHARED_SUPABASE_MUTATION_FREEZE_MESSAGE,
    code: SHARED_SUPABASE_MUTATION_FREEZE_CODE,
  };
}
