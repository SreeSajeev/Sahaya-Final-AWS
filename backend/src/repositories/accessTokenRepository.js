import { prisma } from "../db/prisma.js";
import { mapPrismaRowToSnake } from "./db/rowMapper.js";
import { toSupabaseStyleError } from "./db/prismaErrors.js";

export async function findAccessTokenByHash(tokenHash) {
  try {
    const row = await prisma.accessToken.findFirst({ where: { tokenHash } });
    return { data: mapPrismaRowToSnake(row), error: null };
  } catch (err) {
    return { data: null, error: toSupabaseStyleError(err) };
  }
}
