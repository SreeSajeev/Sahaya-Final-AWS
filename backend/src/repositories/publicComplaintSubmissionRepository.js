import { prisma } from "../db/prisma.js";
import { mapPrismaRowsToSnake } from "./db/rowMapper.js";
import { toSupabaseStyleError } from "./db/prismaErrors.js";

export async function listPublicSubmissionsByTicketIds(organisationId, ticketIds) {
  try {
    const rows = await prisma.publicComplaintSubmission.findMany({
      where: {
        organisationId,
        ticketId: { in: ticketIds },
      },
      select: {
        ticketId: true,
        reporterName: true,
        reporterMobile: true,
        organisationId: true,
      },
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}
