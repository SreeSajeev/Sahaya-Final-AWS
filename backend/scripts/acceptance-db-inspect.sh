#!/usr/bin/env bash
# READ-ONLY TEST EC2 acceptance inspect. No secrets printed. No Supabase.
set -euo pipefail
cd "$(dirname "$0")/.."
export NODE_ENV="${NODE_ENV:-production}"

node --input-type=module <<'NODE'
import { prisma } from "./src/db/prisma.js";

function redactEmail(e) {
  if (!e || !String(e).includes("@")) return "***";
  const [l, d] = String(e).split("@");
  return (l?.slice(0, 2) || "") + "***@" + d;
}

const tables = await prisma.$queryRawUnsafe(`
  SELECT relname AS table_name, n_live_tup::bigint AS estimate
  FROM pg_stat_user_tables
  WHERE schemaname = 'public'
  ORDER BY relname
`);
console.log("=== TABLE ESTIMATES (pg_stat) ===");
for (const t of tables) console.log(`${t.table_name}\t${t.estimate}`);

const counts = {};
const exactTables = [
  "users","organisations","tickets","ticket_comments","ticket_assignments",
  "field_executives","sla_tracking","audit_logs","raw_emails","parsed_emails",
  "auth_sessions","password_reset_tokens","configurations","access_tokens",
  "fe_action_tokens","tenant_clients","tenant_complaint_points",
  "public_otp_sessions","public_complaint_submissions","fe_proof_backup_queue",
  "ticket_number_sequences","daily_tenant_report_runs","ticket_resolution_notifications"
];
for (const name of exactTables) {
  try {
    const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS c FROM "${name}"`);
    counts[name] = rows[0].c;
  } catch (e) {
    counts[name] = `ERR:${e.message?.slice(0,80)}`;
  }
}
console.log("=== EXACT COUNTS ===");
for (const [k,v] of Object.entries(counts)) console.log(`${k}\t${v}`);

const roles = await prisma.$queryRawUnsafe(`
  SELECT role, COUNT(*)::int AS c,
         COUNT(*) FILTER (WHERE password_hash IS NOT NULL)::int AS with_hash,
         COUNT(*) FILTER (WHERE is_active IS DISTINCT FROM false)::int AS activeish
  FROM users GROUP BY role ORDER BY role
`);
console.log("=== USERS BY ROLE ===");
for (const r of roles) console.log(`${r.role}\tcount=${r.c}\thash=${r.with_hash}\tactiveish=${r.activeish}`);

const orgs = await prisma.organisation.findMany({ select: { id: true, name: true, slug: true, status: true } });
console.log("=== ORGS ===");
for (const o of orgs) console.log(`${o.slug}\tstatus=${o.status}\tid=${o.id}`);

const integrity = {};
integrity.orphan_tickets_bad_org = (await prisma.$queryRawUnsafe(`
  SELECT COUNT(*)::int AS c FROM tickets t
  LEFT JOIN organisations o ON o.id = t.organisation_id
  WHERE t.organisation_id IS NOT NULL AND o.id IS NULL
`))[0].c;
integrity.orphan_comments = (await prisma.$queryRawUnsafe(`
  SELECT COUNT(*)::int AS c FROM ticket_comments c
  LEFT JOIN tickets t ON t.id = c.ticket_id WHERE t.id IS NULL
`))[0].c;
integrity.orphan_assignments = (await prisma.$queryRawUnsafe(`
  SELECT COUNT(*)::int AS c FROM ticket_assignments a
  LEFT JOIN tickets t ON t.id = a.ticket_id WHERE t.id IS NULL
`))[0].c;
integrity.orphan_assignments_fe = (await prisma.$queryRawUnsafe(`
  SELECT COUNT(*)::int AS c FROM ticket_assignments a
  LEFT JOIN field_executives f ON f.id = a.fe_id WHERE f.id IS NULL
`))[0].c;
integrity.orphan_sla = (await prisma.$queryRawUnsafe(`
  SELECT COUNT(*)::int AS c FROM sla_tracking s
  LEFT JOIN tickets t ON t.id = s.ticket_id WHERE t.id IS NULL
`))[0].c;
integrity.users_bad_org = (await prisma.$queryRawUnsafe(`
  SELECT COUNT(*)::int AS c FROM users u
  LEFT JOIN organisations o ON o.id = u.organisation_id
  WHERE u.organisation_id IS NOT NULL AND o.id IS NULL
`))[0].c;
integrity.dup_ticket_numbers = (await prisma.$queryRawUnsafe(`
  SELECT COUNT(*)::int AS c FROM (
    SELECT ticket_number FROM tickets GROUP BY ticket_number HAVING COUNT(*) > 1
  ) x
`))[0].c;
integrity.invalid_roles = (await prisma.$queryRawUnsafe(`
  SELECT COUNT(*)::int AS c FROM users
  WHERE role NOT IN ('SUPER_ADMIN','ADMIN','STAFF','FIELD_EXECUTIVE','CLIENT')
`))[0].c;
integrity.auth_sessions_active = (await prisma.$queryRawUnsafe(`
  SELECT COUNT(*)::int AS c FROM auth_sessions WHERE revoked_at IS NULL AND expires_at > NOW()
`))[0].c;
integrity.proof_paths = (await prisma.$queryRawUnsafe(`
  SELECT COUNT(*)::int AS c FROM ticket_comments
  WHERE attachments ? 'proof_storage_paths'
`))[0].c;
integrity.proof_base64ish = (await prisma.$queryRawUnsafe(`
  SELECT COUNT(*)::int AS c FROM ticket_comments
  WHERE attachments::text ILIKE '%base64%' OR attachments::text ILIKE '%data:image%'
`))[0].c;

console.log("=== INTEGRITY ===");
for (const [k,v] of Object.entries(integrity)) console.log(`${k}\t${v}`);

const cols = await prisma.$queryRawUnsafe(`
  SELECT table_name, column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema='public'
  ORDER BY table_name, ordinal_position
`);
const byTable = {};
for (const c of cols) {
  (byTable[c.table_name] ||= []).push(`${c.column_name}:${c.data_type}:${c.is_nullable}`);
}
console.log("=== PUBLIC TABLES (column inventory abbreviated) ===");
for (const [t, list] of Object.entries(byTable)) {
  console.log(`TABLE ${t} cols=${list.length}`);
}

const prismaTables = [
  "tickets","organisations","users","auth_sessions","password_reset_tokens","raw_emails",
  "parsed_emails","ticket_comments","audit_logs","tenant_clients","field_executives",
  "ticket_assignments","sla_tracking","fe_action_tokens","configurations","access_tokens",
  "tenant_complaint_points","public_otp_sessions","public_complaint_submissions",
  "ticket_number_sequences","daily_tenant_report_runs","fe_proof_backup_queue",
  "ticket_resolution_notifications"
];
const pgOnly = Object.keys(byTable).filter((t) => !prismaTables.includes(t));
const prismaMissing = prismaTables.filter((t) => !byTable[t]);
console.log("=== PG TABLES NOT IN PRISMA LIST ===");
console.log(pgOnly.join(",") || "(none)");
console.log("=== PRISMA TABLES MISSING IN PG ===");
console.log(prismaMissing.join(",") || "(none)");

const fks = await prisma.$queryRawUnsafe(`
  SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
  JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema='public'
  ORDER BY tc.table_name, kcu.column_name
`);
console.log("=== FK COUNT ===", fks.length);

const funcs = await prisma.$queryRawUnsafe(`
  SELECT proname FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' ORDER BY proname
`);
console.log("=== PUBLIC FUNCTIONS ===");
for (const f of funcs) console.log(f.proname);

const triggers = await prisma.$queryRawUnsafe(`
  SELECT event_object_table AS table_name, trigger_name
  FROM information_schema.triggers WHERE trigger_schema='public'
  ORDER BY 1,2
`);
console.log("=== TRIGGERS ===");
for (const t of triggers) console.log(`${t.table_name}\t${t.trigger_name}`);

const backups = await prisma.$queryRawUnsafe(`SELECT 1`);
console.log("=== DB_OK ===", Boolean(backups));

await prisma.$disconnect();
NODE
