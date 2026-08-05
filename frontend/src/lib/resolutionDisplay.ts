/**
 * Helpers for displaying resolution category values in reports/analytics.
 * When category is OTHER, custom details are persisted in verification_remarks
 * (optionally followed by \n\n + optional staff remarks).
 */

export const RESOLUTION_CATEGORY_OTHER = "OTHER" as const;

/** Extract free-text details entered when resolution category is Other. */
export function extractResolutionOtherDetails(
  resolutionCategory: string | null | undefined,
  verificationRemarks: string | null | undefined
): string {
  const cat = String(resolutionCategory ?? "").trim().toUpperCase();
  if (cat !== RESOLUTION_CATEGORY_OTHER) return "";
  const remarks = String(verificationRemarks ?? "").trim();
  if (!remarks) return "";
  // Close flow stores: `${otherDetails}\n\n${optionalRemarks}` when remarks exist
  const firstPart = remarks.split(/\n\n/)[0]?.trim() ?? remarks;
  return firstPart;
}

/**
 * Display label for resolution category.
 * OTHER → "Other: <custom details>" when details exist, else "Other".
 */
export function formatResolutionCategoryDisplay(
  resolutionCategory: string | null | undefined,
  verificationRemarks: string | null | undefined
): string {
  const raw = String(resolutionCategory ?? "").trim();
  if (!raw) return "";
  if (raw.toUpperCase() === RESOLUTION_CATEGORY_OTHER) {
    const details = extractResolutionOtherDetails(raw, verificationRemarks);
    return details ? `Other: ${details}` : "Other";
  }
  return raw;
}
