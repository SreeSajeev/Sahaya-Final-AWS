import { prisma } from "../db/prisma.js";
import { toSupabaseStyleError } from "./db/prismaErrors.js";

export async function findResolutionNotificationByTicketId(ticketId) {
  try {
    const row = await prisma.ticketResolutionNotification.findUnique({
      where: { ticketId },
      select: { ticketId: true },
    });
    return { data: row ? { ticket_id: row.ticketId } : null, error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function insertResolutionNotification(ticketId) {
  try {
    await prisma.ticketResolutionNotification.create({ data: { ticketId } });
    return { error: null };
  } catch (err) {
    return { error: toSupabaseStyleError(err) };
  }
}
