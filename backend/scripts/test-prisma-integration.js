/**
 * Phase 5.5 integration smoke test — read-only repository coverage under Prisma.
 *
 * Usage:
 *   DB_MODE=prisma DATABASE_URL="postgresql://..." node scripts/test-prisma-integration.js
 *
 * Optional env (deep checks when set):
 *   TEST_TICKET_ID   — ticket UUID for SLA / comments / assignments / token probes
 *   TEST_TOKEN_ID    — fe_action_tokens.id for direct token lookup
 *   TEST_USER_AUTH_ID — users.auth_id for auth-linked user lookup
 *
 * No mutations. Safe against production when run read-only (default).
 */

import dotenv from "dotenv";
dotenv.config();

import { resolveDbMode } from "../src/config/appConfig.js";
import { listAllTicketsScoped } from "../src/repositories/ticketQueryRepository.js";
import { listOrganisations } from "../src/repositories/organisationRepository.js";
import { countUsersGlobal } from "../src/repositories/userRepository.js";
import { countFieldExecutivesGlobal } from "../src/repositories/fieldExecutiveRepository.js";
import { listAllAssignmentsScoped } from "../src/repositories/assignmentRepository.js";
import { listCommentsForTicket } from "../src/repositories/commentRepository.js";
import { listAllSlaRowsScoped } from "../src/repositories/slaRepository.js";
import {
  getFeActionTokenById,
  findActiveFeActionTokenForTicket,
  listFeActionTokensByFeAndTicketIds,
} from "../src/repositories/feActionTokenRepository.js";
import {
  listAllConfigurations,
  listSlaConfigurationKeys,
} from "../src/repositories/configurationRepository.js";
import { findAppUserByAuthId } from "../src/repositories/userRepository.js";
import { findSlaRowByTicketId } from "../src/repositories/slaRepository.js";
import { listAssignmentsForTicket } from "../src/repositories/assignmentRepository.js";

const SUPERADMIN_REQ = { isSuperAdmin: true, tenantId: null };

function ok(label, detail = "") {
  console.log(`[ok] ${label}${detail ? `: ${detail}` : ""}`);
}

function fail(label, err) {
  console.error(`[fail] ${label}:`, err?.message || err);
  process.exitCode = 1;
}

function warn(label, detail = "") {
  console.warn(`[skip] ${label}${detail ? `: ${detail}` : ""}`);
}

async function main() {
  const mode = resolveDbMode();
  if (mode !== "prisma") {
    console.error(`[abort] DB_MODE must be prisma (got: ${mode})`);
    process.exit(1);
  }
  ok("DB_MODE", mode);

  // --- tickets ---
  const { data: tickets, error: ticketErr } = await listAllTicketsScoped(SUPERADMIN_REQ, {
    orderDesc: true,
    limit: 3,
  });
  if (ticketErr) fail("tickets (listAllTicketsScoped)", ticketErr);
  else ok("tickets", `${(tickets || []).length} row(s) sampled`);

  const ticketId = process.env.TEST_TICKET_ID || tickets?.[0]?.id || null;

  // --- organisations ---
  const { data: orgs, error: orgErr } = await listOrganisations();
  if (orgErr) fail("organisations (listOrganisations)", orgErr);
  else ok("organisations", `${(orgs || []).length} row(s)`);

  // --- users ---
  const { count: userCount, error: userCountErr } = await countUsersGlobal();
  if (userCountErr) fail("users (countUsersGlobal)", userCountErr);
  else ok("users", `${userCount ?? 0} total`);

  const authId = process.env.TEST_USER_AUTH_ID;
  if (authId) {
    const { data: appUser, error: authUserErr } = await findAppUserByAuthId(authId);
    if (authUserErr) fail("users (findAppUserByAuthId)", authUserErr);
    else ok("users auth_id lookup", appUser?.id || "not found");
  } else {
    warn("users auth_id lookup", "set TEST_USER_AUTH_ID to verify auth_id → user");
  }

  // --- field_executives ---
  const { count: feCount, error: feCountErr } = await countFieldExecutivesGlobal();
  if (feCountErr) fail("field_executives (countFieldExecutivesGlobal)", feCountErr);
  else ok("field_executives", `${feCount ?? 0} total`);

  // --- ticket_assignments ---
  const { data: assignments, error: assignErr } = await listAllAssignmentsScoped(SUPERADMIN_REQ);
  if (assignErr) fail("ticket_assignments (listAllAssignmentsScoped)", assignErr);
  else ok("ticket_assignments", `${(assignments || []).length} row(s) sampled`);

  if (ticketId) {
    const { data: ticketAssignments, error: taErr } = await listAssignmentsForTicket(
      SUPERADMIN_REQ,
      ticketId,
      { limit: 5, offset: 0, includeFe: false }
    );
    if (taErr) fail("ticket_assignments (listAssignmentsForTicket)", taErr);
    else ok("ticket_assignments by ticket", `${(ticketAssignments || []).length} for ${ticketId}`);
  } else {
    warn("ticket_assignments by ticket", "no ticket id available");
  }

  // --- ticket_comments ---
  if (ticketId) {
    const { data: comments, error: commentErr } = await listCommentsForTicket(
      SUPERADMIN_REQ,
      ticketId,
      { limit: 5, offset: 0 }
    );
    if (commentErr) fail("ticket_comments (listCommentsForTicket)", commentErr);
    else ok("ticket_comments", `${(comments || []).length} for ticket ${ticketId}`);
  } else {
    warn("ticket_comments", "no ticket id available");
  }

  // --- sla_tracking ---
  const { data: slaRows, error: slaErr } = await listAllSlaRowsScoped(SUPERADMIN_REQ);
  if (slaErr) fail("sla_tracking (listAllSlaRowsScoped)", slaErr);
  else ok("sla_tracking", `${(slaRows || []).length} row(s) sampled`);

  if (ticketId) {
    const slaRow = await findSlaRowByTicketId(ticketId);
    ok("sla_tracking by ticket", slaRow?.id ? slaRow.id : "none");
  }

  // --- fe_action_tokens ---
  const tokenId = process.env.TEST_TOKEN_ID;
  if (tokenId) {
    const { data: token, error: tokErr } = await getFeActionTokenById(tokenId);
    if (tokErr) fail("fe_action_tokens (getFeActionTokenById)", tokErr);
    else ok("fe_action_tokens lookup", token?.id || "not found");
  } else if (ticketId) {
    const { data: activeTok, error: activeErr } = await findActiveFeActionTokenForTicket(
      ticketId,
      new Date().toISOString()
    );
    if (activeErr) fail("fe_action_tokens (findActiveFeActionTokenForTicket)", activeErr);
    else ok("fe_action_tokens active", activeTok?.id || "none active");
  } else {
    warn("fe_action_tokens", "set TEST_TOKEN_ID or ensure tickets exist");
  }

  const feId = assignments?.[0]?.fe_id;
  if (feId && ticketId) {
    const { data: feTokens, error: feTokErr } = await listFeActionTokensByFeAndTicketIds(
      feId,
      [ticketId],
      "id, ticket_id, action_type, token_state, used, expires_at"
    );
    if (feTokErr) fail("fe_action_tokens (listFeActionTokensByFeAndTicketIds)", feTokErr);
    else ok("fe_action_tokens by fe+ticket", `${(feTokens || []).length} row(s)`);
  }

  // --- configurations ---
  const { data: configs, error: cfgErr } = await listAllConfigurations(20);
  if (cfgErr) fail("configurations (listAllConfigurations)", cfgErr);
  else ok("configurations", `${(configs || []).length} row(s) sampled`);

  const { data: slaCfg, error: slaCfgErr } = await listSlaConfigurationKeys([
    "assignment_sla_hours",
    "onsite_sla_hours",
    "resolution_sla_hours",
  ]);
  if (slaCfgErr) fail("configurations SLA keys", slaCfgErr);
  else ok("configurations SLA keys", `${(slaCfg || []).length} key(s)`);

  if (process.exitCode === 1) {
    console.error("\nOne or more integration checks failed.");
    process.exit(1);
  }
  console.log("\nAll Phase 5.5 read-only Prisma integration checks passed.");
}

main().catch((err) => {
  console.error("[fatal]", err?.message || err);
  process.exit(1);
});
