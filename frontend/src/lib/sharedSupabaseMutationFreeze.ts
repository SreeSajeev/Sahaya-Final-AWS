/**
 * Temporary TEST migration safety: block browser-side mutations against the shared Supabase project.
 *
 * Default: OFF. Enable only on TEST builds:
 *   VITE_SHARED_SUPABASE_MUTATIONS_DISABLED=true
 *
 * Build-time: Vite inlines this at `npm run build`. Must be set in the TEST frontend
 * env used for that build (EC2 `frontend/.env`). deploy-test.yml does not set it today.
 */

export const SHARED_SUPABASE_MUTATION_FREEZE_CODE = "SHARED_SUPABASE_MUTATIONS_DISABLED";

export const SHARED_SUPABASE_MUTATION_FREEZE_MESSAGE =
  "This action is temporarily disabled in the Sahaya test environment while shared Supabase dependencies are being migrated.";

export function areSharedSupabaseMutationsDisabled(): boolean {
  return (
    String(import.meta.env.VITE_SHARED_SUPABASE_MUTATIONS_DISABLED ?? "")
      .trim()
      .toLowerCase() === "true"
  );
}

/** Throws when freeze is active. Call immediately before any mutating Supabase client method. */
export function guardSharedSupabaseMutation(_operation?: string): void {
  if (areSharedSupabaseMutationsDisabled()) {
    throw new Error(SHARED_SUPABASE_MUTATION_FREEZE_MESSAGE);
  }
}
