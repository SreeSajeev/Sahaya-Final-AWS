#!/usr/bin/env node
/**
 * READ-ONLY supplement: quantify TEST-marker rows inside HISTORICAL orgs.
 * Does not delete. Complements classify-test-orgs.mjs.
 */
import "dotenv/config";
import fs from "node:fs";
import { prisma } from "../../src/db/prisma.js";
import { writeJson, ensureOutDir } from "./lib.mjs";

const KNOWN = ["pariskq", "demo", "demoapex"];
const MARKER = `(PHASE_|E2E_|ACCEPTANCE|SOAK|LOAD_TEST|FIXTURE|CONVERGENCE_PROBE|E2E_TEST)`;

async function count(sql) {
  const rows = await prisma.$queryRawUnsafe(sql);
  return Number(rows[0]?.c ?? 0);
}

async function main() {
  ensureOutDir();
  const orgs = await prisma.organisation.findMany({
    where: { slug: { in: KNOWN } },
    select: { id: true, slug: true, name: true },
  });
  const ids = orgs.map((o) => `'${o.id}'`).join(",");

  const ticketFilter = `
    organisation_id IN (${ids})
    AND (
      COALESCE(short_description,'') ~* '${MARKER}'
      OR COALESCE(remarks,'') ~* '${MARKER}'
    )
  `;

  const markerTickets = await count(`SELECT COUNT(*)::int AS c FROM tickets WHERE ${ticketFilter}`);
  const nonMarkerTickets = await count(`
    SELECT COUNT(*)::int AS c FROM tickets
    WHERE organisation_id IN (${ids})
      AND COALESCE(short_description,'') !~* '${MARKER}'
      AND COALESCE(remarks,'') !~* '${MARKER}'
  `);

  const markerTicketIds = `SELECT id FROM tickets WHERE ${ticketFilter}`;

  const report = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    historicalOrgs: orgs,
    insideHistoricalOrgs: {
      totalTickets: markerTickets + nonMarkerTickets,
      TEST_MARKER_tickets: markerTickets,
      NON_MARKER_historical_tickets: nonMarkerTickets,
      comments_on_marker_tickets: await count(
        `SELECT COUNT(*)::int AS c FROM ticket_comments WHERE ticket_id IN (${markerTicketIds})`
      ),
      assignments_on_marker_tickets: await count(
        `SELECT COUNT(*)::int AS c FROM ticket_assignments WHERE ticket_id IN (${markerTicketIds})`
      ),
      sla_on_marker_tickets: await count(
        `SELECT COUNT(*)::int AS c FROM sla_tracking WHERE ticket_id IN (${markerTicketIds})`
      ),
      audit_logs_total_in_hist_orgs: await count(
        `SELECT COUNT(*)::int AS c FROM audit_logs WHERE organisation_id IN (${ids})`
      ),
    },
    emptyTestOrgsNote:
      "classify-test-orgs found 22 TEST organisations with ~0 dependent rows; most fixture tickets live under historical orgs (especially pariskq) with marker short_description/remarks.",
    recommendation:
      "Phase 2A: delete empty TEST organisations only (safe). Phase 2B (separate approval): delete TEST-MARKER tickets inside historical orgs + dependents — does NOT delete organisations pariskq/demo/demoapex.",
  };

  // Also dump classification file summary if present
  const classPath = "/var/backups/sahaya/phase-f/test-fixture-org-classification.json";
  if (fs.existsSync(classPath)) {
    const cls = JSON.parse(fs.readFileSync(classPath, "utf8"));
    report.classificationSummary = cls.summary;
    report.testOrganisations = (cls.testOrganisations || []).map((o) => ({
      id: o.id,
      slug: o.slug,
      name: o.name,
      createdAt: o.createdAt,
      impact: o.impact,
      confidence: o.confidence,
    }));
    report.historicalOrganisations = cls.historicalOrganisations;
    report.globalCountsBefore = cls.globalCountsBefore;
  }

  const out = writeJson("test-fixture-marker-rows-in-historical.json", report);
  console.log(JSON.stringify({ event: "marker_rows_in_historical_done", out, report }, null, 2));
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
