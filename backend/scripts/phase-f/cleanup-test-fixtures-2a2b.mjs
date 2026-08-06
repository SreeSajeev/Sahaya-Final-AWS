#!/usr/bin/env node
/**
 * TEST-ONLY cleanup: Phase 2A (empty TEST orgs) + Phase 2B (marker tickets in historical orgs).
 *
 * Requires: CLEANUP_CONFIRM=DELETE_TEST_FIXTURES_2A_2B
 * Never touches production / Supabase.
 * Never deletes non-marker tickets or historical organisations (pariskq/demo/demoapex).
 */
import "dotenv/config";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../src/db/prisma.js";
import { writeJson, ensureOutDir } from "./lib.mjs";

const REQUIRED_CONFIRM = "DELETE_TEST_FIXTURES_2A_2B";
const HIST_SLUGS = ["pariskq", "demo", "demoapex"];
const TEST_ORG_SLUG_RE = "^(e2e-|phase-)";
const MARKER =
  "(PHASE_|E2E_|ACCEPTANCE|SOAK|LOAD_TEST|FIXTURE|CONVERGENCE_PROBE|E2E_TEST)";

const BACKUP_ROOT = process.env.CLEANUP_BACKUP_ROOT || "/var/backups/sahaya/cleanup";

async function count(sql) {
  const rows = await prisma.$queryRawUnsafe(sql);
  return Number(rows[0]?.c ?? 0);
}

async function countsSnapshot() {
  return {
    organisations: await count(`SELECT COUNT(*)::int AS c FROM organisations`),
    users: await count(`SELECT COUNT(*)::int AS c FROM users`),
    tickets: await count(`SELECT COUNT(*)::int AS c FROM tickets`),
    ticket_comments: await count(`SELECT COUNT(*)::int AS c FROM ticket_comments`),
    ticket_assignments: await count(`SELECT COUNT(*)::int AS c FROM ticket_assignments`),
    sla_tracking: await count(`SELECT COUNT(*)::int AS c FROM sla_tracking`),
    audit_logs: await count(`SELECT COUNT(*)::int AS c FROM audit_logs`),
    field_executives: await count(`SELECT COUNT(*)::int AS c FROM field_executives`),
    tenant_clients: await count(`SELECT COUNT(*)::int AS c FROM tenant_clients`),
    hist_orgs: await count(
      `SELECT COUNT(*)::int AS c FROM organisations WHERE slug IN ('pariskq','demo','demoapex')`
    ),
    hist_non_marker_tickets: await count(`
      SELECT COUNT(*)::int AS c FROM tickets t
      JOIN organisations o ON o.id = t.organisation_id
      WHERE o.slug IN ('pariskq','demo','demoapex')
        AND COALESCE(t.short_description,'') !~* '${MARKER}'
        AND COALESCE(t.remarks,'') !~* '${MARKER}'
    `),
    hist_marker_tickets: await count(`
      SELECT COUNT(*)::int AS c FROM tickets t
      JOIN organisations o ON o.id = t.organisation_id
      WHERE o.slug IN ('pariskq','demo','demoapex')
        AND (
          COALESCE(t.short_description,'') ~* '${MARKER}'
          OR COALESCE(t.remarks,'') ~* '${MARKER}'
        )
    `),
    test_orgs: await count(
      `SELECT COUNT(*)::int AS c FROM organisations WHERE slug ~* '${TEST_ORG_SLUG_RE}'`
    ),
  };
}

function takeBackup() {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "-").slice(0, 19);
  const dir = path.join(BACKUP_ROOT, ts);
  const dumpName = `sahaya-pre-cleanup-${ts}.dump`;
  const dumpPath = path.join(dir, dumpName);
  const listPath = path.join(dir, "pg_restore_list.txt");
  const shaPath = path.join(dir, "SHA256SUMS");

  // Mirror acceptance-backup-restore.sh: dump via docker, never overwrite pre-migration.
  const bash = `
set -euo pipefail
BACKUP_ROOT=${JSON.stringify(BACKUP_ROOT)}
DIR=${JSON.stringify(dir)}
DUMP=${JSON.stringify(dumpPath)}
LIST=${JSON.stringify(listPath)}
SHA=${JSON.stringify(shaPath)}
mkdir -p "$DIR"
chmod 700 "$BACKUP_ROOT" "$DIR" || true
cd /var/www/apps/sahaya-final-aws-monorepo/backend 2>/dev/null || cd "$(pwd)"
DB_USER="$(node --input-type=module -e 'import "dotenv/config"; const u=new URL(process.env.DATABASE_URL); process.stdout.write(u.username||"sahaya")')"
DB_NAME="$(node --input-type=module -e 'import "dotenv/config"; const u=new URL(process.env.DATABASE_URL); process.stdout.write((u.pathname||"/sahaya").replace(/^\\//,"").split("?")[0]||"sahaya")')"
echo "dump_user=$DB_USER dump_db=$DB_NAME dump=$DUMP"
docker ps --format '{{.Names}} {{.Status}} {{.Ports}}' | grep sahaya-migration-db
docker exec sahaya-migration-db pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc -f /tmp/sahaya-pre-cleanup.dump
docker cp sahaya-migration-db:/tmp/sahaya-pre-cleanup.dump "$DUMP"
docker exec sahaya-migration-db rm -f /tmp/sahaya-pre-cleanup.dump
sha256sum "$DUMP" | tee "$SHA"
ls -la "$DUMP"
if command -v pg_restore >/dev/null 2>&1; then
  pg_restore --list "$DUMP" > "$LIST"
else
  docker run --rm -v "$DIR":/b postgres:18 pg_restore --list "/b/$(basename "$DUMP")" > "$LIST"
fi
wc -l "$LIST"
`;
  console.log(JSON.stringify({ event: "backup_start", dumpPath }));
  execSync(bash, { stdio: "inherit", shell: "/bin/bash" });
  const shaLine = fs.readFileSync(shaPath, "utf8").trim().split("\n")[0];
  const sha256 = shaLine.split(/\s+/)[0];
  const listOk = fs.existsSync(listPath) && fs.statSync(listPath).size > 0;
  return { dumpPath, sha256, dir, listOk, ts };
}

async function exec(sql) {
  return prisma.$executeRawUnsafe(sql);
}

async function runCleanup() {
  const markerTicketFilter = `
    organisation_id IN (SELECT id FROM organisations WHERE slug IN ('pariskq','demo','demoapex'))
    AND (
      COALESCE(short_description,'') ~* '${MARKER}'
      OR COALESCE(remarks,'') ~* '${MARKER}'
    )
  `;
  const markerIds = `SELECT id FROM tickets WHERE ${markerTicketFilter}`;

  const planned = {
    markerTickets: await count(`SELECT COUNT(*)::int AS c FROM tickets WHERE ${markerTicketFilter}`),
    markerComments: await count(
      `SELECT COUNT(*)::int AS c FROM ticket_comments WHERE ticket_id IN (${markerIds})`
    ),
    markerAssignments: await count(
      `SELECT COUNT(*)::int AS c FROM ticket_assignments WHERE ticket_id IN (${markerIds})`
    ),
    markerSla: await count(`SELECT COUNT(*)::int AS c FROM sla_tracking WHERE ticket_id IN (${markerIds})`),
    testOrgs: await count(
      `SELECT COUNT(*)::int AS c FROM organisations WHERE slug ~* '${TEST_ORG_SLUG_RE}'`
    ),
  };

  console.log(JSON.stringify({ event: "cleanup_planned", planned }, null, 2));

  // ---- Phase 2B: marker tickets + dependents ----
  const deleted = {
    phase2b: {},
    phase2a: {},
  };

  await prisma.$transaction(
    async (tx) => {
      const q = (sql) => tx.$executeRawUnsafe(sql);

      // Clear assignment pointers on marker tickets
      deleted.phase2b.null_current_assignment = await q(`
        UPDATE tickets SET current_assignment_id = NULL
        WHERE id IN (${markerIds}) AND current_assignment_id IS NOT NULL
      `);

      // Clear soft links to marker tickets
      try {
        deleted.phase2b.raw_emails_unlink = await q(`
          UPDATE raw_emails SET linked_ticket_id = NULL
          WHERE linked_ticket_id IN (${markerIds})
        `);
      } catch {
        deleted.phase2b.raw_emails_unlink = null;
      }
      try {
        deleted.phase2b.public_otp_unlink = await q(`
          UPDATE public_otp_sessions SET ticket_id = NULL
          WHERE ticket_id IN (${markerIds})
        `);
      } catch {
        deleted.phase2b.public_otp_unlink = null;
      }

      // Dependent deletes: proof queue before comments; then ticket-scoped rows; tickets last.
      const childDeletes = [
        ["fe_proof_backup_queue", `DELETE FROM fe_proof_backup_queue WHERE ticket_id IN (${markerIds})`],
        ["access_tokens", `DELETE FROM access_tokens WHERE ticket_id IN (${markerIds})`],
        [
          "public_complaint_submissions",
          `DELETE FROM public_complaint_submissions WHERE ticket_id IN (${markerIds})`,
        ],
        ["fe_action_tokens", `DELETE FROM fe_action_tokens WHERE ticket_id IN (${markerIds})`],
        [
          "ticket_resolution_notifications",
          `DELETE FROM ticket_resolution_notifications WHERE ticket_id IN (${markerIds})`,
        ],
        ["ticket_comments", `DELETE FROM ticket_comments WHERE ticket_id IN (${markerIds})`],
        ["ticket_assignments", `DELETE FROM ticket_assignments WHERE ticket_id IN (${markerIds})`],
        ["sla_tracking", `DELETE FROM sla_tracking WHERE ticket_id IN (${markerIds})`],
        ["audit_logs_entity", `DELETE FROM audit_logs WHERE entity_id IN (${markerIds})`],
        ["tickets", `DELETE FROM tickets WHERE ${markerTicketFilter}`],
      ];

      for (const [name, sql] of childDeletes) {
        try {
          deleted.phase2b[name] = await q(sql);
        } catch (e) {
          deleted.phase2b[`${name}_error`] = String(e.message || e).slice(0, 200);
          // Non-existent tables are OK; hard failures on tickets/comments/assignments abort
          if (["ticket_comments", "ticket_assignments", "sla_tracking", "tickets"].includes(name)) {
            throw e;
          }
        }
      }

      // ---- Phase 2A: TEST organisations (slug pattern) ----
      const testOrgIds = `SELECT id FROM organisations WHERE slug ~* '${TEST_ORG_SLUG_RE}'`;

      // Safety: refuse if any tickets remain under TEST orgs
      const residual = await tx.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS c FROM tickets WHERE organisation_id IN (${testOrgIds})`
      );
      if (Number(residual[0]?.c ?? 0) > 0) {
        throw new Error(
          `Refusing Phase 2A: TEST orgs still have ${residual[0].c} tickets — unexpected`
        );
      }

      const orgChildDeletes = [
        ["org_fe_action_tokens", `DELETE FROM fe_action_tokens WHERE organisation_id IN (${testOrgIds})`],
        ["org_fe_proof_backup_queue", `DELETE FROM fe_proof_backup_queue WHERE organisation_id IN (${testOrgIds})`],
        ["org_public_complaint_submissions", `DELETE FROM public_complaint_submissions WHERE organisation_id IN (${testOrgIds})`],
        ["org_public_otp_sessions", `DELETE FROM public_otp_sessions WHERE organisation_id IN (${testOrgIds})`],
        ["org_audit_logs", `DELETE FROM audit_logs WHERE organisation_id IN (${testOrgIds})`],
        ["org_tenant_clients", `DELETE FROM tenant_clients WHERE organisation_id IN (${testOrgIds})`],
        ["org_tenant_complaint_points", `DELETE FROM tenant_complaint_points WHERE organisation_id IN (${testOrgIds})`],
        ["org_daily_tenant_report_runs", `DELETE FROM daily_tenant_report_runs WHERE organisation_id IN (${testOrgIds})`],
        ["org_field_executives", `DELETE FROM field_executives WHERE organisation_id IN (${testOrgIds})`],
        [
          "org_auth_sessions",
          `DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM users WHERE organisation_id IN (${testOrgIds}))`,
        ],
        [
          "org_password_reset_tokens",
          `DELETE FROM password_reset_tokens WHERE user_id IN (SELECT id FROM users WHERE organisation_id IN (${testOrgIds}))`,
        ],
        ["org_users", `DELETE FROM users WHERE organisation_id IN (${testOrgIds})`],
        ["org_parsed_emails", `DELETE FROM parsed_emails WHERE organisation_id IN (${testOrgIds})`],
        ["org_raw_emails", `DELETE FROM raw_emails WHERE organisation_id IN (${testOrgIds})`],
        [
          "organisations",
          `DELETE FROM organisations WHERE slug ~* '${TEST_ORG_SLUG_RE}' AND slug NOT IN ('pariskq','demo','demoapex')`,
        ],
      ];

      for (const [name, sql] of orgChildDeletes) {
        try {
          deleted.phase2a[name] = await q(sql);
        } catch (e) {
          deleted.phase2a[`${name}_error`] = String(e.message || e).slice(0, 200);
          if (name === "organisations") throw e;
        }
      }
    },
    { timeout: 300_000, maxWait: 60_000 }
  );

  return { planned, deleted };
}

async function verify() {
  const after = await countsSnapshot();
  const histOrgs = await prisma.$queryRawUnsafe(`
    SELECT slug, name, id::text AS id FROM organisations
    WHERE slug IN ('pariskq','demo','demoapex')
    ORDER BY slug
  `);
  const unexpectedHist = await count(`
    SELECT COUNT(*)::int AS c FROM organisations
    WHERE slug NOT IN ('pariskq','demo','demoapex')
      AND slug !~* '${TEST_ORG_SLUG_RE}'
  `);
  const remainingTestOrgs = await count(
    `SELECT COUNT(*)::int AS c FROM organisations WHERE slug ~* '${TEST_ORG_SLUG_RE}'`
  );
  const remainingMarker = await count(`
    SELECT COUNT(*)::int AS c FROM tickets t
    JOIN organisations o ON o.id = t.organisation_id
    WHERE o.slug IN ('pariskq','demo','demoapex')
      AND (
        COALESCE(t.short_description,'') ~* '${MARKER}'
        OR COALESCE(t.remarks,'') ~* '${MARKER}'
      )
  `);

  const integrity = {
    orphanComments: await count(`
      SELECT COUNT(*)::int AS c FROM ticket_comments c
      LEFT JOIN tickets t ON t.id = c.ticket_id WHERE t.id IS NULL`),
    orphanAssignments: await count(`
      SELECT COUNT(*)::int AS c FROM ticket_assignments a
      LEFT JOIN tickets t ON t.id = a.ticket_id WHERE t.id IS NULL`),
    orphanSla: await count(`
      SELECT COUNT(*)::int AS c FROM sla_tracking s
      LEFT JOIN tickets t ON t.id = s.ticket_id WHERE t.id IS NULL`),
    orphanTicketsBadOrg: await count(`
      SELECT COUNT(*)::int AS c FROM tickets t
      LEFT JOIN organisations o ON o.id = t.organisation_id
      WHERE t.organisation_id IS NOT NULL AND o.id IS NULL`),
  };

  const histSlugs = histOrgs.map((o) => o.slug).sort();
  const histOrgsOk =
    histSlugs.length === 3 &&
    histSlugs[0] === "demo" &&
    histSlugs[1] === "demoapex" &&
    histSlugs[2] === "pariskq";

  const pass =
    histOrgsOk &&
    remainingTestOrgs === 0 &&
    remainingMarker === 0 &&
    after.hist_non_marker_tickets >= 850 &&
    after.hist_non_marker_tickets <= 950 &&
    integrity.orphanComments === 0 &&
    integrity.orphanAssignments === 0 &&
    integrity.orphanSla === 0 &&
    integrity.orphanTicketsBadOrg === 0;

  return {
    after,
    histOrgs,
    unexpectedNonTestNonHistOrgs: unexpectedHist,
    remainingTestOrgs,
    remainingMarkerTickets: remainingMarker,
    integrity,
    histOrgsOk,
    pass,
  };
}

async function main() {
  if (process.env.CLEANUP_CONFIRM !== REQUIRED_CONFIRM) {
    console.error(
      `Refusing cleanup: set CLEANUP_CONFIRM=${REQUIRED_CONFIRM}`
    );
    process.exit(2);
  }

  ensureOutDir();
  const before = await countsSnapshot();
  console.log(JSON.stringify({ event: "before_counts", before }, null, 2));

  const backup = takeBackup();
  console.log(JSON.stringify({ event: "backup_done", backup }, null, 2));

  const { planned, deleted } = await runCleanup();
  const verification = await verify();

  const report = {
    generatedAt: new Date().toISOString(),
    confirm: REQUIRED_CONFIRM,
    backup,
    before,
    planned,
    deleted,
    verification,
    after: verification.after,
    delta: {
      organisations: before.organisations - verification.after.organisations,
      tickets: before.tickets - verification.after.tickets,
      ticket_comments: before.ticket_comments - verification.after.ticket_comments,
      ticket_assignments: before.ticket_assignments - verification.after.ticket_assignments,
      sla_tracking: before.sla_tracking - verification.after.sla_tracking,
      audit_logs: before.audit_logs - verification.after.audit_logs,
    },
  };

  const out = writeJson("test-fixture-cleanup-2a2b-report.json", report);
  // Also copy report next to backup
  try {
    fs.copyFileSync(out, path.join(backup.dir, "cleanup-report.json"));
  } catch {
    /* ignore */
  }

  console.log(JSON.stringify({ event: "cleanup_done", out, report }, null, 2));
  await prisma.$disconnect();
  if (!verification.pass) process.exit(3);
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
