/**
 * Phase 4 smoke test: user / organisation / field_executive lookups via Prisma (AWS PostgreSQL).
 *
 * Usage:
 *   DB_MODE=prisma DATABASE_URL="postgresql://..." node scripts/test-prisma-users.js
 *
 * Optional env:
 *   TEST_USER_AUTH_ID   — lookup app user by auth_id
 *   TEST_USER_EMAIL     — lookup app user by email
 *   TEST_ORG_ID         — lookup organisation by id
 *   TEST_ORG_SLUG       — lookup organisation id by slug
 *   TEST_FE_ID          — lookup field executive by id
 */

import dotenv from "dotenv";
dotenv.config();

import { resolveDbMode } from "../src/config/appConfig.js";
import {
  findAppUserByAuthId,
  findUserByEmail,
  findUserById,
} from "../src/repositories/userRepository.js";
import {
  getOrganisationById,
  findOrganisationIdBySlug,
  listOrganisations,
} from "../src/repositories/organisationRepository.js";
import {
  getFieldExecutiveById,
  listFieldExecutivesScoped,
} from "../src/repositories/fieldExecutiveRepository.js";

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

  const { data: orgList, error: orgListErr } = await listOrganisations();
  if (orgListErr) fail("listOrganisations", orgListErr);
  else ok("listOrganisations", `${(orgList || []).length} row(s)`);

  const orgId = process.env.TEST_ORG_ID || orgList?.[0]?.id || null;
  if (orgId) {
    const { data: org, error: orgErr } = await getOrganisationById(orgId);
    if (orgErr) fail("getOrganisationById", orgErr);
    else if (!org) fail("getOrganisationById", new Error("not found"));
    else ok("getOrganisationById", org.slug || org.id);
  } else {
    console.warn("[skip] getOrganisationById — no organisations in DB");
  }

  const orgSlug = process.env.TEST_ORG_SLUG || orgList?.[0]?.slug || null;
  if (orgSlug) {
    const { data: bySlug, error: slugErr } = await findOrganisationIdBySlug(orgSlug);
    if (slugErr) fail("findOrganisationIdBySlug", slugErr);
    else ok("findOrganisationIdBySlug", bySlug?.id || "null");
  }

  const email = process.env.TEST_USER_EMAIL;
  if (email) {
    const { data: user, error: userErr } = await findUserByEmail(email);
    if (userErr) fail("findUserByEmail", userErr);
    else ok("findUserByEmail", user?.id || "null");
  } else {
    console.warn("[skip] findUserByEmail — set TEST_USER_EMAIL to run");
  }

  const authId = process.env.TEST_USER_AUTH_ID;
  if (authId) {
    const { data: appUser, error: authErr } = await findAppUserByAuthId(authId);
    if (authErr) fail("findAppUserByAuthId", authErr);
    else ok("findAppUserByAuthId", appUser?.id || "null");
  } else {
    console.warn("[skip] findAppUserByAuthId — set TEST_USER_AUTH_ID to run");
  }

  if (email) {
    const { data: u } = await findUserByEmail(email);
    if (u?.id) {
      const { data: byId, error: idErr } = await findUserById(u.id);
      if (idErr) fail("findUserById", idErr);
      else ok("findUserById", byId?.email || byId?.id);
    }
  }

  const feId = process.env.TEST_FE_ID;
  if (feId) {
    const { data: fe, error: feErr } = await getFieldExecutiveById(feId);
    if (feErr) fail("getFieldExecutiveById", feErr);
    else ok("getFieldExecutiveById", fe?.name || fe?.id);
  } else {
    const mockReq = { isSuperAdmin: true, tenantId: null };
    const { data: fes, error: feListErr } = await listFieldExecutivesScoped(mockReq, {
      limit: 1,
      offset: 0,
      activeOnly: false,
    });
    if (feListErr) fail("listFieldExecutivesScoped", feListErr);
    else if (fes?.[0]?.id) {
      const { data: fe, error: feErr } = await getFieldExecutiveById(fes[0].id);
      if (feErr) fail("getFieldExecutiveById", feErr);
      else ok("getFieldExecutiveById", fe?.name || fe?.id);
    } else {
      console.warn("[skip] field executive lookup — no field_executives rows");
    }
  }

  if (process.exitCode === 1) {
    console.error("\nOne or more checks failed.");
    process.exit(1);
  }
  console.log("\nAll Phase 4 Prisma user/org/FE checks passed.");
}

main().catch((err) => {
  console.error("[fatal]", err?.message || err);
  process.exit(1);
});
