/**
 * Backward-compatible ticket repository exports (worker + ticketService).
 * Implementation lives in ticketQueryRepository.js (dual-path supabase/prisma).
 */
export {
  findTicketByComplaintId,
  findTicketByTicketNumber,
  updateTicketStatus,
  updateTicketFields,
  insertTicket,
} from "./ticketQueryRepository.js";
