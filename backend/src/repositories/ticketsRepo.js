/**
 * Backward-compatible ticket repository exports (worker + ticketService).
 */
export {
  findTicketByComplaintId,
  findTicketByTicketNumber,
  updateTicketStatus,
  updateTicketFields,
  insertTicket,
} from "./ticketQueryRepository.js";
