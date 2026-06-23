import { insertEmailComment } from '../repositories/commentRepository.js';

export async function addEmailComment(ticketId, text) {
  if (!ticketId) {
    return { data: null, error: new Error('Missing ticketId in addEmailComment') };
  }

  const body = text != null ? String(text) : '';

  return insertEmailComment(ticketId, body);
}
