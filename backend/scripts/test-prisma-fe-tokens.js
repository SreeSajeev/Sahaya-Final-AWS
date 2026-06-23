/**
 * Phase 5 smoke test: fe_action_tokens + configurations via Prisma (AWS PostgreSQL).
 *
 * Usage:
 *   DB_MODE=prisma DATABASE_URL="postgresql://..." node scripts/test-prisma-fe-tokens.js
 *
 * Optional env:
 *   TEST_TICKET_ID  — existing ticket UUID for token create/lookup
 *   TEST_FE_ID      — existing field_executive UUID for token create
 *   TEST_TOKEN_ID   — existing fe_action_tokens.id for lookup
 *   TEST_CONFIG_KEY — configuration key (default: assignment_sla_hours)
 */

import dotenv from "dotenv";
dotenv.config();

import { resolveDbMode } from "../src/config/appConfig.js";
import {
  insertFeActionTokenReturning,
  getFeActionTokenById,
} from "../src/repositories/feActionTokenRepository.js";
import {
  getConfigurationByKey,
  upsertConfiguration,
} from "../src/repositories/configurationRepository.js";

function ok(label, detail = "") {
  console.log(`[ok] ${label}${detail ? `: ${detail}` : ""}`);
}

function fail(label, err) {
  console.error(`[fail] ${label}:`, err?.message || err);
  process.exitCode = 1;
}

async function main() {
  const mode = resolveDbMode();
  if (mode !== "prisma") {
    console.error(`[abort] DB_MODE must be prisma (got: ${mode})`);
    process.exit(1);
  }
  ok("DB_MODE", mode);

  const configKey = process.env.TEST_CONFIG_KEY || "assignment_sla_hours";

  const { data: cfgBefore, error: cfgReadErr } = await getConfigurationByKey(configKey);
  if (cfgReadErr) fail("configuration read", cfgReadErr);
  else ok("configuration read", cfgBefore?.key || `${configKey} (missing)`);

  const testValue =
    cfgBefore?.value != null && typeof cfgBefore.value === "object"
      ? { ...cfgBefore.value, _prisma_test: Date.now() }
      : { value: cfgBefore?.value ?? 4, _prisma_test: Date.now() };

  const updatedAt = new Date().toISOString();
  const { error: cfgUpsertErr } = await upsertConfiguration(configKey, testValue, updatedAt);
  if (cfgUpsertErr) fail("configuration update", cfgUpsertErr);
  else ok("configuration update", configKey);

  const { data: cfgAfter, error: cfgAfterErr } = await getConfigurationByKey(configKey);
  if (cfgAfterErr) fail("configuration read after update", cfgAfterErr);
  else ok("configuration read after update", JSON.stringify(cfgAfter?.value)?.slice(0, 80));

  const tokenId = process.env.TEST_TOKEN_ID;
  if (tokenId) {
    const { data: token, error: tokLookupErr } = await getFeActionTokenById(tokenId);
    if (tokLookupErr) fail("token lookup", tokLookupErr);
    else if (!token) fail("token lookup", new Error("not found"));
    else ok("token lookup", `${token.id} (${token.action_type})`);
  } else {
    console.warn("[skip] token lookup — set TEST_TOKEN_ID to run");
  }

  const ticketId = process.env.TEST_TICKET_ID;
  const feId = process.env.TEST_FE_ID;
  if (ticketId && feId) {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data: created, error: createErr } = await insertFeActionTokenReturning(
      {
        ticket_id: ticketId,
        fe_id: feId,
        action_type: "ON_SITE",
        expires_at: expiresAt,
        used: false,
        token_state: "ACTIVE",
      },
      "id"
    );
    if (createErr) fail("token create", createErr);
    else if (!created?.id) fail("token create", new Error("no id returned"));
    else {
      ok("token create", created.id);
      const { data: createdLookup, error: createdLookupErr } = await getFeActionTokenById(created.id);
      if (createdLookupErr) fail("token lookup after create", createdLookupErr);
      else ok("token lookup after create", createdLookup?.ticket_id || created.id);
    }
  } else {
    console.warn("[skip] token create — set TEST_TICKET_ID and TEST_FE_ID to run");
  }

  if (process.exitCode === 1) {
    console.error("\nOne or more checks failed.");
    process.exit(1);
  }
  console.log("\nAll Phase 5 Prisma fe_action_tokens / configurations checks passed.");
}

main().catch((err) => {
  console.error("[fatal]", err?.message || err);
  process.exit(1);
});
