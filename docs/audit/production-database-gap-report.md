# Production Database Gap Report

**Prod runtime:** Supabase-primary (`supabaseClient.js`); Prisma schema is a **stub** (`Ticket` only)  
**AWS runtime:** Prisma on EC2 PostgreSQL (`Sahaya-Final-AWS/backend/prisma/schema.prisma`)

---

## Modeling posture (important)

| Aspect | Production | AWS |
|--------|------------|-----|
| Source of truth for app queries | Supabase JS / PostgREST | Prisma Client |
| Prisma models | 1 (`Ticket`) | 23 models |
| Migrations in repo | Minimal / stub | `20260802160000_phase_d_local_auth` (+ duplicate folder name observed) |

**Conclusion:** Comparing “Prisma schema ↔ Prisma schema” is **not** apples-to-apples. AWS schema is a reconstructed model of the live Postgres tables. Gaps below are about **post-divergence production behavior** and **known semantic drift**, not “prod has tables AWS lacks.”

---

## AWS Prisma models present (23)

`Ticket`, `Organisation`, `User`, `AuthSession`, `PasswordResetToken`, `RawEmail`, `ParsedEmail`, `TicketComment`, `AuditLog`, `TenantClient`, `FieldExecutive`, `TicketAssignment`, `SlaTracking`, `FeActionToken`, `Configuration`, `AccessToken`, `TenantComplaintPoint`, `PublicOtpSession`, `PublicComplaintSubmission`, `TicketNumberSequence`, `DailyTenantReportRun`, `FeProofBackupQueue`, `TicketResolutionNotification`

These cover the May–June production feature surface (tenant clients, public OTP/complaints, audit, daily reports, numbering sequences, proof backup queue).

---

## Ticket field parity (selected)

| Concern | Prod (code usage) | AWS Prisma | Status |
|---------|-------------------|------------|--------|
| `priority` + `priority_level` | Yes (`normalizeTicketPriority`) | `priority`, `priorityLevel` | COMPLETE |
| Geographic `state` | Yes | `state String?` | COMPLETE |
| `review_notes` | Yes | `reviewNotes` | COMPLETE |
| `ticket_number` / source-aware | RPC `allocate_ticket_sequence` | `TicketNumberSequence` model | COMPLETE (different allocator impl) |
| Resolution OTHER details | Stored in verification remarks / category | Fields present; **CSV/email formatting missing** (`860d3b9`) | 🟡 PARTIAL (data vs export) |

---

## Auth tables (AWS-ahead)

AWS-only Prisma models for local auth (not in prod Prisma stub; prod uses Supabase Auth):

- `AuthSession`
- `PasswordResetToken`
- `User.passwordHash`

**Status:** N/A for production→AWS port (already on AWS).

---

## Missing columns / tables / indexes from post-divergence commits

Post-divergence commits `860d3b9` and `b02ecda` introduced **no new tables/columns**.

| Item | Finding |
|------|---------|
| Missing columns for July features | **None required** |
| Missing tables | **None** for post-divergence deltas |
| Missing indexes | Unable to verify live index set without DB connect (not performed — read-only filesystem audit) |
| Missing constraints | Unable to verify live DB constraints without DB connect |
| Missing relationships | AWS Prisma relations appear modeled; Unable to verify FK enforcement on live TEST RDS without credentials |

---

## Repository / query gaps

| Query behavior | Prod | AWS | Status |
|----------------|------|-----|--------|
| Analytics `staff_users` load | Supabase `users` where role in STAFF/ADMIN | **Not implemented** | ❌ MISSING (`860d3b9`) |
| Dashboard resolved date filter | `resolved_at` only | Also filters `openedAt` | 🟡 PARTIAL |
| Daily CSV Other columns | Helpers in `dailyTicketReportCsvService.js` | Absent | ❌ MISSING |

---

## SQL / migrations note

Production historical SQL dumps exist under `sahaya/` (`sahaya.sql`, `supabase_dump.sql`) but were **not** treated as the live schema source for this audit (dumps may be stale relative to HEAD). AWS migrations only cover Phase D local auth additive pieces; historical tables assumed pre-existing on EC2 Postgres.

**Unable to verify:** exact live column nullability / check constraints on TEST vs production Supabase without connecting to either database.
