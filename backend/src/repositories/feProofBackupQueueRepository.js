import { prisma } from "../db/prisma.js";
import { mapPrismaRowsToSnake } from "./db/rowMapper.js";
import { toSupabaseStyleError } from "./db/prismaErrors.js";

export async function listProofBackupQueueBatch({ limit, tenantId, hasOrgOnQueue }) {
  try {
    const rows = await prisma.feProofBackupQueue.findMany({
      where: {
        ...(hasOrgOnQueue && tenantId ? { organisationId: tenantId } : {}),
        ...(hasOrgOnQueue && !tenantId ? { organisationId: null } : {}),
      },
      select: {
        id: true,
        ticketCommentId: true,
        ticketId: true,
        actionType: true,
      },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    return { data: mapPrismaRowsToSnake(rows), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function deleteProofBackupQueueRow(id, { tenantId, hasOrgOnQueue } = {}) {
  try {
    await prisma.feProofBackupQueue.deleteMany({
      where: {
        id,
        ...(hasOrgOnQueue && tenantId ? { organisationId: tenantId } : {}),
      },
    });
    return { error: null };
  } catch (err) {
    return { error: toSupabaseStyleError(err) };
  }
}
