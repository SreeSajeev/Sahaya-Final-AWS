# Domain Component Audit

> **Date:** June 2026  
> **Scope:** Five high-traffic domain components  
> **Companion:** `docs/ui-audit-v2.md`, `docs/design-system-v1.md`, `docs/component-migration-plan.md`  
> **Mode:** Read-only — no code changes

This audit evaluates domain components against shared primitives (`DataTableShell`, `MetricCard`, `PageHeader`, `typography` tokens) to determine which migration yields the largest UI consistency gain.

---

## Executive Summary

| Rank | Component | Consistency gain | Effort | Primary blocker today |
|------|-----------|------------------|--------|------------------------|
| **1** | `TicketsTable` | **Very high** | M–L (1–2 days) | Own border shell + loading/empty UI duplicates `DataTableShell` |
| **2** | `EmailsTable` | **High** | S–M (0.5–1 day) | Same shell duplication; only one page but completes Wave 2 table standardization |
| **3** | `TicketNumberDisplay` | **High reach, low surface** | S (2–4 hours) | Arbitrary `text-[10px]` prefix; caller-passed `numberClassName` bypasses tokens |
| **4** | `CountdownTimer` | **Medium** | M (0.5–1 day) | Embedded in `SLAMonitor.tsx`; raw Tailwind palette for SLA states |
| **5** | `FECard` | **Medium** | M (1 day) | Inner mini-KPIs duplicate `MetricCard` patterns; heavy custom colors |

**Recommendation:** Migrate **`TicketsTable` first**, then **`EmailsTable`**, to unlock clean `DataTableShell` usage on all migrated list pages and remove double-border workarounds on `ReviewQueue` and `RawEmails`.

---

## Shared Primitive Reference

| Primitive | Provides |
|-----------|----------|
| `DataTableShell` | `rounded-xl border border-border bg-card shadow-sm`, loading/empty states, `aria-label` |
| `dataTableHeadClassName` | Uppercase meta headers, `h-11 px-4` |
| `typography.body` | `text-sm font-normal` |
| `typography.meta` | `text-xs font-medium text-muted-foreground` |
| `typography.sectionTitle` | `text-lg font-semibold` |
| `typography.kpiValue` | `text-2xl font-semibold tracking-tight` |
| `MetricCard` | KPI tile with variants; `layout="horizontal"` for icon-left stats |
| `PageHeader` | Standard `h1` + icon + actions |

---

## 1. TicketsTable

**File:** `src/components/tickets/TicketsTable.tsx` (324 lines)

### Screens affected

| Page / context | Usage |
|----------------|-------|
| `TicketsList.tsx` | Full table, bulk select, pagination parent |
| `Dashboard.tsx` | `compact` mode — recent tickets embed |
| `ReviewQueue.tsx` | Full table inside `DataTableShell` (transparent override) |
| `TenantAdminDashboard.tsx` | Full table |
| `TenantView.tsx` | Full table with supplements |

**Reach:** 5 operational screens (highest of audited components).

### 1. Typography classes used

| Class / pattern | Where |
|-----------------|-------|
| `text-sm text-muted-foreground` | Loading message, dates, location, client slug, assigned FE |
| `text-sm` | Compact ticket #, location, client slug, dates |
| `text-xs text-muted-foreground` | Compact description line |
| `text-base font-semibold` | Empty state `h3` (not `sectionTitle`) |
| `text-2xl` | Empty state emoji container (decorative) |
| `text-sm text-primary` | Linked ticket # via `numberClassName` prop |
| `text-sm` + `font-mono` | Client slug cell |
| `font-medium` | — (not used) |
| `font-semibold` | Empty title only |
| `font-bold` | — |
| Default `TableHead` | Sentence case, `font-medium` from shadcn — **not** `dataTableHeadClassName` |

**Token mapping opportunity:** loading/empty/copy → `typography.body` / `typography.sectionTitle` / `typography.meta`; all body cells → `typography.body`.

### 2. Custom spacing values

| Value | Where |
|-------|-------|
| `h-48` | Loading + empty state height |
| `gap-3` | Loading spinner stack, compact row |
| `p-8` | Empty state padding |
| `mb-3` | Empty icon margin |
| `h-14 w-14` | Empty icon circle |
| `py-3 px-4` | Compact row padding |
| `p-6` | Full table inner padding (differs from `DataTableShell` / `p-4` cell default) |
| `max-w-[160px]`, `max-w-[280px]`, `max-w-[140px]` | Column width caps |
| `w-10` | Checkbox / priority columns |
| `gap-1.5`, `gap-2` | Icon gaps in cells |
| `mt-0.5`, `mt-1` | Micro offsets |

### 3. Custom colors

| Class | Where |
|-------|-------|
| `text-primary` | Ticket link |
| `text-muted-foreground` | Secondary text, disabled links |
| `ring-yellow-300/60`, `fill-yellow-500 text-yellow-500` | Priority star (raw palette) |
| `bg-muted`, `bg-muted/20`, `bg-muted/40` | Empty icon, zebra rows, hover |
| `bg-background` | Zebra rows |
| `ring-primary/30` | Selected bulk row |
| `border-primary` | Loading spinner |
| `hover:text-primary` | External link |

Uses semantic tokens for most surfaces; **priority star** uses raw yellow Tailwind.

### 4. Border / shadow implementations

| Implementation | Where |
|----------------|-------|
| `rounded-xl border bg-card overflow-hidden` | **Full table outer shell** — duplicates `DataTableShell` |
| `hover:shadow-sm` | Compact rows, full table rows |
| `ring-1 ring-primary/30` | Selected rows |
| `ring-2 ring-yellow-300/60` | Priority badge |
| `divide-y divide-border` | Compact mode list (no card shell) |
| `rounded-lg` | Compact row hover target |
| `rounded-full` | Empty icon, priority ring |

### 5. Duplication vs shared primitives

| Primitive | Duplicated? | Detail |
|-----------|-------------|--------|
| **DataTableShell** | **Yes — critical** | Own `rounded-xl border bg-card overflow-hidden` on full mode; own loading spinner + empty state (same structure as shell props); forces pages to use `border-0 shadow-none` transparent hack |
| **MetricCard** | No | N/A |
| **PageHeader** | No | N/A |
| **typography tokens** | **Partial** | All typography is inline Tailwind; empty title uses `text-base` not `sectionTitle` |

### Migration notes

- Remove outer shell from full mode; export table markup only.
- Move loading/empty to page-level `DataTableShell` **or** accept optional `embedded` prop that skips shell (prefer removal).
- Apply `dataTableHeadClassName` to `TableHead` cells.
- Compact mode stays domain-specific (Dashboard embed) — no `DataTableShell`.
- **Risk:** `TicketsList` bulk select + pagination layout must be regression-tested.

### Effort & impact

| Metric | Value |
|--------|-------|
| **Effort** | M–L (1–2 days) |
| **Reusability impact** | Unblocks 5 screens; eliminates double-border pattern on 2 migrated pages |
| **Priority** | **#1** |

---

## 2. EmailsTable

**File:** `src/components/emails/EmailsTable.tsx` (182 lines)

### Screens affected

| Page | Usage |
|------|-------|
| `RawEmails.tsx` | Sole consumer; wrapped in `DataTableShell` with transparent override when data present |

**Reach:** 1 screen (narrow but completes email ops flow).

### 1. Typography classes used

| Class / pattern | Where |
|-----------------|-------|
| `text-lg font-semibold` | Empty state title (matches `sectionTitle` size/weight but not token) |
| `text-muted-foreground` | Empty body (no `text-sm` — implicit inherit) |
| `font-medium text-sm` | Subject line |
| `text-xs text-muted-foreground` | Sender line |
| `text-sm text-muted-foreground` | Confidence fallback, received date, "Not parsed" |
| `text-xs` | Badges (parsed fields, complaint ID) |
| `text-sm` | Muted spans |
| Default `TableHead` | Sentence case headers |

### 2. Custom spacing values

| Value | Where |
|-------|-------|
| `space-y-3` | Loading skeleton stack |
| `h-20` | Skeleton row height |
| `py-16` | Empty state vertical padding |
| `h-16 w-16`, `mb-4` | Empty icon box |
| `max-w-md` | Empty description width |
| `space-y-1` | Subject/sender cell stack |
| `gap-1`, `gap-1.5` | Badge groups, action buttons |
| `w-[280px]`, `w-[320px]`, `w-[140px]`, `w-[120px]` | Fixed column widths |
| `h-8 w-8` | Icon action buttons (overrides default icon size) |

### 3. Custom colors

| Class | Where |
|-------|-------|
| `text-primary` | Create ticket button |
| `text-green-600` | Linked ticket external link button |
| `text-muted-foreground` | Secondary text, icons |
| `bg-muted` | Empty icon background |
| Semantic badge variants | `secondary`, `outline` |

### 4. Border / shadow implementations

| Implementation | Where |
|----------------|-------|
| `rounded-xl border bg-card` | **Outer shell** — duplicates `DataTableShell` (no `overflow-hidden` or `shadow-sm` — minor inconsistency vs TicketsTable shell) |
| `data-table-row` | Row hover (CSS class from `index.css`) |
| `rounded-2xl` | Empty icon container |

### 5. Duplication vs shared primitives

| Primitive | Duplicated? | Detail |
|-----------|-------------|--------|
| **DataTableShell** | **Yes** | Own border card; skeleton loading differs from shell `loading` prop; empty state duplicates shell `emptyState` pattern |
| **MetricCard** | No | N/A |
| **PageHeader** | No | N/A |
| **typography tokens** | **Partial** | All inline; empty `h3` is `text-lg font-semibold` ≈ `sectionTitle` |

### Migration notes

- Strip outer `rounded-xl border bg-card` wrapper.
- Optionally lift empty/loading to `RawEmails` + `DataTableShell` (page already partially migrated).
- Standardize action button sizes to shadcn `size="icon"` without `h-8 w-8` override.
- Replace `text-green-600` with `text-success` on linked-ticket action.

### Effort & impact

| Metric | Value |
|--------|-------|
| **Effort** | S–M (0.5–1 day) |
| **Reusability impact** | Removes last double-border hack in Wave 2; pattern parity with TicketsTable |
| **Priority** | **#2** (pair with TicketsTable migration) |

---

## 3. FECard

**File:** `src/components/field-executives/FECard.tsx` (205 lines incl. skeleton)

### Screens affected

| Page | Usage |
|------|-------|
| `FieldExecutives.tsx` | Primary grid + `FECardSkeleton` loading |
| `TenantView.tsx` | FE roster section |

**Reach:** 2 screens.

### 1. Typography classes used

| Class / pattern | Where |
|-----------------|-------|
| `text-lg font-bold` | Avatar initial in gradient box |
| `text-base` | `CardTitle` override (shadcn default is `text-2xl`) |
| `text-sm text-muted-foreground` | Location, email, phone, footer |
| `text-[10px]` | Resource kind badge, workload badge |
| `text-xs` | Skill badges, active/inactive badge, stat labels, SLA label |
| `text-lg font-bold` | Active tickets + resolved counts (mini-KPI values) |
| `font-semibold` | SLA compliance % |
| `font-medium` | Avg resolution value |
| `font-mono` | Phone number |

### 2. Custom spacing values

| Value | Where |
|-------|-------|
| `pb-3` | CardHeader override |
| `h-12 w-12` | Avatar box |
| `gap-3`, `gap-2`, `gap-1.5`, `gap-1` | Header, stats, badges |
| `mt-1`, `mt-0.5` | Location offset, icon align |
| `space-y-4`, `space-y-2`, `space-y-1` | CardContent sections |
| `pt-2` | Section dividers |
| `grid-cols-2 gap-3` | Mini stat grid inside card |
| `h-1.5` | Progress bar height |
| `h-3.5 w-3.5`, `h-4 w-4` | Icon sizes |

### 3. Custom colors

| Class | Where |
|-------|-------|
| `bg-gradient-to-br from-primary to-primary/80` | Active avatar |
| `bg-muted-foreground` | Inactive avatar |
| `border-amber-400 text-amber-800 bg-amber-50` | Outsourced resource badge |
| `border-slate-300 text-slate-700` | Own resource badge |
| `bg-green-500/10 text-green-600 border-green-200` | Active status badge |
| `text-white` | Avatar initial |
| Semantic `primary`, `muted-foreground` | Partial |

**Heavy raw palette usage** on resource and status badges.

### 4. Border / shadow implementations

| Implementation | Where |
|----------------|-------|
| shadcn `Card` + `card-interactive` | Hover lift (always on — unlike `MetricCard interactive={false}` default) |
| `border-t` | Internal section dividers (×2) |
| `rounded-xl` | Avatar box |
| Badge `border-*` | Resource/status outlines |
| `overflow-hidden` | Card root |

Uses standard Card primitive — **aligned with design system container**; inner layout is custom.

### 5. Duplication vs shared primitives

| Primitive | Duplicated? | Detail |
|-----------|-------------|--------|
| **DataTableShell** | No | Card grid, not table |
| **MetricCard** | **Partial** | Inner 2×2 stat block (`text-lg font-bold` + `text-xs` labels) mirrors horizontal MetricCard; SLA % row is unique |
| **PageHeader** | No | N/A |
| **typography tokens** | **No** | `text-[10px]`, `text-lg font-bold`, `text-base` CardTitle — all bypass tokens |

### Migration notes

- Replace inner stat values with `typography.kpiValue` or nested compact `MetricCard` without outer border.
- Resource badges → semantic `warning` / `muted` tokens.
- Active badge → `text-success` / `bg-success/10`.
- `CardTitle` → `typography.sectionTitle` (or fix global `CardTitle` and remove override).
- `card-interactive` → align with `MetricCard` `interactive` prop default.
- **Do not** replace entire FECard with MetricCard — card is a composite profile tile, not a KPI summary.

### Effort & impact

| Metric | Value |
|--------|-------|
| **Effort** | M (1 day) |
| **Reusability impact** | Medium — 2 screens; improves FE domain consistency with FieldExecutives page header/stats |
| **Priority** | **#5** |

---

## 4. CountdownTimer (+ SLAStatusIndicator)

**File:** `src/pages/SLAMonitor.tsx` lines 125–166 (not extracted)

### Screens affected

| Page | Usage |
|------|-------|
| `SLAMonitor.tsx` | 3× per table row (assignment, on-site, resolution SLA columns) |

**Reach:** 1 screen, high cell density (~150 cells visible per page at full page size).

### 1. Typography classes used

| Class / pattern | Where |
|-----------------|-------|
| `text-sm font-medium` | Time remaining string |
| `text-xs` | Tooltip body |
| Badge label text | Inherited from `Badge` component (typically `text-xs`) |

`SLAStatusIndicator` has no explicit text size — relies on Badge defaults.

### 2. Custom spacing values

| Value | Where |
|-------|-------|
| `gap-2` | Badge + time + tooltip row |
| `gap-1.5` | Inside `SLAStatusIndicator` badge |
| `h-3 w-3` | Status icons in badge |
| `h-3.5 w-3.5` | Info tooltip icon |

### 3. Custom colors

| Class | Where |
|-------|-------|
| `text-green-600 bg-green-50 border-green-200` | On-track indicator |
| `text-amber-600 bg-amber-50 border-amber-200` | At-risk indicator |
| `text-red-600 bg-red-50 border-red-200` | Breached indicator |
| `text-blue-600 bg-blue-50 border-blue-200` | Paused indicator |
| `text-red-600`, `text-amber-600`, `text-blue-600` | Time remaining text by status |
| `text-muted-foreground` | Info icon |

**All SLA semantic colors use raw Tailwind palette** — should map to `success`, `warning`, `destructive`, `info` tokens.

### 4. Border / shadow implementations

| Implementation | Where |
|-------|-------|
| `Badge variant="outline"` + per-status border classes | SLA status chip |
| No card shell | Inline table cell content |

### 5. Duplication vs shared primitives

| Primitive | Duplicated? | Detail |
|-----------|-------------|--------|
| **DataTableShell** | No | Renders inside parent table |
| **MetricCard** | No | Different concern (status chip, not KPI) |
| **PageHeader** | No | N/A |
| **typography tokens** | **Partial** | `text-sm font-medium` ≈ `typography.body` + `font-medium`; time text should use `typography.body` |

### Migration notes

- Extract to `src/components/sla/CountdownTimer.tsx` + `SLAStatusIndicator.tsx`.
- Map status config to semantic tokens (mirror `.status-badge` / `index.css` status colors).
- Consider shared `SLAStatusBadge` used in table cells and future ticket detail SLA blocks.
- Tooltip copy → `typography.meta`.
- **No MetricCard overlap.**

### Effort & impact

| Metric | Value |
|--------|-------|
| **Effort** | M (0.5–1 day) incl. extraction + token migration |
| **Reusability impact** | Medium — single screen today; enables TicketDetail / dashboard SLA widgets later |
| **Priority** | **#4** |

---

## 5. TicketNumberDisplay

**File:** `src/components/common/TicketNumberDisplay.tsx` (45 lines)

### Screens affected

| Consumer | Context |
|----------|---------|
| `TicketsTable.tsx` | List + compact rows |
| `TicketDetail.tsx` | Page title |
| `ClientTicketDetail.tsx` | Page title + card |
| `SLAMonitor.tsx` | Table link cell |
| `AuditLogs.tsx` | Log table |
| `ClientDashboard.tsx` | Custom table + drawer |
| `SuperAdminOrgView.tsx` | Org ticket table |
| `AssignmentConfirmDialog.tsx` | Modal |
| `BulkGroupAssignModal.tsx` | Modal list |
| `FEAssignmentModal.tsx` | Modal |
| `CloseTicketDialog.tsx` | Dialog |

**Reach:** 11 files — **widest propagation** of audited components.

### 1. Typography classes used

| Class / pattern | Where |
|-----------------|-------|
| `text-[10px] font-semibold uppercase tracking-wide` | Tenant prefix badge — **arbitrary size** |
| `font-mono` | Ticket number (always) |
| `font-semibold` | Number when prefix shown |
| Caller `numberClassName` | e.g. `text-sm`, `text-sm text-primary`, `text-2xl` — **bypasses tokens entirely** |
| Caller `prefixClassName` | Optional override (rare) |
| `text-muted-foreground` | Prefix badge text |

### 2. Custom spacing values

| Value | Where |
|-------|-------|
| `gap-1.5` | Prefix + number inline flex |
| `px-1.5 py-0.5` | Prefix badge padding |
| `min-w-0` | Flex truncation |
| `truncate` | Long ticket numbers |

### 3. Custom colors

| Class | Where |
|-------|-------|
| `border-border` | Prefix badge border |
| `bg-muted/50` | Prefix badge background |
| `text-muted-foreground` | Prefix label |
| Caller-driven `text-primary` | Link styling in tables |

Mostly semantic; callers add primary link color.

### 4. Border / shadow implementations

| Implementation | Where |
|----------------|-------|
| `rounded border` | Prefix badge only |
| No shadow | — |

### 5. Duplication vs shared primitives

| Primitive | Duplicated? | Detail |
|-----------|-------------|--------|
| **DataTableShell** | No | Inline display |
| **MetricCard** | No | N/A |
| **PageHeader** | **Indirect** | `TicketDetail` passes `numberClassName="text-2xl"` — duplicates page-title scale inside `h1` instead of using PageHeader title slot |
| **typography tokens** | **Partial** | Prefix uses `text-[10px]` instead of `typography.meta`; no default `numberClassName` from tokens |

### Migration notes

- Replace `text-[10px]` with `typography.meta` + `uppercase tracking-wide`.
- Add `variant?: 'default' | 'link' | 'title'` instead of free-form `numberClassName` where possible:
  - `default` → `typography.body` + mono
  - `link` → `typography.body` + `text-primary`
  - `title` → `typography.pageTitle` + mono (for detail headers)
- Keep `numberClassName` as escape hatch for gradual migration.
- **Small file, large blast radius** — migrate callers incrementally.

### Effort & impact

| Metric | Value |
|--------|-------|
| **Effort** | S (2–4 hours) for component; +S (half day) to update major callers |
| **Reusability impact** | High — every ticket identifier across app becomes consistent |
| **Priority** | **#3** (do after table shells, before FECard) |

---

## Cross-Component Comparison

### DataTableShell overlap

```
Page (DataTableShell)
  └── TicketsTable (rounded-xl border bg-card)  ← DOUBLE SHELL
  └── EmailsTable (rounded-xl border bg-card)     ← DOUBLE SHELL
```

Both domain tables also implement **loading** and **empty** states that `DataTableShell` already supports. Pages currently use conditional `border-0 shadow-none` to compensate.

### Typography token adoption

| Component | Inline Tailwind | Arbitrary sizes | Token-ready? |
|-----------|-----------------|-----------------|--------------|
| TicketsTable | Heavy | No | Medium effort |
| EmailsTable | Heavy | No | Low effort |
| FECard | Heavy | `text-[10px]` | Medium effort |
| CountdownTimer | Light | No | Low effort (+ color tokens) |
| TicketNumberDisplay | Light | `text-[10px]` | **Low effort, high reward** |

### MetricCard overlap

Only **FECard** inner stat grid (`active_tickets`, `resolved_this_week`) overlaps MetricCard horizontal layout. Not a full replacement candidate.

---

## Recommended Migration Sequence

### Phase A — Table shell unification (largest consistency gain)

1. **TicketsTable** — remove shell; adopt `dataTableHeadClassName`; document compact mode exception.
2. **EmailsTable** — same treatment.
3. Update **ReviewQueue**, **RawEmails**, **TicketsList**, **Dashboard**, **TenantView**, **TenantAdminDashboard** to own `DataTableShell` without transparent hacks.

**Outcome:** One border, one loading pattern, one empty pattern for all ticket/email lists.

### Phase B — Identifier typography

4. **TicketNumberDisplay** — tokenize prefix; add `variant` prop; update `TicketsTable`, `TicketDetail`, `SLAMonitor` callers.

**Outcome:** Consistent ticket # hierarchy app-wide.

### Phase C — SLA domain extraction

5. Extract **CountdownTimer** + **SLAStatusIndicator**; semantic status colors.

**Outcome:** Reusable SLA cell for future ticket detail / dashboard widgets.

### Phase D — FE profile card

6. **FECard** — tokenize typography; semantic badge colors; optional inner stat token pass.

**Outcome:** Aligns with FieldExecutives page primitives already migrated.

---

## Pages Still Affected After Full Domain Migration

| Page | Components touched |
|------|-------------------|
| `TicketsList` | TicketsTable shell removal |
| `Dashboard` | TicketsTable compact + full |
| `ReviewQueue` | TicketsTable — remove transparent DataTableShell hack |
| `TenantAdminDashboard` | TicketsTable |
| `TenantView` | TicketsTable + FECard |
| `RawEmails` | EmailsTable — remove transparent hack |
| `FieldExecutives` | FECard |
| `SLAMonitor` | CountdownTimer extraction + TicketNumberDisplay variant |
| `TicketDetail` / `ClientTicketDetail` | TicketNumberDisplay variant |
| `AuditLogs`, `ClientDashboard`, modals | TicketNumberDisplay variant only |

---

## Risk Register

| Risk | Component | Mitigation |
|------|-----------|------------|
| Double-border regression | TicketsTable, EmailsTable | Migrate shell + pages in same PR |
| Compact mode layout break | TicketsTable | Dashboard visual QA |
| Bulk select row styling | TicketsTable | TicketsList E2E / manual QA |
| Ticket # size regressions | TicketNumberDisplay | `variant` prop with snapshot per context |
| SLA color meaning change | CountdownTimer | Map to semantic tokens preserving hue intent |
| FECard outsourced badge visibility | FECard | Contrast check on `warning` tokens |

---

## Conclusion

**`TicketsTable` migration provides the largest consistency gain** because it:

1. Serves **5 screens** (most of any audited component).
2. **Directly duplicates `DataTableShell`** — the primitive pages are already adopting.
3. Forces resolution of loading/empty state ownership.
4. Unblocks removal of page-level border workarounds on migrated Wave 2 pages.

Pair **`EmailsTable`** immediately after for the same pattern. **`TicketNumberDisplay`** is the highest **reach-per-line** improvement. **`CountdownTimer`** and **`FECard`** are valuable but narrower in scope.

---

*End of domain component audit.*
