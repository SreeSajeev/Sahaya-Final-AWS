# Sahaya Operational Design System v1

> **Status:** Proposed — pre-implementation  
> **Audience:** Frontend engineers standardizing `field-ops-assist`  
> **Companion:** `docs/ui-audit-v2.md`  
> **Excludes:** Marketing (`SahayaLanding`, `EnquiryPage`), public report flows

This document defines the **unified design system for the operational platform** — concrete tokens, component APIs, and a phased migration plan. No code has been changed yet.

---

## Design Principles

1. **One pattern per concern** — page header, KPI card, filter bar, data table, primary button.
2. **Semantic tokens over raw Tailwind** — pages compose primitives; they do not invent typography or spacing.
3. **Brand tokens first** — use `primary`, `accent`, `success`, `warning`, `destructive`; avoid `text-green-600` etc.
4. **Mobile-first** — 44px touch targets preserved from existing Button primitive.
5. **Progressive migration** — high-traffic pages first; FE mobile and client portal in dedicated phases.

---

## Typography Tokens

Five tokens cover all operational UI. Map to Tailwind via `tailwind.config.ts` extensions.

| Token | Tailwind alias | Size / line-height | Weight | Letter-spacing | Use |
|-------|----------------|-------------------|--------|----------------|-----|
| `page-title` | `text-page-title` | `1.5rem` / `2rem` (24px / 32px) | `font-semibold` (600) | `tracking-tight` (-0.02em) | Every app-shell `h1`, detail page primary identifier |
| `kpi-value` | `text-kpi-value` | `1.5rem` / `2rem` (24px) | `font-semibold` (600) | `tracking-tight` | Metric card numbers, welcome strip values |
| `section-title` | `text-section-title` | `1.125rem` / `1.75rem` (18px) | `font-semibold` (600) | `tracking-tight` | `h2`, `CardTitle`, modal section headers |
| `body` | `text-body` | `0.875rem` / `1.25rem` (14px) | `font-normal` (400) | default | Paragraphs, table cells, form field text, button labels |
| `meta` | `text-meta` | `0.75rem` / `1rem` (12px) | `font-medium` (500) | `tracking-wide` (optional uppercase labels) | Captions, badges, table column headers, KPI labels |

### Tailwind config addition (proposed)

```ts
// tailwind.config.ts — theme.extend
fontSize: {
  "page-title": ["1.5rem", { lineHeight: "2rem", letterSpacing: "-0.02em" }],
  "kpi-value": ["1.5rem", { lineHeight: "2rem", letterSpacing: "-0.02em" }],
  "section-title": ["1.125rem", { lineHeight: "1.75rem", letterSpacing: "-0.02em" }],
  body: ["0.875rem", { lineHeight: "1.25rem" }],
  meta: ["0.75rem", { lineHeight: "1rem" }],
},
```

### Font weights (3 only)

| Token | Class | Use |
|-------|-------|-----|
| Semibold | `font-semibold` | Titles, KPI values, emphasis |
| Medium | `font-medium` | Labels, nav, table headers, buttons |
| Regular | `font-normal` | Body copy (default) |

**Retire in operational app:** `font-bold`, `font-extrabold`, `text-[9px]`–`text-[13px]`, responsive title scaling (`md:text-3xl` on page titles).

### Responsive rule

Page titles stay **fixed at `page-title` (24px)** on all breakpoints. Do not scale `h1` to 30px on desktop — reserve larger type for marketing only.

KPI values stay at `kpi-value` (24px). StatCard's current `text-3xl` is downgraded.

---

## Spacing Tokens

Semantic spacing aliases wrap Tailwind's scale for consistent page composition.

| Token | Tailwind | px | Use |
|-------|----------|-----|-----|
| `xs` | `gap-1` / `p-1` | 4 | Icon gaps, badge padding |
| `sm` | `gap-2` / `p-2` | 8 | Tight inline groups, compact table cells |
| `md` | `gap-3` / `p-3` | 12 | Filter bar gaps, mobile card padding |
| `lg` | `gap-4` / `p-4` | 16 | Standard card padding (mobile), section gaps |
| `xl` | `gap-6` / `p-6` | 24 | Desktop card padding, page section separation |

### Page layout spacing (composed from tokens)

| Layer | Mobile | Desktop (md+) |
|-------|--------|---------------|
| Page horizontal padding | `px-3` (12px) | `px-6` (24px) |
| Page top padding | `pt-6` | `pt-8` |
| Page section gap | `space-y-6` (24px) | `space-y-10` (40px) — keep as page-level exception |
| Max content width | `max-w-7xl` | unchanged |

### Card internal spacing

| Region | Padding |
|--------|---------|
| CardHeader | `p-4 md:p-6` |
| CardContent | `p-4 pt-0 md:p-6 md:pt-0` |
| MetricCard | `p-4 md:p-5` |

**Standardize on:** mobile `lg` (16px), desktop `xl` (24px) for card headers.

---

## Color Tokens

Use existing CSS variables. Operational rule: **no raw Tailwind color palette** (`green-600`, `amber-500`, etc.) in `src/pages/` except where chart libraries require hex.

| Semantic | Token | Replaces |
|----------|-------|----------|
| Positive / on-track | `text-success`, `bg-success/10` | `text-green-600`, `bg-green-100` |
| Warning / at-risk | `text-warning`, `bg-warning/10` | `text-amber-600`, `bg-amber-50` |
| Error / breached | `text-destructive`, `bg-destructive/10` | `text-red-600` |
| Info / paused | `text-info`, `bg-info/10` | `text-blue-600` |
| Primary actions | `bg-primary` or `bg-accent` | Per button spec below |
| Muted text | `text-muted-foreground` | Inline `hsl(...)` copies |

### Icon header box

**One gradient only** for all operational pages:

```
bg-gradient-to-br from-primary to-primary/80
h-11 w-11 rounded-xl
icon: h-5 w-5 text-primary-foreground
```

Retire per-page green/amber/blue/gray icon gradients.

---

## Component: PageHeader

**Path (proposed):** `src/components/common/PageHeader.tsx`

### API

```tsx
interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  className?: string;
}
```

### Layout

```
┌─────────────────────────────────────────────────────────┐
│ [icon?]  Title (page-title)              [actions slot] │
│          Description (body text-muted-foreground)       │
└─────────────────────────────────────────────────────────┘
```

### Classes

```tsx
// Container
"flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"

// Title block
"flex items-center gap-3 min-w-0"

// Icon box (when icon provided)
"flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80"

// Title
"text-page-title font-semibold tracking-tight text-foreground truncate"

// Description
"text-body text-muted-foreground mt-0.5"

// Actions
"flex flex-wrap items-center gap-2 shrink-0"
```

### Rules

- Every operational page uses `PageHeader` as the sole `h1` source.
- Detail pages (`TicketDetail`) pass ticket number as `title`; no `font-bold` override.
- `Dashboard` welcome hero collapses into `PageHeader` + optional `WelcomeStatsStrip` slot below actions.
- No responsive font scaling on title.

---

## Component: MetricCard

**Path (proposed):** `src/components/common/MetricCard.tsx`  
**Replaces:** `StatCard`, Dashboard/ClientDashboard local `MetricCard`, FieldExecutives inline divs, Analytics KPI `<p>` tags.

### API

```tsx
type MetricCardVariant = "default" | "primary" | "accent" | "success" | "warning" | "danger";

interface MetricCardProps {
  label: string;
  value: string | number;
  description?: string;
  icon?: LucideIcon;
  variant?: MetricCardVariant;
  trend?: { value: number; positive: boolean };
  className?: string;
}
```

### Layout

```
┌──────────────────────────────┐
│ LABEL (meta, uppercase opt.) │  [icon]
│ 42 (kpi-value)               │
│ description (meta, muted)    │
└──────────────────────────────┘
```

### Classes

```tsx
// Container
"rounded-xl border bg-card shadow-sm p-4 md:p-5 transition-shadow hover:shadow-md"

// Label
"text-meta font-medium text-muted-foreground uppercase tracking-wide"

// Value
"text-kpi-value font-semibold tracking-tight mt-1"

// Description
"text-meta text-muted-foreground mt-0.5"

// Variants
default:  "border-border"
primary:  "stat-card-primary border-0 text-white"  // reuse existing CSS
accent:   "stat-card-accent border-0 text-white"
success:  "bg-success/8 border-success/20"
warning:  "bg-warning/8 border-warning/20"
danger:   "bg-destructive/8 border-destructive/20"
```

### StatGrid companion

```tsx
// StatGrid — 2/4 column responsive wrapper
"grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4"
```

### Migration notes

- Deprecate `components/dashboard/StatCard.tsx` — merge into MetricCard or re-export.
- Dashboard welcome strip inline stats become 3× compact `MetricCard` or a slim `MetricChip` variant (`value` only, no card border).
- FieldExecutives 4-box row → `StatGrid` + 4× `MetricCard`.
- SLA Monitor 10+ boxes → `StatGrid` with `cols` prop; use semantic variants for on-track/at-risk/breached.

---

## Component: FilterBar

**Path (proposed):** `src/components/common/FilterBar.tsx`  
**Evolves from:** `TicketFiltersBar.tsx`

### API

```tsx
interface FilterBarProps {
  search?: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    "aria-label"?: string;
  };
  children?: React.ReactNode;  // Select slots, date inputs
  secondary?: React.ReactNode; // Date/sort strip (TicketsList)
  sticky?: boolean;
  className?: string;
}
```

### Layout

**Primary row:**
```
┌──────────────────────────────────────────────────────────┐
│ [🔍 Search flex-1 max-w-sm] [Select 160px] [Select ...]  │
└──────────────────────────────────────────────────────────┘
```

**Secondary row (optional):**
```
┌──────────────────────────────────────────────────────────┐
│ muted strip: date from | date to | sort                   │
└──────────────────────────────────────────────────────────┘
```

### Classes

```tsx
// Primary container
"flex flex-wrap items-center gap-3"

// Search wrapper
"relative flex-1 min-w-[200px] max-w-sm"
// Input: pl-9, Search icon absolute left-3

// Select triggers (standardized width)
"w-[160px]"  // default; allow w-[180px] via prop for long labels

// Secondary strip
"rounded-lg border border-border bg-muted/20 p-3 flex flex-wrap items-center gap-3"

// Sticky mode (AuditLogs)
"sticky top-0 z-20 rounded-lg border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 p-4"
```

### Special cases

| Page | FilterBar config |
|------|------------------|
| TicketsList | search + status + confidence; `secondary` = date/sort |
| FieldExecutives | search + 3 selects |
| Users | search + role + status |
| AuditLogs | `sticky` + quick-range as `children` |
| RawEmails | Status pills remain **above** FilterBar as `StatusFilterPills` domain component |
| SLAMonitor | FilterBar below KPI StatGrid |

---

## Component: DataTable

**Path (proposed):** `src/components/common/DataTable.tsx`  
**Wraps:** shadcn `Table` primitives

### API

```tsx
interface DataTableProps {
  children: React.ReactNode;
  dense?: boolean;
  className?: string;
  emptyState?: React.ReactNode;
  loading?: boolean;
}
```

### Shell classes

```tsx
// Outer shell (always)
"rounded-xl border border-border bg-card overflow-hidden shadow-sm"

// Inner scroll (Table primitive already has overflow-x-auto)
```

### Header convention

Override `TableHead` default via DataTable context or document standard override:

```tsx
// Standard operational headers
"text-meta font-medium uppercase tracking-wide text-muted-foreground h-11 px-4"

// Dense mode
"h-9 px-3 text-meta"

// Cell padding
default: "p-4"
dense:   "p-3"
```

### Rules

- **All** operational tables use `DataTable` shell — including ClientDashboard (migrate raw `<table>`).
- Domain tables (`TicketsTable`, `EmailsTable`, `ComplaintPointTable`) render inside `DataTable`; they do not add their own border wrapper.
- Row hover: keep shadcn `hover:bg-muted/50`.
- Empty state: centered `text-body text-muted-foreground py-12`.

---

## Component: Card (standard pattern)

**Keep:** `components/ui/card.tsx` with one adjustment.

### Standard operational card

```tsx
<Card>
  <CardHeader>
    <CardTitle>Section name</CardTitle>   {/* section-title, not 2xl */}
    <CardDescription>Optional subtitle</CardDescription>
  </CardHeader>
  <CardContent>...</CardContent>
</Card>
```

### CardTitle change (proposed)

```diff
- "text-2xl font-semibold ..."
+ "text-section-title font-semibold ..."
```

### Variants (allowed)

| Variant | When |
|---------|------|
| Default | Forms, settings, detail sections |
| `overflow-hidden` | Table host card |
| MetricCard | KPIs — use MetricCard, not Card |
| Interactive | `card-interactive` on clickable cards (FECard) |

### Retire

- Per-page `bg-gradient-to-br from-background to-muted/20` on stat cards → MetricCard variants
- `rounded-2xl` on operational cards → `rounded-xl` only (reserve `2xl` for marketing)

---

## Component: Button (unified system)

**Keep:** `components/ui/button.tsx` — extend variants.

### Variant matrix

| Variant | Visual | Use |
|---------|--------|-----|
| `default` | `bg-primary` solid purple | Standard primary actions |
| `accent` | Orange gradient (move from `.btn-primary`) | High-emphasis CTA (Create ticket, Send email) |
| `outline` | Border | Secondary actions |
| `secondary` | Muted fill | Tertiary |
| `ghost` | Hover only | Table row actions, icon-adjacent |
| `destructive` | Red | Delete, irreversible |
| `link` | Underlined | Inline navigation |

### Proposed `accent` variant

```tsx
accent: "btn-primary border-0 text-white shadow-md hover:shadow-glow"
// Or inline equivalent in cva — then remove className="btn-primary" from pages
```

### Size matrix

| Size | Height | Use |
|------|--------|-----|
| `sm` | `h-9` | **Page header actions** (default for toolbars) |
| `default` | `h-10` | Forms, modals |
| `lg` | `h-11` | Full-width mobile CTAs (FE flows) |
| `icon` | `h-10 w-10` | Icon-only |

### Rules

- Page header actions: `size="sm"`.
- One primary button per header row (`default` or `accent`, not both).
- Deprecate `.btn-purple`; migrate usages to `default`.
- Remove `text-sm md:text-base` size jump on buttons — use `text-body` consistently.

---

## Layout Primitives

### PageContainer (keep, minor doc update)

```tsx
"w-full min-w-0 space-y-6 px-3 pt-6 md:mx-auto md:max-w-7xl md:space-y-10 md:px-6 md:pt-8"
```

All staff pages should use `PageContainer` — including Dashboard (remove custom max-width sections).

### AppLayoutNew (keep)

No changes. Sidebar uses existing `nav-item` classes.

---

## Domain Components (unchanged API, styled via tokens)

These stay domain-specific but must consume shared primitives internally:

| Component | Change |
|-----------|--------|
| `TicketsTable` | Wrap in DataTable; use meta headers |
| `EmailsTable` | Same |
| `ComplaintPointTable` | Same |
| `FECard` | Card + card-interactive; section-title for name |
| `StatusBadge` | Keep `.status-badge` CSS — already meta-sized |
| `BulkAssignToolbar` | Use Button `accent` + DataTable selection patterns |

---

## Marketing / FE Isolation

| Surface | Token set |
|---------|-----------|
| Operational app (`AppLayoutNew`) | Full v1 system |
| Client portal | v1 system after Phase 4 — until then, parallel |
| FE mobile (`FEMyTickets`, `FETicketView`) | v1 spacing/typography on light cards; dark shell optional Phase 5 |
| Marketing | Separate `marketing-*` classes; never import into ops pages |

---

## ESLint / PR Enforcement (post-migration)

```text
// Proposed rules (eslint-plugin-tailwindcss or custom)
- Ban text-[Npx] in src/pages and src/components (except marketing/)
- Ban font-bold in operational pages
- Ban bg-green-* / text-amber-* etc. — use semantic tokens
- Require PageHeader for new pages in src/pages
```

---

## Migration Order

Ordered by **user impact × inconsistency severity × dependency order**. Each phase ends with visual QA on mobile + desktop.

### Phase 0 — Foundation (1–2 days)

**Goal:** Tokens and primitives exist; no page breaks.

| Task | Files |
|------|-------|
| Add typography + spacing tokens to `tailwind.config.ts` | `tailwind.config.ts` |
| Change `CardTitle` to `section-title` | `components/ui/card.tsx` |
| Add `accent` variant to Button | `components/ui/button.tsx` |
| Create `PageHeader`, `MetricCard`, `StatGrid`, `FilterBar`, `DataTable` | `components/common/*` |
| Re-export MetricCard from StatCard path (optional shim) | `dashboard/StatCard.tsx` |
| Add Storybook or `/design-preview` route (optional) | dev only |

**Exit criteria:** Primitives render correctly in isolation.

---

### Phase 1 — Highest impact staff pages (3–4 days)

**Goal:** Daily operator workflows standardized.

| Priority | Page | Work |
|----------|------|------|
| 1.1 | `Dashboard.tsx` | PageHeader, MetricCard/StatGrid, remove local MetricCard, Button accent, PageContainer |
| 1.2 | `TicketsList.tsx` | PageHeader, FilterBar (+ secondary strip), DataTable via TicketsTable |
| 1.3 | `TicketDetail.tsx` | PageHeader (bold→semibold), Card titles, semantic warning colors |
| 1.4 | `FieldExecutives.tsx` | PageHeader, StatGrid, FilterBar, FECard token pass |

**Impact:** ~70% of STAFF daily sessions.

---

### Phase 2 — Lists, monitoring, admin (3–4 days)

| Priority | Page | Work |
|----------|------|------|
| 2.1 | `Users.tsx` | PageHeader (green icon→primary), StatGrid, FilterBar, DataTable |
| 2.2 | `SLAMonitor.tsx` | PageHeader, StatGrid (consolidate 10 boxes), FilterBar, semantic colors |
| 2.3 | `Analytics.tsx` | PageHeader, MetricCard for KPI row, chart Cards unchanged |
| 2.4 | `AuditLogs.tsx` | PageHeader, sticky FilterBar, DataTable |
| 2.5 | `ReviewQueue.tsx` | PageHeader only (thin) |
| 2.6 | `RawEmails.tsx` | PageHeader (icon gradient), keep pills, FilterBar for search |

---

### Phase 3 — Tenant & super-admin (2–3 days)

| Priority | Page | Work |
|----------|------|------|
| 3.1 | `Organisations.tsx` | PageHeader, FilterBar |
| 3.2 | `TenantView.tsx` | PageHeader, StatGrid, DataTable |
| 3.3 | `SuperAdminDashboard.tsx`, `SuperAdminOrgView.tsx`, `PlatformOverview.tsx` | PageHeader, StatGrid |
| 3.4 | `TenantAdminDashboard.tsx` | PageHeader, StatGrid |
| 3.5 | `ServiceManagers.tsx` | PageHeader, StatGrid, gradient cards→MetricCard |
| 3.6 | `Clients.tsx`, `ClientDetail.tsx` | PageHeader, FilterBar, DataTable |
| 3.7 | `ComplaintPoints.tsx` | PageHeader, FilterBar |
| 3.8 | `Settings.tsx`, `TicketSettings.tsx` | PageHeader (gray icon→primary) |

---

### Phase 4 — Client portal (3–4 days)

| Priority | Page | Work |
|----------|------|------|
| 4.1 | `ClientDashboard.tsx` | **Largest diff** — MetricCard, DataTable, PageHeader, remove inline styles |
| 4.2 | `ClientTicketDetail.tsx` | Align with TicketDetail |
| 4.3 | `ClientSupport.tsx` | PageHeader |
| 4.4 | `ClientReports.tsx` | Inherits Analytics Phase 2 work |

---

### Phase 5 — FE mobile & auth (2 days)

| Priority | Page | Work |
|----------|------|------|
| 5.1 | `FEMyTickets.tsx` | meta/body tokens on cards; keep dark shell or align later |
| 5.2 | `FETicketView.tsx`, `FEActionPage.tsx` | Typography tokens |
| 5.3 | `ForgotPassword`, `ResetPassword`, `ChangePassword` | Brand background tokens vs gray gradient |

---

### Phase 6 — Cleanup & enforcement (1–2 days)

| Task | Detail |
|------|--------|
| Remove `.btn-primary` class usages | All via Button `accent` |
| Delete Dashboard local MetricCard | Done in Phase 1 |
| Deprecate `StatCard` | Re-export MetricCard |
| Remove arbitrary `text-[Npx]` | Grep cleanup |
| Update `docs/DESIGN_SYSTEM.md` | Point to v1 or merge |
| Add PR checklist | PageHeader + tokens required |

---

## Effort Estimate

| Phase | Duration | Cumulative |
|-------|----------|------------|
| 0 Foundation | 1–2 days | 2 days |
| 1 Core staff | 3–4 days | 6 days |
| 2 Lists/monitoring | 3–4 days | 10 days |
| 3 Admin | 2–3 days | 13 days |
| 4 Client portal | 3–4 days | 17 days |
| 5 FE/auth | 2 days | 19 days |
| 6 Cleanup | 1–2 days | **~3 weeks** |

**Fast path (staff-only):** Phases 0–2 ≈ **1.5 weeks**.

---

## Acceptance Checklist (per page)

- [ ] Uses `PageHeader` for `h1`
- [ ] No `font-bold` on titles or KPIs
- [ ] No `text-[Npx]` arbitrary sizes
- [ ] KPIs use `MetricCard` + `StatGrid`
- [ ] Filters use `FilterBar` (or documented exception)
- [ ] Tables use `DataTable` shell
- [ ] Cards use standard `Card` / `CardTitle` (section-title)
- [ ] Buttons use shadcn variants only (no `btn-primary` className)
- [ ] Colors use semantic tokens
- [ ] Page uses `PageContainer` (or documented full-bleed exception)

---

## File Map (new files)

```
src/components/common/
  PageHeader.tsx
  MetricCard.tsx
  StatGrid.tsx
  FilterBar.tsx
  DataTable.tsx
  index.ts
```

---

*This spec is ready for implementation. Start with Phase 0 — no page migrations until primitives are merged.*
