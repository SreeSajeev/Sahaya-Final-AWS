/** Must match backend `PUBLIC_COMPLAINTS_ENABLED=true`. */
export function isPublicComplaintsEnabled(): boolean {
  return String(import.meta.env.VITE_PUBLIC_COMPLAINTS_ENABLED ?? "")
    .trim()
    .toLowerCase() === "true";
}

/** When false, complaint form stays in Phase 5 draft-only mode (submit disabled). */
export function isPublicSubmitEnabled(): boolean {
  return (
    isPublicComplaintsEnabled() &&
    String(import.meta.env.VITE_PUBLIC_SUBMIT_ENABLED ?? "")
      .trim()
      .toLowerCase() === "true"
  );
}
