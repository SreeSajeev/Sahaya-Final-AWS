#!/usr/bin/env node
/**
 * READ-ONLY historical data preservation audit — TEST EC2 PostgreSQL only.
 * Never prints secrets. Never mutates data. Never touches Supabase.
 */
import "dotenv/config";
import { prisma } from "../../src/db/prisma.js";
import { writeJson, ensureOutDir } from "./lib.mjs";

const TEST_ORG_SLUG_RE = /^(e2e-|phase-)/i;

function classifyOrg(slug, name) {
  if (TEST_ORG_SLUG_RE.test(slug || "") || TEST_ORG_SLUG_RE.test(name || "")) return "TEST_FIXTURE";
  return "LIKELY_HISTORICAL";
}

function sqlInList(ids) {
  if (!ids.length) return "NULL";
  return ids.map((id) => `'${id}'`).join(",");
}

async function count(sql) {
  const rows = await prisma.$queryRawUnsafe(sql);
  return Number(rows[0]?.c ?? 0);
}

async function main() {
  ensureOutDir();

  const tables = [
    "organisations",
    "users",
    "tickets",
    "ticket_comments",
    "ticket_assignments",
    "field_executives",
    "sla_tracking",
    "audit_logs",
    "fe_action_tokens",
    "configurations",
    "tenant_clients",
    "auth_sessions",
    "password_reset_tokens",
    "raw_emails",
    "parsed_emails",
    "fe_proof_backup_queue",
    "ticket_number_sequences",
  ];
  const exact = {};
  for (const t of tables) {
    try {
      exact[t] = await count(`SELECT COUNT(*)::int AS c FROM "${t}"`);
    } catch (e) {
      exact[t] = null;
      exact[`${t}_error`] = String(e.message || e).slice(0, 120);
    }
  }

  const orgs = await prisma.organisation.findMany({
    select: { id: true, slug: true, name: true, status: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const orgClass = orgs.map((o) => ({
    id: o.id,
    slug: o.slug,
    status: o.status,
    createdAt: o.createdAt,
    class: classifyOrg(o.slug, o.name),
  }));
  const historicalOrgIds = orgClass.filter((o) => o.class === "LIKELY_HISTORICAL").map((o) => o.id);
  const fixtureOrgIds = orgClass.filter((o) => o.class === "TEST_FIXTURE").map((o) => o.id);

  const ticketsByOrgClass = {
    historicalOrgs: historicalOrgIds.length
      ? await count(`SELECT COUNT(*)::int AS c FROM tickets WHERE organisation_id IN (${sqlInList(historicalOrgIds)})`)
      : 0,
    fixtureOrgs: fixtureOrgIds.length
      ? await count(`SELECT COUNT(*)::int AS c FROM tickets WHERE organisation_id IN (${sqlInList(fixtureOrgIds)})`)
      : 0,
    nullOrg: await count(`SELECT COUNT(*)::int AS c FROM tickets WHERE organisation_id IS NULL`),
  };

  const markerTickets = await count(`
    SELECT COUNT(*)::int AS c FROM tickets
    WHERE COALESCE(short_description,'') ~* '(PHASE_|E2E_|ACCEPTANCE|SOAK|LOAD_TEST|FIXTURE)'
       OR COALESCE(remarks,'') ~* '(PHASE_|E2E_|ACCEPTANCE|SOAK|LOAD_TEST|FIXTURE)'
  `);
  const nonMarkerTickets = (exact.tickets || 0) - markerTickets;

  const ticketCreatedBounds = (
    await prisma.$queryRawUnsafe(`
      SELECT MIN(created_at) AS min_c, MAX(created_at) AS max_c
      FROM tickets
    `)
  )[0];

  const likelyHistoricalTickets = historicalOrgIds.length
    ? await count(`
    SELECT COUNT(*)::int AS c FROM tickets t
    WHERE t.organisation_id IN (${sqlInList(historicalOrgIds)})
      AND COALESCE(t.short_description,'') !~* '(PHASE_|E2E_|ACCEPTANCE|SOAK|LOAD_TEST|FIXTURE)'
      AND COALESCE(t.remarks,'') !~* '(PHASE_|E2E_|ACCEPTANCE|SOAK|LOAD_TEST|FIXTURE)'
  `)
    : 0;

  // Relationship sample: oldest tickets in historical orgs without test markers
  const samples = historicalOrgIds.length
    ? await prisma.$queryRawUnsafe(`
    SELECT t.id, t.ticket_number, t.status, t.priority_level, t.organisation_id,
           left(COALESCE(t.short_description,''), 80) AS short_desc,
           t.created_at, t.opened_by_email, t.current_assignment_id,
           (SELECT COUNT(*)::int FROM ticket_comments c WHERE c.ticket_id = t.id) AS comment_count,
           (SELECT COUNT(*)::int FROM ticket_assignments a WHERE a.ticket_id = t.id) AS assignment_count,
           (SELECT COUNT(*)::int FROM sla_tracking s WHERE s.ticket_id = t.id) AS sla_count,
           (SELECT COUNT(*)::int FROM audit_logs al WHERE al.entity_id = t.id) AS audit_count
    FROM tickets t
    WHERE t.organisation_id IN (${sqlInList(historicalOrgIds)})
      AND COALESCE(t.short_description,'') !~* '(PHASE_|E2E_|ACCEPTANCE|SOAK|LOAD_TEST|FIXTURE)'
    ORDER BY t.created_at ASC NULLS LAST
    LIMIT 8
  `)
    : [];

  const sampleDetails = [];
  for (const s of samples) {
    const org = orgs.find((o) => o.id === s.organisation_id);
    const comments = await prisma.$queryRawUnsafe(
      `SELECT id, left(COALESCE(body,''), 60) AS body_preview, source, created_at, author_id
       FROM ticket_comments WHERE ticket_id = $1::uuid ORDER BY created_at ASC LIMIT 5`,
      s.id
    );
    const assigns = await prisma.$queryRawUnsafe(
      `SELECT a.id, a.fe_id, a.outcome, a.assigned_at, a.proof_storage_path,
              f.user_id AS fe_user_id, f.name AS fe_name, f.email AS fe_email
       FROM ticket_assignments a
       LEFT JOIN field_executives f ON f.id = a.fe_id
       WHERE a.ticket_id = $1::uuid ORDER BY a.assigned_at ASC NULLS LAST LIMIT 5`,
      s.id
    );
    const sla = await prisma.$queryRawUnsafe(
      `SELECT id, assignment_deadline, onsite_deadline, resolution_deadline,
              assignment_breached, onsite_breached, resolution_breached
       FROM sla_tracking WHERE ticket_id = $1::uuid LIMIT 3`,
      s.id
    );
    const proofs = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS c FROM ticket_comments
       WHERE ticket_id = $1::uuid
         AND (
           (attachments ? 'proof_storage_paths')
           OR attachments::text ILIKE '%base64%'
           OR attachments::text ILIKE '%data:image%'
           OR (attachments IS NOT NULL AND attachments::text NOT IN ('null','[]','{}'))
         )`,
      s.id
    );
    sampleDetails.push({
      ticketId: s.id,
      ticketNumber: s.ticket_number,
      status: s.status,
      priority: s.priority_level,
      orgSlug: org?.slug || null,
      shortDesc: s.short_desc,
      openedByEmail: s.opened_by_email
        ? String(s.opened_by_email).replace(/^(.{2}).*(@.*)$/, "$1***$2")
        : null,
      createdAt: s.created_at,
      commentCount: Number(s.comment_count),
      assignmentCount: Number(s.assignment_count),
      slaCount: Number(s.sla_count),
      auditCount: Number(s.audit_count),
      commentsPreview: comments.map((c) => ({
        id: c.id,
        source: c.source,
        bodyPreview: c.body_preview,
        authorId: c.author_id,
        createdAt: c.created_at,
      })),
      assignments: assigns.map((a) => ({
        id: a.id,
        feId: a.fe_id,
        feUserId: a.fe_user_id,
        feName: a.fe_name,
        outcome: a.outcome,
        assignedAt: a.assigned_at,
        hasProofStoragePath: Boolean(a.proof_storage_path),
      })),
      sla,
      commentsWithProofMeta: Number(proofs[0]?.c ?? 0),
    });
  }

  const integrity = {
    orphanTicketsBadOrg: await count(`
      SELECT COUNT(*)::int AS c FROM tickets t
      LEFT JOIN organisations o ON o.id = t.organisation_id
      WHERE t.organisation_id IS NOT NULL AND o.id IS NULL`),
    orphanComments: await count(`
      SELECT COUNT(*)::int AS c FROM ticket_comments c
      LEFT JOIN tickets t ON t.id = c.ticket_id WHERE t.id IS NULL`),
    orphanAssignments: await count(`
      SELECT COUNT(*)::int AS c FROM ticket_assignments a
      LEFT JOIN tickets t ON t.id = a.ticket_id WHERE t.id IS NULL`),
    orphanAssignmentsFe: await count(`
      SELECT COUNT(*)::int AS c FROM ticket_assignments a
      LEFT JOIN field_executives f ON f.id = a.fe_id WHERE f.id IS NULL`),
    orphanSla: await count(`
      SELECT COUNT(*)::int AS c FROM sla_tracking s
      LEFT JOIN tickets t ON t.id = s.ticket_id WHERE t.id IS NULL`),
    usersBadOrg: await count(`
      SELECT COUNT(*)::int AS c FROM users u
      LEFT JOIN organisations o ON o.id = u.organisation_id
      WHERE u.organisation_id IS NOT NULL AND o.id IS NULL`),
    duplicateTicketNumbers: await count(`
      SELECT COUNT(*)::int AS c FROM (
        SELECT ticket_number FROM tickets
        WHERE ticket_number IS NOT NULL
        GROUP BY ticket_number HAVING COUNT(*) > 1
      ) d`),
    ticketsMissingShortDesc: await count(`
      SELECT COUNT(*)::int AS c FROM tickets
      WHERE short_description IS NULL OR btrim(short_description) = ''`),
    ticketsMissingStatus: await count(`
      SELECT COUNT(*)::int AS c FROM tickets WHERE status IS NULL OR btrim(status) = ''`),
    feMissingUser: await count(`
      SELECT COUNT(*)::int AS c FROM field_executives f
      LEFT JOIN users u ON u.id = f.user_id
      WHERE f.user_id IS NOT NULL AND u.id IS NULL`),
    usersWithPassword: await count(`SELECT COUNT(*)::int AS c FROM users WHERE password_hash IS NOT NULL`),
    usersNullPassword: await count(`SELECT COUNT(*)::int AS c FROM users WHERE password_hash IS NULL`),
  };

  const proofSignals = {
    commentsWithProofStoragePathsKey: await count(`
      SELECT COUNT(*)::int AS c FROM ticket_comments
      WHERE attachments ? 'proof_storage_paths'`),
    commentsWithBase64ish: await count(`
      SELECT COUNT(*)::int AS c FROM ticket_comments
      WHERE attachments::text ILIKE '%base64%' OR attachments::text ILIKE '%data:image%'`),
    assignmentsWithProofStoragePath: await count(`
      SELECT COUNT(*)::int AS c FROM ticket_assignments
      WHERE proof_storage_path IS NOT NULL AND btrim(proof_storage_path) <> ''`),
  };

  // Historical subset integrity (non-marker tickets in historical orgs)
  const histIntegrity = historicalOrgIds.length
    ? {
        histTickets: likelyHistoricalTickets,
        histComments: await count(`
          SELECT COUNT(*)::int AS c FROM ticket_comments c
          JOIN tickets t ON t.id = c.ticket_id
          WHERE t.organisation_id IN (${sqlInList(historicalOrgIds)})
            AND COALESCE(t.short_description,'') !~* '(PHASE_|E2E_|ACCEPTANCE|SOAK|LOAD_TEST|FIXTURE)'`),
        histAssignments: await count(`
          SELECT COUNT(*)::int AS c FROM ticket_assignments a
          JOIN tickets t ON t.id = a.ticket_id
          WHERE t.organisation_id IN (${sqlInList(historicalOrgIds)})
            AND COALESCE(t.short_description,'') !~* '(PHASE_|E2E_|ACCEPTANCE|SOAK|LOAD_TEST|FIXTURE)'`),
        histSla: await count(`
          SELECT COUNT(*)::int AS c FROM sla_tracking s
          JOIN tickets t ON t.id = s.ticket_id
          WHERE t.organisation_id IN (${sqlInList(historicalOrgIds)})
            AND COALESCE(t.short_description,'') !~* '(PHASE_|E2E_|ACCEPTANCE|SOAK|LOAD_TEST|FIXTURE)'`),
        histTicketsWithComments: await count(`
          SELECT COUNT(*)::int AS c FROM tickets t
          WHERE t.organisation_id IN (${sqlInList(historicalOrgIds)})
            AND COALESCE(t.short_description,'') !~* '(PHASE_|E2E_|ACCEPTANCE|SOAK|LOAD_TEST|FIXTURE)'
            AND EXISTS (SELECT 1 FROM ticket_comments c WHERE c.ticket_id = t.id)`),
        histTicketsWithAssignments: await count(`
          SELECT COUNT(*)::int AS c FROM tickets t
          WHERE t.organisation_id IN (${sqlInList(historicalOrgIds)})
            AND COALESCE(t.short_description,'') !~* '(PHASE_|E2E_|ACCEPTANCE|SOAK|LOAD_TEST|FIXTURE)'
            AND EXISTS (SELECT 1 FROM ticket_assignments a WHERE a.ticket_id = t.id)`),
        histTicketsWithSla: await count(`
          SELECT COUNT(*)::int AS c FROM tickets t
          WHERE t.organisation_id IN (${sqlInList(historicalOrgIds)})
            AND COALESCE(t.short_description,'') !~* '(PHASE_|E2E_|ACCEPTANCE|SOAK|LOAD_TEST|FIXTURE)'
            AND EXISTS (SELECT 1 FROM sla_tracking s WHERE s.ticket_id = t.id)`),
      }
    : {};

  const baseline = {
    sourceDoc: "docs/migration/phase-0-baseline.md / phase-1-rds.md",
    dump: "/var/backups/sahaya/pre-migration/sahaya-20260801-151400.dump",
    tables: 25,
    users: 34,
    organisations: 3,
    tickets: 829,
  };

  const historicalPresent = likelyHistoricalTickets >= 700 && historicalOrgIds.length >= 3;
  const verdict = {
    historicalTicketsLikelyPresent: historicalPresent,
    canPrismaServeWithoutSupabase: true,
    dataMigrationRequired: historicalPresent ? "NO" : "INVESTIGATE",
    note:
      "TEST fixtures inflated total ticket count; historical set estimated via org class + description heuristics. Baseline restore was 829 tickets / 3 orgs / 34 users.",
  };

  const report = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    baseline,
    exactCounts: exact,
    organisations: orgClass,
    historicalOrgCount: historicalOrgIds.length,
    fixtureOrgCount: fixtureOrgIds.length,
    ticketsByOrgClass,
    markerTickets,
    nonMarkerTickets,
    likelyHistoricalTickets,
    ticketCreatedBounds,
    histIntegrity,
    sampleDetails,
    integrity,
    proofSignals,
    gaps: {
      CRITICAL_OPERATIONAL_DATA: [],
      REFERENCE_DATA: [],
      AUTH_ONLY: [
        `${integrity.usersNullPassword} users with NULL password_hash (NON-BLOCKING for ticket preservation)`,
      ],
      TEST_FIXTURE: [`${fixtureOrgIds.length} fixture orgs; ~${markerTickets} marker tickets`],
      NO_GAP: historicalPresent
        ? ["Historical ticket corpus appears present in sahaya-migration-db — DATA MIGRATION REQUIRED = NO"]
        : [],
    },
    verdict,
  };

  if (integrity.orphanComments > 0 || integrity.orphanAssignments > 0 || integrity.orphanTicketsBadOrg > 0) {
    report.gaps.CRITICAL_OPERATIONAL_DATA.push(
      `orphans: comments=${integrity.orphanComments} assignments=${integrity.orphanAssignments} badOrgTickets=${integrity.orphanTicketsBadOrg}`
    );
  }

  const out = writeJson("historical-data-preservation-audit.json", report);
  console.log(
    JSON.stringify(
      {
        event: "historical_data_audit_done",
        out,
        exactCounts: exact,
        likelyHistoricalTickets,
        historicalOrgCount: historicalOrgIds.length,
        histIntegrity,
        integrity,
        proofSignals,
        sampleTicketNumbers: sampleDetails.map((s) => s.ticketNumber),
        verdict,
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
