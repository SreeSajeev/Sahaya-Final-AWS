import { supabase } from '../supabaseClient.js';

export async function insertParsedEmail(data, organisationId = null) {
  const { contact_number, ...rest } = data;
  if (organisationId && !rest.organisation_id) rest.organisation_id = organisationId;
  return supabase
    .from('parsed_emails')
    .insert(rest)
    .select()
    .single();
}

export async function markParsedAsTicketed(id, organisationId = null) {
  let query = supabase
    .from('parsed_emails')
    .update({ ticket_created: true })
    .eq('id', id);
  if (organisationId) query = query.eq("organisation_id", organisationId);
  return query;
}

/**
 * 🔹 REQUIRED by autoTicketWorker
 */
export async function fetchUnprocessedParsedEmails(limit = 10, organisationId = null) {
  let query = supabase
    .from('parsed_emails')
    .select('*, raw_emails(*)')
    .eq('ticket_created', false)
    .order('created_at')
    .limit(limit);
  if (organisationId) query = query.eq("organisation_id", organisationId);

  const { data, error } = await query;

  if (error) {
    console.error('❌ fetchUnprocessedParsedEmails error:', error);
    return [];
  }

  return data || [];
}
