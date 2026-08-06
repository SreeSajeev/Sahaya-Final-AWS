#!/usr/bin/env node
/**
 * READ-ONLY TEST fixture organisation classification + delete-impact estimate.
 * TEST EC2 PostgreSQL only. Never mutates. Never touches Supabase/production.
 *
 * Classifications: HISTORICAL | TEST | UNKNOWN
 * Does NOT delete anything.
 */
import "dotenv/config";
import { prisma } from "../../src/db/prisma.js";
import { writeJson, ensureOutDir } from "./lib.mjs";

/** Strong TEST slug/name markers from acceptance / Playwright / Phase F. */
const TEST_SLUG_RE =
  /^(e2e-|phase-|phase_f|phase-f|accept|soak|load|fixture|convergence|test-seed|e2e_)/i;
const TEST_NAME_RE =
  /(e2e|playwright|acceptance|phase[\s_-]?f|soak|load[\s_-]?test|fixture|convergence|test[\s_-]?seed|full[\s_-]?platform)/i;
const TEST_TICKET_RE =
  /(PHASE_|E2E_|ACCEPTANCE|SOAK|LOAD_TEST|FIXTURE|CONVERGENCE_PROBE|E2E_TEST)/i;

/** Known production-origin baseline orgs (Phase 0: 3 organisations). */
const KNOWN_HISTORICAL_SLUGS = new Set(["pariskq", "demo", "demoapex"]);

/** Snapshot boundary: pre-migration dump archive time (UTC). */
const SNAPSHOT_CUTOFF = new Date("2026-08-01T15:14:00.000Z");

function sqlInList(ids) {
  if (!ids.length) return "NULL";
  return ids.map((id) => `'${String(id).replace(/'/g, "''")}'`).join(",");
}

async function count(sql) {
  const rows = await prisma.$queryRawUnsafe(sql);
  return Number(rows[0]?.c ?? 0);
}

function classifyOrganisation(org, signals) {
  const slug = String(org.slug || "");
  const name = String(org.name || "");
  const reasons = [];

  if (KNOWN_HISTORICAL_SLUGS.has(slug.toLowerCase())) {
    reasons.push("known_baseline_slug");
    return { class: "HISTORICAL", reasons, confidence: "HIGH" };
  }

  if (TEST_SLUG_RE.test(slug) || TEST_NAME_RE.test(name) || TEST_NAME_RE.test(slug)) {
    reasons.push("name_or_slug_matches_test_pattern");
    return { class: "TEST", reasons, confidence: "HIGH" };
  }

  if (signals.markerTicketRatio >= 0.8 && signals.ticketCount >= 3) {
    reasons.push(`marker_ticket_ratio=${signals.markerTicketRatio.toFixed(2)}`);
    return { class: "TEST", reasons, confidence: "HIGH" };
  }

  if (signals.markerTicketRatio >= 0.5 && signals.ticketCount >= 10) {
    reasons.push(`marker_ticket_ratio=${signals.markerTicketRatio.toFixed(2)}`);
    return { class: "TEST", reasons, confidence: "MEDIUM" };
  }

  // Created before snapshot with little/no test markers → historical
  if (org.createdAt && new Date(org.createdAt) <= SNAPSHOT_CUTOFF && signals.markerTicketRatio < 0.2) {
    reasons.push("created_at_on_or_before_snapshot");
    return { class: "HISTORICAL", reasons, confidence: "MEDIUM" };
  }

  // Post-snapshot org with zero historical-looking tickets and any markers
  if (
    org.createdAt &&
    new Date(org.createdAt) > SNAPSHOT_CUTOFF &&
    (signals.markerTicketCount > 0 || signals.ticketCount === 0)
  ) {
    reasons.push("created_after_snapshot_with_test_or_empty");
    if (signals.markerTicketCount > 0 || /test|demo|temp/i.test(slug + name)) {
      return { class: "TEST", reasons, confidence: "MEDIUM" };
    }
    return { class: "UNKNOWN", reasons, confidence: "LOW" };
  }

  if (signals.markerTicketCount === 0 && signals.ticketCount > 0) {
    reasons.push("has_tickets_without_test_markers");
    return { class: "HISTORICAL", reasons, confidence: "MEDIUM" };
  }

  reasons.push("insufficient_evidence");
  return { class: "UNKNOWN", reasons, confidence: "LOW" };
}

async function orgSignals(orgId) {
  const ticketCount = await count(
    `SELECT COUNT(*)::int AS c FROM tickets WHERE organisation_id = '${orgId}'`
  );
  const markerTicketCount = await count(`
    SELECT COUNT(*)::int AS c FROM tickets
    WHERE organisation_id = '${orgId}'
      AND (
        COALESCE(short_description,'') ~* '(PHASE_|E2E_|ACCEPTANCE|SOAK|LOAD_TEST|FIXTURE|CONVERGENCE_PROBE|E2E_TEST)'
        OR COALESCE(remarks,'') ~* '(PHASE_|E2E_|ACCEPTANCE|SOAK|LOAD_TEST|FIXTURE|CONVERGENCE_PROBE|E2E_TEST)'
        OR COALESCE(ticket_number,'') ~* '^(E2E|PHASE|TEST|CONV)'
      )
  `);
  const sampleTickets = await prisma.$queryRawUnsafe(
    `SELECT ticket_number, left(COALESCE(short_description,''), 60) AS short_desc, created_at
     FROM tickets WHERE organisation_id = $1::uuid
     ORDER BY created_at DESC NULLS LAST LIMIT 5`,
    orgId
  );
  return {
    ticketCount,
    markerTicketCount,
    markerTicketRatio: ticketCount > 0 ? markerTicketCount / ticketCount : 0,
    sampleTickets,
  };
}

async function safeCount(sql) {
  try {
    return await count(sql);
  } catch (e) {
    return null;
  }
}

async function safeImpact(orgId) {
  const ticketIdsSql = `SELECT id FROM tickets WHERE organisation_id = '${orgId}'`;
  return {
    users: await safeCount(`SELECT COUNT(*)::int AS c FROM users WHERE organisation_id = '${orgId}'`),
    field_executives: await safeCount(
      `SELECT COUNT(*)::int AS c FROM field_executives WHERE organisation_id = '${orgId}'`
    ),
    tenant_clients: await safeCount(
      `SELECT COUNT(*)::int AS c FROM tenant_clients WHERE organisation_id = '${orgId}'`
    ),
    tickets: await safeCount(`SELECT COUNT(*)::int AS c FROM tickets WHERE organisation_id = '${orgId}'`),
    ticket_comments: await safeCount(`
      SELECT COUNT(*)::int AS c FROM ticket_comments
      WHERE organisation_id = '${orgId}' OR ticket_id IN (${ticketIdsSql})`),
    ticket_assignments: await safeCount(`
      SELECT COUNT(*)::int AS c FROM ticket_assignments
      WHERE organisation_id = '${orgId}' OR ticket_id IN (${ticketIdsSql})`),
    sla_tracking: await safeCount(`
      SELECT COUNT(*)::int AS c FROM sla_tracking
      WHERE organisation_id = '${orgId}' OR ticket_id IN (${ticketIdsSql})`),
    audit_logs: await safeCount(
      `SELECT COUNT(*)::int AS c FROM audit_logs WHERE organisation_id = '${orgId}'`
    ),
    fe_action_tokens: await safeCount(`
      SELECT COUNT(*)::int AS c FROM fe_action_tokens
      WHERE organisation_id = '${orgId}' OR ticket_id IN (${ticketIdsSql})`),
    comments_with_proof_meta: await safeCount(`
      SELECT COUNT(*)::int AS c FROM ticket_comments
      WHERE (organisation_id = '${orgId}' OR ticket_id IN (${ticketIdsSql}))
        AND (
          (attachments ? 'proof_storage_paths')
          OR attachments::text ILIKE '%base64%'
          OR attachments::text ILIKE '%data:image%'
        )`),
    assignments_with_proof_path: await safeCount(`
      SELECT COUNT(*)::int AS c FROM ticket_assignments
      WHERE (organisation_id = '${orgId}' OR ticket_id IN (${ticketIdsSql}))
        AND proof_storage_path IS NOT NULL AND btrim(proof_storage_path) <> ''`),
    auth_sessions_for_org_users: await safeCount(`
      SELECT COUNT(*)::int AS c FROM auth_sessions s
      JOIN users u ON u.id = s.user_id
      WHERE u.organisation_id = '${orgId}'`),
    password_reset_tokens_for_org_users: await safeCount(`
      SELECT COUNT(*)::int AS c FROM password_reset_tokens t
      JOIN users u ON u.id = t.user_id
      WHERE u.organisation_id = '${orgId}'`),
    raw_emails: await safeCount(
      `SELECT COUNT(*)::int AS c FROM raw_emails WHERE organisation_id = '${orgId}'`
    ),
    parsed_emails: await safeCount(
      `SELECT COUNT(*)::int AS c FROM parsed_emails WHERE organisation_id = '${orgId}'`
    ),
    ticket_number_sequences: await safeCount(
      `SELECT COUNT(*)::int AS c FROM ticket_number_sequences WHERE organisation_id = '${orgId}'`
    ),
  };
}

function sumImpacts(impacts) {
  const totals = {};
  for (const imp of impacts) {
    for (const [k, v] of Object.entries(imp || {})) {
      if (typeof v !== "number") continue;
      totals[k] = (totals[k] || 0) + v;
    }
  }
  totals.organisations = impacts.length;
  totals.estimated_total_dependent_rows = Object.entries(totals)
    .filter(([k]) => k !== "organisations" && k !== "estimated_total_dependent_rows")
    .reduce((a, [, v]) => a + v, 0);
  return totals;
}

async function main() {
  ensureOutDir();

  const globalBefore = {};
  for (const t of [
    "organisations",
    "users",
    "tickets",
    "ticket_comments",
    "ticket_assignments",
    "sla_tracking",
    "audit_logs",
    "field_executives",
    "tenant_clients",
  ]) {
    globalBefore[t] = await count(`SELECT COUNT(*)::int AS c FROM "${t}"`);
  }

  const orgs = await prisma.organisation.findMany({
    select: { id: true, slug: true, name: true, status: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const classified = [];
  for (const org of orgs) {
    const signals = await orgSignals(org.id);
    const { class: cls, reasons, confidence } = classifyOrganisation(org, signals);
    const entry = {
      id: org.id,
      slug: org.slug,
      name: org.name,
      status: org.status,
      createdAt: org.createdAt,
      class: cls,
      confidence,
      reasons,
      signals: {
        ticketCount: signals.ticketCount,
        markerTicketCount: signals.markerTicketCount,
        markerTicketRatio: Number(signals.markerTicketRatio.toFixed(3)),
        sampleTickets: signals.sampleTickets,
      },
      impact: null,
    };
    if (cls === "TEST") {
      entry.impact = await safeImpact(org.id);
    }
    classified.push(entry);
  }

  const byClass = {
    HISTORICAL: classified.filter((o) => o.class === "HISTORICAL"),
    TEST: classified.filter((o) => o.class === "TEST"),
    UNKNOWN: classified.filter((o) => o.class === "UNKNOWN"),
  };

  const testImpacts = byClass.TEST.map((o) => o.impact).filter(Boolean);
  const deleteEstimate = sumImpacts(testImpacts);

  // Historical ticket count (must remain unchanged after cleanup)
  const histIds = byClass.HISTORICAL.map((o) => o.id);
  const historicalTicketCount = histIds.length
    ? await count(`SELECT COUNT(*)::int AS c FROM tickets WHERE organisation_id IN (${sqlInList(histIds)})`)
    : 0;

  const report = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    mutation: "NONE — Phase 1 classification only. Awaiting approval before any delete.",
    snapshotCutoffUtc: SNAPSHOT_CUTOFF.toISOString(),
    knownHistoricalSlugs: [...KNOWN_HISTORICAL_SLUGS],
    globalCountsBefore: globalBefore,
    summary: {
      organisationsTotal: classified.length,
      HISTORICAL: byClass.HISTORICAL.length,
      TEST: byClass.TEST.length,
      UNKNOWN: byClass.UNKNOWN.length,
      historicalTicketCount,
      estimatedRowsDeletedIfTestOrgsRemoved: deleteEstimate,
    },
    historicalOrganisations: byClass.HISTORICAL.map((o) => ({
      id: o.id,
      slug: o.slug,
      name: o.name,
      createdAt: o.createdAt,
      confidence: o.confidence,
      reasons: o.reasons,
      tickets: o.signals.ticketCount,
      markerTickets: o.signals.markerTicketCount,
    })),
    unknownOrganisations: byClass.UNKNOWN.map((o) => ({
      id: o.id,
      slug: o.slug,
      name: o.name,
      createdAt: o.createdAt,
      confidence: o.confidence,
      reasons: o.reasons,
      tickets: o.signals.ticketCount,
      markerTickets: o.signals.markerTicketCount,
      sampleTickets: o.signals.sampleTickets,
    })),
    testOrganisations: byClass.TEST.map((o) => ({
      id: o.id,
      slug: o.slug,
      name: o.name,
      createdAt: o.createdAt,
      confidence: o.confidence,
      reasons: o.reasons,
      signals: o.signals,
      impact: o.impact,
    })),
    deletePlanPreview: {
      wouldDeleteOrganisationIds: byClass.TEST.map((o) => o.id),
      wouldNeverDeleteOrganisationIds: byClass.HISTORICAL.map((o) => o.id),
      requiresManualReviewOrganisationIds: byClass.UNKNOWN.map((o) => o.id),
      note: "UNKNOWN orgs are NOT included in delete estimate. Approve TEST list only.",
    },
  };

  const out = writeJson("test-fixture-org-classification.json", report);
  console.log(
    JSON.stringify(
      {
        event: "test_fixture_org_classification_done",
        out,
        summary: report.summary,
        historicalSlugs: report.historicalOrganisations.map((o) => o.slug),
        testSlugs: report.testOrganisations.map((o) => o.slug),
        unknownSlugs: report.unknownOrganisations.map((o) => o.slug),
        deleteEstimate: report.summary.estimatedRowsDeletedIfTestOrgsRemoved,
      },
      null,
      2
    )
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
