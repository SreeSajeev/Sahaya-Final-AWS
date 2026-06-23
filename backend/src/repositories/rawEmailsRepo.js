import { supabase } from '../supabaseClient.js';
import { hasPublicColumn } from '../services/schemaCompatService.js';

const STALE_PROCESSING_MINUTES = Math.min(
  240,
  Math.max(5, Number(process.env.RAW_EMAIL_STALE_PROCESSING_MINUTES) || 30)
);

export async function fetchPendingRawEmails(limit = 10, organisationId = null) {
  let query = supabase
    .from('raw_emails')
    .select('*')
    .or('processing_status.is.null,processing_status.eq.PENDING')
    .order('created_at')
    .limit(limit);
  if (organisationId) query = query.eq("organisation_id", organisationId);
  return query;
}

/**
 * Requeue rows stuck in PROCESSING (worker crash / deploy mid-flight).
 * Uses processing_claimed_at when present; otherwise skips.
 */
export async function requeueStaleProcessingRawEmails(maxAgeMinutes = STALE_PROCESSING_MINUTES) {
  const hasClaimedAt = await hasPublicColumn('raw_emails', 'processing_claimed_at');
  if (!hasClaimedAt) return { requeued: 0, error: null };

  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('raw_emails')
    .update({ processing_status: 'PENDING', processing_claimed_at: null })
    .eq('processing_status', 'PROCESSING')
    .lt('processing_claimed_at', cutoff)
    .select('id');

  if (error) {
    console.error('[rawEmailsRepo] requeue stale PROCESSING failed:', error.message);
    return { requeued: 0, error };
  }
  return { requeued: (data || []).length, error: null };
}

/**
 * Atomically claim a PENDING raw_email for this worker (prevents duplicate processing).
 * @returns {{ claimed: boolean, row: object | null, error: object | null }}
 */
export async function claimRawEmailForProcessing(id, organisationId = null) {
  const hasClaimedAt = await hasPublicColumn('raw_emails', 'processing_claimed_at');
  const nowIso = new Date().toISOString();
  const payload = { processing_status: 'PROCESSING' };
  if (hasClaimedAt) payload.processing_claimed_at = nowIso;

  let query = supabase
    .from('raw_emails')
    .update(payload)
    .eq('id', id)
    .or('processing_status.is.null,processing_status.eq.PENDING')
    .select('*')
    .maybeSingle();

  if (organisationId) {
    query = query.eq('organisation_id', organisationId);
  }

  const { data, error } = await query;
  if (error) {
    console.error(`[rawEmailsRepo] claim failed raw_email ${id}:`, error.message);
    return { claimed: false, row: null, error };
  }
  return { claimed: Boolean(data), row: data ?? null, error: null };
}

export async function updateRawEmailStatus(id, status, extra = {}) {
  const hasOrgColumn = await hasPublicColumn("raw_emails", "organisation_id");
  const payload = { processing_status: status, ...extra };
  const scopedOrganisationId = payload.organisation_id ?? null;
  if (!hasOrgColumn && Object.prototype.hasOwnProperty.call(payload, "organisation_id")) {
    delete payload.organisation_id;
  }

  let query = supabase.from('raw_emails').update(payload).eq('id', id);
  if (hasOrgColumn && scopedOrganisationId) {
    query = query.eq("organisation_id", scopedOrganisationId);
  }
  const { error } = await query;

  if (error) {
    console.error(`❌ Failed to update raw_email ${id} status to ${status}:`, error);
  }

  return { error };
}
