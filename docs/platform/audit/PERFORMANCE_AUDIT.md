# PERFORMANCE AUDIT

**Scope:** Metadata Platform  
**Date:** 2026-08-09  
**Method:** Code path analysis + micro-probes. **No 1k/5k/10k concurrent user load harness was run** — absence is itself a finding.

---

## Measured probes

| Probe | Result | Notes |
|-------|--------|-------|
| Field regex `(a+)+$` × 25 `a` | **~4428 ms** | Form validation path |
| Field regex short input | ~5 ms | Still unsafe pattern class |
| Safe regex reject ×100 | &lt;200 ms (prior unit smoke) | Parser path only |
| Report project 2k tickets (unit smoke) | &lt;1s | In-memory only |
| Coexistence form+publish+ticket | ~213 ms | Single tenant happy path |

---

## Structural performance risks (evidence)

| Risk | Evidence | Severity |
|------|----------|----------|
| Reports/dashboards load **≤5000** `platform_tickets` into Node | `engineRoutes.js` `listPlatformTickets(..., { limit: 5000 })` | P0 at scale |
| Search is naive in-process filter | `search-engine` + optional SQL `q` on runtime list | P1 |
| Registry full snapshot rewrite on every form publish | `publishFormToRegistry` RMW entire catalog | P1 |
| N+1 potential on ticket data | ticket create writes ticket + data + audit + automations sequentially | P1 |
| Exclusive gate **extra DB round-trip** on every authenticated legacy ticket request | `exclusiveRuntimeGate` → `getOrganisationPlatformMode` | P1 (LEGACY tax) |
| No query plan / EXPLAIN evidence | Not collected | Gap |
| No index audit on `platform_ticket_data` JSON | Migrations additive; no soak | Gap |
| Formula `new Function` compile per eval | Hot path if used at scale | P1 |

---

## Benchmarks **not** executed (requested but missing)

- 100 / 500 / 1000 / 5000 / 10000 concurrent users  
- Form/workflow publish under contention  
- Notification render at volume  
- Automation fan-out  
- CPU/memory/lock contention profiling  

**These cannot be claimed green.**

---

## Performance score: **28 / 100**

Reasons: proven ReDoS on form regex; 5k ticket pull; no load suite; LEGACY gate query tax.
