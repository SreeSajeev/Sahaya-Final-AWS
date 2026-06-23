import { supabase } from '../supabaseClient.js';
import { normalizeLocation } from '../utils/normalizeLocation.js';
import { applyPriorityToPatch } from '../utils/normalizeTicketPriority.js';
//working with tickets table
export async function findTicketByComplaintId(complaintId, organisationId = null) {
  if (!complaintId) return null;

  let query = supabase
    .from('tickets')
    .select('id')
    .eq('complaint_id', complaintId)
    .limit(1);
  if (organisationId) query = query.eq("organisation_id", organisationId);
  const { data, error } = await query.single();

  if (error && error.code !== 'PGRST116') {
  throw new Error(`ticketsRepo error: ${error.message}`);
}

  return data ?? null;
}

export async function findTicketByTicketNumber(ticketNumber, organisationId = null) {
  if (!ticketNumber || typeof ticketNumber !== 'string') return null;
  const trimmed = String(ticketNumber).trim();
  if (!trimmed) return null;

  let query = supabase
    .from('tickets')
    .select('id, status, complaint_id, vehicle_number, category, issue_type, location, short_description')
    .eq('ticket_number', trimmed)
    .limit(1);
  if (organisationId) query = query.eq("organisation_id", organisationId);
  const { data, error } = await query.maybeSingle();

  if (error) return null;
  return data ?? null;
}

export async function updateTicketStatus(ticketId, status, organisationId = null) {
  if (!ticketId || !status) return { error: new Error('Missing ticketId or status') };
  let query = supabase
    .from('tickets')
    .update({ status })
    .eq('id', ticketId);
  if (organisationId) query = query.eq("organisation_id", organisationId);
  return query;
}

export async function updateTicketFields(ticketId, fields, organisationId = null) {
  if (!ticketId || !fields || typeof fields !== 'object') return { error: new Error('Missing ticketId or fields') };
  const patch = { ...fields };
  if (Object.prototype.hasOwnProperty.call(patch, 'location')) {
    patch.location = normalizeLocation(patch.location);
  }
  if (
    Object.prototype.hasOwnProperty.call(patch, 'priority') ||
    Object.prototype.hasOwnProperty.call(patch, 'priority_level')
  ) {
    const result = applyPriorityToPatch(patch, {
      priority: patch.priority,
      priority_level: patch.priority_level,
      defaultLevel: 'LOW',
    });
    if (!result.ok) return { error: new Error(result.error) };
  }
  let query = supabase
    .from('tickets')
    .update(patch)
    .eq('id', ticketId);
  if (organisationId) query = query.eq("organisation_id", organisationId);
  return query;
}

export async function insertTicket(ticket) {
  const { data, error } = await supabase
    .from('tickets')
    .insert(ticket)
    .select()
    .single();

  if (error) {
    throw new Error(`Ticket insert failed: ${error.message}`);
  }

  return data;
}
