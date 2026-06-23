import { PrismaClient } from "@prisma/client";

/**
 * Singleton PrismaClient for Node (Express + workers).
 * Prevents exhausting connections in dev when modules hot-reload.
 */
const globalForPrisma = globalThis;

/** @type {PrismaClient | undefined} */
export const prisma = globalForPrisma.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__prisma = prisma;
}
