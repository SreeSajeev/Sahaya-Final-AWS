# Production Workflow Gap Report

Status: **COMPLETE** | **PARTIAL** | **MISSING**  
Basis: route/UI presence + post-divergence commit evidence.

---

| Workflow | Status | Evidence / gap |
|----------|--------|----------------|
| Tenant onboarding | COMPLETE | Orgs APIs + UI on both; AWS adds PATCH |
| Tenant editing | COMPLETE | AWS PATCH; prod editing via existing org flows — Unable to verify every field parity without UI walkthrough |
| Tenant deletion | Unable to verify | No explicit delete route confirmed in either `app.js` mount survey as a dedicated delete-tenant workflow |
| Client management | COMPLETE | Feature-flagged clients pages + APIs |
| User management | COMPLETE | `/data/users`, admin approval/status |
| FE onboarding | COMPLETE | `/field-executives` + UI; outsourced kind present |
| Service Manager onboarding | COMPLETE | User roles + provision flags |
| Ticket creation | PARTIAL | Core create present; **location required** (`43dca0d`) missing on AWS |
| Ticket assignment | COMPLETE | `assignmentService` + UI |
| Ticket reassignment | COMPLETE | `POST /:id/reassign` + UI (`d30cc42` / `d5073a3`) |
| Review queue | COMPLETE | needs-review + review-complete + review notes config |
| Proof upload | PARTIAL | Works on both; AWS max 5 FE / **no backend 10-cap**; missing compress/zoom UX |
| Proof review | COMPLETE | Ticket detail / close validation present |
| Ticket close | COMPLETE | Close route + validation services |
| Dashboard | PARTIAL | Filters present; resolved KPI date semantics differ |
| Analytics | PARTIAL→MISSING | July enterprise suite + `staff_users` missing |
| Reports | PARTIAL | Daily worker present; CSV Other columns + ops Excel missing |
| Bulk import | COMPLETE | Gated routes + modal |
| Bulk assign | COMPLETE | Gated routes + toolbar |
| Notifications | PARTIAL | Core present; OTHER email label enrichment missing (`860d3b9`) |
| Email | PARTIAL | Same as notifications for OTHER display |
| SMS | COMPLETE | smsService + flags + debug routes |
| Public complaints | COMPLETE | QR/OTP/submit gated |
| OTP | COMPLETE | `/public/send-otp`, `/verify-otp` |
| Password reset | COMPLETE | Both (different auth backends) |
| Authentication | COMPLETE | Different impl (Supabase vs local JWT) — AWS-ahead for TEST |
| Session management | COMPLETE | AWS AuthSession; prod Supabase sessions |
| RBAC | COMPLETE | Role policies present both sides |

---

## Bug-fix audit (production → AWS)

### Post-divergence bug fixes

| SHA | Fix | AWS |
|-----|-----|-----|
| `fb1bd84` | Restore proof image previews / upload UX | ❌ MISSING (FEActionPage differs) |

### Pre-divergence bug fixes (spot-checked for presence)

| SHA | Fix | AWS presence |
|-----|-----|--------------|
| `020c754` | Audit tenant resolution | Present in snapshot services (auditLog*) — Unable to verify bit-identical query |
| `8d00823` | Audit log query builder | Present |
| `e08509e` / `31a157f` | Password reset / forgot flow | Present (rewired to local auth on AWS) |
| `b22a457` | SLA Monitor null-safe | SLA page exists both; Unable to verify identical null guards line-by-line |
| `3ae0e4c` / `71cc90f` | PII redaction | Redaction utilities expected in snapshot — Unable to verify every call site |
| `f771616` / `37cabc9` | Production API URL safety | AWS uses TEST API host in CSP — environment-appropriate |
| `2654fc9` | StatusBadge import | TicketDetail present both |
| Cross-tenant FE assign hardening | AWS commit `7458e66` | AWS-ahead security fix |

**Verdict:** No evidence that major pre-June production bug fixes were dropped from the AWS snapshot. Confirmed **missing** post-June proof UX fix and proof max enforcement.
