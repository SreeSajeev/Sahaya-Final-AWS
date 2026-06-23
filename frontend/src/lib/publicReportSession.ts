import type { PublicComplaintPointContext } from "@/lib/publicComplaintApi";

const STORAGE_PREFIX = "sahaya_public_report:";

export type PublicComplaintFormDraft = {
  reporter_name: string;
  category: string;
  issue_type: string;
  custom_category: string;
  custom_issue_type: string;
  description: string;
  location: string;
  vehicle_number: string;
  complaint_id: string;
  /** Metadata only — files stay in memory until Phase 6 upload. */
  attachment_meta: { name: string; size: number; type: string }[];
};

export type PublicReportSession = {
  publicToken: string;
  complaintPointContext: PublicComplaintPointContext;
  otpSessionId?: string;
  otpExpiresAt?: string;
  verificationToken?: string;
  verifiedAt?: string;
  verificationExpiresAt?: string;
  mobileLast4?: string;
  reporterName?: string;
  formDraft?: PublicComplaintFormDraft;
};

/** Shown on success after real submit (Phase 6.2+); not persisted after session clear. */
export type PublicSubmitSuccess = {
  ticket_number: string;
  complaint_id: string | null;
  reporter_name: string;
  submitted_at: string;
  status: string;
  idempotent?: boolean;
};

function storageKey(publicToken: string) {
  return `${STORAGE_PREFIX}${publicToken}`;
}

export function loadPublicReportSession(publicToken: string): PublicReportSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(storageKey(publicToken));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PublicReportSession;
    if (parsed?.publicToken !== publicToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function savePublicReportSession(session: PublicReportSession): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(storageKey(session.publicToken), JSON.stringify(session));
  } catch {
    /* quota exceeded — caller may surface UX */
  }
}

export function clearPublicReportSession(publicToken: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(storageKey(publicToken));
  } catch {
    /* ignore */
  }
}

/** Remove OTP / verification fields from a session (memory + storage). */
export function stripVerificationFields(session: PublicReportSession): PublicReportSession {
  return {
    ...session,
    verificationToken: undefined,
    verifiedAt: undefined,
    verificationExpiresAt: undefined,
    otpSessionId: undefined,
    otpExpiresAt: undefined,
  };
}

/**
 * Clear verification state in sessionStorage and return the updated session.
 */
export function clearVerificationSession(
  publicToken: string,
  base?: PublicReportSession | null
): PublicReportSession | null {
  const existing = base ?? loadPublicReportSession(publicToken);
  if (!existing) return null;
  const cleared = stripVerificationFields(existing);
  savePublicReportSession(cleared);
  return cleared;
}

export function mergePublicReportSession(
  publicToken: string,
  patch: Partial<PublicReportSession>
): PublicReportSession | null {
  const existing = loadPublicReportSession(publicToken);
  if (!existing && !patch.complaintPointContext) return null;
  const next: PublicReportSession = {
    ...(existing ?? {
      publicToken,
      complaintPointContext: patch.complaintPointContext!,
    }),
    ...patch,
    publicToken,
  };
  savePublicReportSession(next);
  return next;
}

/** Build default location string from complaint point context. */
export function buildDefaultLocation(ctx: PublicComplaintPointContext): string {
  const parts = [ctx.site_name, ctx.building, ctx.floor].filter(
    (p) => p != null && String(p).trim() !== ""
  );
  return parts.join(", ");
}

export function formatMobileDisplay(last4: string | null | undefined): string {
  if (!last4) return "**********";
  return `******${last4}`;
}

/** Persist in-progress form fields (no file blobs). */
export function saveFormDraftAutosave(
  publicToken: string,
  draft: Omit<PublicComplaintFormDraft, "attachment_meta"> & {
    attachment_meta?: PublicComplaintFormDraft["attachment_meta"];
  }
): void {
  const existing = loadPublicReportSession(publicToken);
  if (!existing?.verificationToken) return;
  mergePublicReportSession(publicToken, {
    formDraft: {
      ...draft,
      attachment_meta: draft.attachment_meta ?? existing.formDraft?.attachment_meta ?? [],
    },
  });
}
