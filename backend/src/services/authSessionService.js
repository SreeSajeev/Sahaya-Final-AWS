import { prisma } from "../db/prisma.js";
import { mapPrismaRowToSnake } from "../repositories/db/rowMapper.js";
import { toSupabaseStyleError } from "../repositories/db/prismaErrors.js";
import {
  generateOpaqueToken,
  getRefreshTtlSec,
  hashOpaqueToken,
} from "./jwtAccessService.js";

export async function createAuthSession({ userId, userAgent = null, ipHash = null }) {
  const rawRefresh = generateOpaqueToken(48);
  const refreshTokenHash = hashOpaqueToken(rawRefresh);
  const expiresAt = new Date(Date.now() + getRefreshTtlSec() * 1000);
  try {
    const row = await prisma.authSession.create({
      data: {
        userId,
        refreshTokenHash,
        expiresAt,
        userAgent: userAgent ? String(userAgent).slice(0, 512) : null,
        ipHash: ipHash ? String(ipHash).slice(0, 128) : null,
      },
    });
    return {
      data: { session: mapPrismaRowToSnake(row), rawRefresh },
      error: null,
    };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function findAuthSessionByRawRefresh(rawRefresh) {
  const refreshTokenHash = hashOpaqueToken(rawRefresh);
  try {
    const row = await prisma.authSession.findUnique({ where: { refreshTokenHash } });
    return { data: mapPrismaRowToSnake(row), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function rotateAuthSession({ sessionId, userId, userAgent = null, ipHash = null }) {
  const rawRefresh = generateOpaqueToken(48);
  const refreshTokenHash = hashOpaqueToken(rawRefresh);
  const expiresAt = new Date(Date.now() + getRefreshTtlSec() * 1000);
  try {
    const created = await prisma.$transaction(async (tx) => {
      const existing = await tx.authSession.findUnique({ where: { id: sessionId } });
      if (!existing || existing.userId !== userId) {
        throw Object.assign(new Error("Session not found"), { code: "SESSION_NOT_FOUND" });
      }
      if (existing.revokedAt) {
        throw Object.assign(new Error("Session revoked"), { code: "SESSION_REVOKED" });
      }
      if (existing.expiresAt.getTime() < Date.now()) {
        throw Object.assign(new Error("Session expired"), { code: "SESSION_EXPIRED" });
      }

      const next = await tx.authSession.create({
        data: {
          userId,
          refreshTokenHash,
          expiresAt,
          userAgent: userAgent ? String(userAgent).slice(0, 512) : existing.userAgent,
          ipHash: ipHash ? String(ipHash).slice(0, 128) : existing.ipHash,
        },
      });

      await tx.authSession.update({
        where: { id: sessionId },
        data: {
          revokedAt: new Date(),
          replacedById: next.id,
          lastUsedAt: new Date(),
        },
      });

      return next;
    });
    return { data: { session: mapPrismaRowToSnake(created), rawRefresh }, error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function revokeAuthSessionByRawRefresh(rawRefresh) {
  const refreshTokenHash = hashOpaqueToken(rawRefresh);
  try {
    await prisma.authSession.updateMany({
      where: { refreshTokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { error: null };
  } catch (err) {
    return { error: toSupabaseStyleError(err) };
  }
}

export async function revokeAllAuthSessionsForUser(userId) {
  try {
    await prisma.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { error: null };
  } catch (err) {
    return { error: toSupabaseStyleError(err) };
  }
}

export async function touchAuthSession(sessionId) {
  try {
    await prisma.authSession.update({
      where: { id: sessionId },
      data: { lastUsedAt: new Date() },
    });
  } catch {
    /* ignore */
  }
}
