# BUILDER FUNCTIONAL AUDIT

**Scope:** All Metadata builders + runtime under `frontend/src/platform`, engines under `backend/src/platform`  
**Method:** Code-path completeness matrix + targeted engine probes  
**Date:** 2026-08-09  

**Important:** Unit/integration greens do **not** equal enterprise functional completeness. Many claimed capabilities are UI labels or stubs.

---

## Coverage matrix legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Implemented end-to-end with evidence |
| ⚠️ | Partial / simulation / UI-only |
| ❌ | Missing / fake / not wired |
| 💥 | Broken / unsafe under adversarial probe |

---

## 1. Form Builder

| Capability | Status | Evidence |
|------------|--------|----------|
| Field palette / add fields | ✅ | `FormBuilderPage.tsx` |
| 1–4 column / tabs / wizard / accordion layout | ⚠️ | Layout JSON generated; renderer partial; no true DnD resize/snap |
| 100-field forms | ⚠️ | No hard limit found; no soak test executed |
| Nested containers / repeat groups UX | ⚠️ | `repeater` type renders crude rows; no nested designer |
| Conditional visibility | ⚠️ | equals-only in FE/BE; no deep expression builder |
| Calculated fields | 💥/⚠️ | Backend formula exists; FE preview is read-only placeholder; **sandbox escape** (see security) |
| Lookup / dependent dropdowns | ❌ | Types listed; no data source / cascade wiring |
| Permissions per field/section | ❌ | Property shape mentioned; no RBAC UI persistence |
| Templates | ✅ | `forms/templates.js` + UI load |
| Import JSON/CSV | ⚠️ | JSON/CSV import; YAML claims JSON-compatible only |
| Export JSON | ✅ | |
| Publish → form versions + registry | ✅ | `formService.publishFormVersion` |
| Rollback / clone / compare (form-native) | ❌ | Form uses form_versions list text; not full VersionPanel flows |
| Preview desktop/tablet/mobile/print/dark | ⚠️ | Width/theme toggles only |
| Server/async/unique validation | ❌ | Sync schema validation only |

**Functional score (forms): 48/100**

---

## 2. Workflow Builder

| Capability | Status | Evidence |
|------------|--------|----------|
| Visual canvas states/transitions | ✅ | SVG canvas |
| Pan / zoom / snap drag | ⚠️ | Basic |
| Mini-map | ❌ | Decorative rect only |
| Parallel approvals / merge / subflows | ❌ | Not in engine model |
| Timers / escalations | ❌ | UI not present |
| Cycle detection | ✅ | `detectWorkflowCycles` — probe confirmed `hasCycle: true` |
| Deadlock heuristic | ✅ | `detectWorkflowDeadlocks` |
| Simulation of transitions | ⚠️ | Engine preview API exists; builder uses Analyze more than full sim UX |
| Publish to artifact versions | ✅ | |
| Publish to registry | ❌ | `publishWorkflowToRegistry` never called |
| 50-state soak | ❌ | Not tested |

**Functional score (workflows): 42/100**

---

## 3. Email Parser

| Capability | Status | Evidence |
|------------|--------|----------|
| Regex / keyword / sender | ✅ | parser-engine + UI |
| Live preview | ✅ | |
| Safe regex gate | ✅ | `(a+)+$` rejected by parser |
| AI extraction | ⚠️ | Deterministic **ai_stub** only |
| OCR / PDF / DOCX / Excel / scanned | ❌ | Absent |
| MIME / Outlook / Gmail / attachments / 100MB / ZIP bombs | ❌ | Absent |
| Persist + publish | ⚠️ | save + artifact publish; versioned rule store incomplete |
| Replay history | ⚠️ | Client-side session list only |

**Functional score (parser): 35/100**

---

## 4. Assignment Builder

| Capability | Status | Evidence |
|------------|--------|----------|
| Strategies (RR, least load, skill, location) | ⚠️ | Engine strategies + UI list; business hours/holiday not executed in resolve |
| Simulation | ⚠️ | Hardcoded candidates (`Asha`, `u1`) |
| Thousands of users / escalation chains | ❌ | Not implemented |
| Registry field hints | ⚠️ | Read on mount |

**Functional score: 40/100**

---

## 5. Notification Builder

| Capability | Status | Evidence |
|------------|--------|----------|
| Multi-channel selector UI | ⚠️ | Channel string only; no real SMS/Slack/Teams send |
| Variable picker from registry | ⚠️ | On mount fetch; inserts broken paths sometimes |
| Escaped preview | ✅ | XSS probe: script escaped |
| Test send / scheduling / localization | ❌ | Absent |
| Recursive templates | ❌ | Not guarded beyond escape |

**Functional score: 38/100**

---

## 6. Automation Builder

| Capability | Status | Evidence |
|------------|--------|----------|
| JSON definition editor | ⚠️ | Not visual canvas |
| Simulate | ✅ | |
| Loop/cycle protection | ✅ | Probe: `AUTOMATION_CYCLE` |
| DLQ / execution logs / metrics store | ⚠️ | In-memory budget snapshot only; no durable DLQ |
| 10k automations / parallel | ❌ | Not tested / not designed |

**Functional score: 45/100**

---

## 7. Dashboard Builder

| Capability | Status | Evidence |
|------------|--------|----------|
| Add widgets | ⚠️ | Button add; not DnD |
| Bind KPI preview | ⚠️ | Uses ≤5000 tickets in-process |
| Maps/heatmaps/calendar real viz | ❌ | Labels only |
| 100 widgets / perf | ❌ | Not tested |
| Sharing / permissions | ❌ | |

**Functional score: 30/100**

---

## 8. Report Builder

| Capability | Status | Evidence |
|------------|--------|----------|
| Columns from registry | ⚠️ | On mount |
| Run projection | ⚠️ | ≤5000 tickets; no SQL joins/pivot engine |
| CSV export | 💥 | JSON dumped as `.csv` (`EnterpriseBuilders.tsx`) |
| Excel/PDF/scheduled | ❌ | |
| 100k / 1M rows | ❌ | Explicitly not implemented |

**Functional score: 28/100**

---

## 9. AI Builder

| Capability | Status | Evidence |
|------------|--------|----------|
| Prompt config CRUD + version | ⚠️ | Artifact publish |
| Providers OpenAI/Azure/Bedrock | ❌ | UI options; backend stub only |
| Cost/latency tracking | ❌ | |
| Prompt injection hardening | ❌ | |

**Functional score: 22/100**

---

## 10. Plugin Builder

| Capability | Status | Evidence |
|------------|--------|----------|
| Config JSON + webhook validate | ⚠️ | URL scheme check |
| OAuth / secrets vault / GraphQL exec | ❌ | Config fields only |
| Marketplace packaging | ⚠️ | JSON download labeled “Package” |

**Functional score: 25/100**

---

## Cross-builder functional claim (critical)

**Claim:** Publish field → appears everywhere automatically.

**Evidence against:**
1. Only forms update registry.
2. Consumers fetch registry once on mount — **manual refresh required**.
3. Runtime create ignores published forms (`SAMPLE_SCHEMA`).
4. Workflows never call `publishWorkflowToRegistry`.

**Cross-builder score: 18/100**

---

## Runtime functional

| Capability | Status | Evidence |
|------------|--------|----------|
| Create ticket | ⚠️ | Works but trusts client schema |
| List/get/transition | ⚠️ | Basic |
| Comments/attachments/activity/@mentions | ❌ | Not in platform runtime UI |
| Offline / autosave / bulk | ❌ | Phase 4 not done |
| 10k tickets soak | ❌ | Not run |

**Runtime score: 32/100**

---

## Overall builder completeness: **34 / 100**
