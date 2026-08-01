import { prisma } from "../db/prisma.js";
import { mapPrismaRowToSnake, mapPrismaRowsToSnake } from "./db/rowMapper.js";
import { toSupabaseStyleError } from "./db/prismaErrors.js";

const CONFIG_SNAKE_TO_CAMEL = {
  key: "key",
  value: "value",
  updated_at: "updatedAt",
};

function configPatchToPrisma(patch) {
  /** @type {Record<string, unknown>} */
  const data = {};
  for (const [snake, camel] of Object.entries(CONFIG_SNAKE_TO_CAMEL)) {
    if (!Object.prototype.hasOwnProperty.call(patch, snake)) continue;
    const v = patch[snake];
    if (snake === "updated_at" && v != null) {
      data[camel] = new Date(String(v));
    } else {
      data[camel] = v;
    }
  }
  return data;
}

export async function getConfigurationByKey(key) {
  
    try {
      const row = await prisma.configuration.findUnique({ where: { key } });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function configurationKeyExists(key) {
  
    try {
      const row = await prisma.configuration.findUnique({
        where: { key },
        select: { key: true },
      });
      return { data: row ? { key: row.key } : null, error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function listConfigurationsByKeys(keys) {
  
    try {
      const rows = await prisma.configuration.findMany({
        where: { key: { in: keys } },
        select: { key: true, value: true },
      });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function listAllConfigurations(limit = 500) {
  
    try {
      const rows = await prisma.configuration.findMany({
        orderBy: { key: "asc" },
        take: limit,
      });
      return { data: mapPrismaRowsToSnake(rows), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
}

export async function listSlaConfigurationKeys(keys) {
  return listConfigurationsByKeys(keys);
}

export async function updateConfigurationByKey(key, value, updatedAt) {
  
    try {
      await prisma.configuration.update({
        where: { key },
        data: { value, updatedAt: new Date(String(updatedAt)) },
      });
      return { error: null };
    } catch (err) {
      return { error: toSupabaseStyleError(err) };
    }
}

export async function insertConfiguration(key, value, updatedAt) {
  
    try {
      await prisma.configuration.create({
        data: { key, value, updatedAt: new Date(String(updatedAt)) },
      });
      return { error: null };
    } catch (err) {
      return { error: toSupabaseStyleError(err) };
    }
}

export async function upsertConfiguration(key, value, updatedAt) {
  const { data: existing, error: exErr } = await configurationKeyExists(key);
  if (exErr) return { error: exErr };
  if (existing?.key) {
    return updateConfigurationByKey(key, value, updatedAt);
  }
  return insertConfiguration(key, value, updatedAt);
}
