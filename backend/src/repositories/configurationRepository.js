import { supabase } from "../supabaseClient.js";
import { prisma } from "../db/prisma.js";
import { isPrismaDbMode } from "./db/mode.js";
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
  if (isPrismaDbMode()) {
    try {
      const row = await prisma.configuration.findUnique({ where: { key } });
      return { data: mapPrismaRowToSnake(row), error: null };
    } catch (err) {
      return { data: null, error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("configurations").select("key, value, updated_at").eq("key", key).maybeSingle();
}

export async function configurationKeyExists(key) {
  if (isPrismaDbMode()) {
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
  return supabase.from("configurations").select("key").eq("key", key).maybeSingle();
}

export async function listConfigurationsByKeys(keys) {
  if (isPrismaDbMode()) {
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
  return supabase.from("configurations").select("key, value").in("key", keys);
}

export async function listAllConfigurations(limit = 500) {
  if (isPrismaDbMode()) {
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
  return supabase.from("configurations").select("*").order("key", { ascending: true }).limit(limit);
}

export async function listSlaConfigurationKeys(keys) {
  return listConfigurationsByKeys(keys);
}

export async function updateConfigurationByKey(key, value, updatedAt) {
  if (isPrismaDbMode()) {
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
  return supabase.from("configurations").update({ value, updated_at: updatedAt }).eq("key", key);
}

export async function insertConfiguration(key, value, updatedAt) {
  if (isPrismaDbMode()) {
    try {
      await prisma.configuration.create({
        data: { key, value, updatedAt: new Date(String(updatedAt)) },
      });
      return { error: null };
    } catch (err) {
      return { error: toSupabaseStyleError(err) };
    }
  }
  return supabase.from("configurations").insert({ key, value, updated_at: updatedAt });
}

export async function upsertConfiguration(key, value, updatedAt) {
  const { data: existing, error: exErr } = await configurationKeyExists(key);
  if (exErr) return { error: exErr };
  if (existing?.key) {
    return updateConfigurationByKey(key, value, updatedAt);
  }
  return insertConfiguration(key, value, updatedAt);
}
