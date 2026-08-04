import crypto from "node:crypto";
import { prisma } from "../db/prisma.js";
import { mapPrismaRowToSnake } from "../repositories/db/rowMapper.js";
import { toSupabaseStyleError } from "../repositories/db/prismaErrors.js";
import {
  generateOpaqueToken,
  getPasswordResetTtlSec,
  hashOpaqueToken,
} from "./jwtAccessService.js";

export async function createPasswordResetToken(userId) {
  const raw = generateOpaqueToken(32);
  const tokenHash = hashOpaqueToken(raw);
  const expiresAt = new Date(Date.now() + getPasswordResetTtlSec() * 1000);
  try {
    await prisma.passwordResetToken.create({
      data: { userId, tokenHash, expiresAt },
    });
    return { data: { raw, expiresAt }, error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export async function consumePasswordResetToken(rawToken) {
  const tokenHash = hashOpaqueToken(rawToken);
  try {
    const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!row) return { data: null, error: { message: "Invalid or expired reset token", code: "RESET_INVALID" } };
    if (row.usedAt) {
      return { data: null, error: { message: "Reset token already used", code: "RESET_USED" } };
    }
    if (row.expiresAt.getTime() < Date.now()) {
      return { data: null, error: { message: "Reset token expired", code: "RESET_EXPIRED" } };
    }
    await prisma.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    });
    return { data: mapPrismaRowToSnake(row), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}

export function hashIp(ip) {
  if (!ip) return null;
  return crypto.createHash("sha256").update(String(ip)).digest("hex").slice(0, 64);
}
