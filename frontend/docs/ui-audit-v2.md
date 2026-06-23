# Sahaya Frontend UI Audit v2

> **Scope:** `field-ops-assist/` operational platform  
> **Date:** June 2026  
> **Mode:** Read-only audit — no code changes  
> **Supersedes:** Informal findings from prior chat audit; complements `docs/DESIGN_SYSTEM.md` (Feb 2026 aspirational doc)

---

## Executive Summary

The Sahaya frontend has a **strong token foundation** (`src/index.css`, `tailwind.config.ts`, shadcn/ui primitives) but **inconsistent application** across pages. Most staff-facing pages converge on `text-2xl font-semibold` page titles and shadcn `Card`/`Table`, yet KPI cards, filter bars, table wrappers, colors, and spacing are reimplemented per page.

**Operational app pages audited:** 28 routes under `src/pages/` (excluding marketing, auth shells, and API routes).  
**Out of scope for standardization:** `SahayaLanding`, `EnquiryPage`, `public/PublicReportPage`, legacy `App.css`.

**Highest-impact gaps:**
1. Three parallel metric/KPI card implementations
2. Eight+ bespoke filter/search bar layouts
3. Two table systems (shadcn vs raw HTML in ClientDashboard)
4. Dual primary button systems (`Button` vs `.btn-primary` CSS)
5. Arbitrary typography (`text-[9px]`–`text-[13px]`) bypassing Tailwind scale
6. Per-page gradient icon header colors (green, amber, blue, gray, primary)

---

## Scope & Directory Map

| Path | Role |
|------|------|
| `src/pages/**` | Route-level screens |
| `src/components/**` | Shared and domain UI |
| `src/components/layout/` | App shell (no `src/layouts/`) |
| `src/components/ui/` | shadcn primitives |
| `tailwind.config.ts` | Theme extension |
| `src/index.css` | CSS variables + component classes |
| `docs/DESIGN_SYSTEM.md` | Prior design doc (aspirational, partially divergent from code) |

**No `src/features/` directory exists.**

---

## Operational Page Inventory

### Staff / tenant admin (`AppLayoutNew` + usually `PageContainer`)

| Page | Page header pattern | KPI cards | Filters | Table |
|------|---------------------|-----------|---------|-------|
| `Dashboard.tsx` | `text-2xl md:text-3xl font-semibold` + inline welcome stats | Local `MetricCard` + inline stats strip | None | `TicketsTable` compact |
| `TicketsList.tsx` | Plain `text-2xl font-semibold` | None | `TicketFiltersBar` + date/sort strip | `TicketsTable` |
| `TicketDetail.tsx` | `text-2xl font-bold` (ticket #) | None | None | N/A (cards) |
| `FieldExecutives.tsx` | Icon box (primary) + `text-2xl font-semibold` | 4× inline `rounded-xl border` divs | Inline search + 3 Selects | Card grid (`FECard`) |
| `Users.tsx` | Icon box (green gradient) + `text-2xl font-semibold` | 4× `Card` stat tiles | Search + role/status Selects | shadcn `Table` |
| `ServiceManagers.tsx` | Icon box (primary) + `text-2xl font-semibold` | 4× gradient `Card` stats | Search + filters | shadcn `Table` |
| `SLAMonitor.tsx` | Icon box (amber) + `text-2xl font-semibold` | 10+ inline stat boxes | Select row + date inputs | shadcn `Table` |
| `Analytics.tsx` | Icon box + responsive `text-2xl md:text-3xl` | 8× `text-2xl lg:text-3xl font-bold` | Date range in header | Chart `Card`s |
| `AuditLogs.tsx` | Icon box (slate) + `text-xl sm:text-2xl font-semibold` | None | Sticky complex filter panel | shadcn `Table` |
| `ReviewQueue.tsx` | Plain `text-2xl font-semibold` | None | None | `TicketsTable` |
| `RawEmails.tsx` | Icon box (blue-purple) + `text-2xl font-semibold` | Status pill counts | Pills + search row | `EmailsTable` |
| `ComplaintPoints.tsx` | Plain `text-2xl font-semibold` + icon inline | None | Search + org/status Selects | `ComplaintPointTable` |
| `Settings.tsx` | Icon box (gray) + `text-2xl font-semibold` | None | None | Form cards |
| `TicketSettings.tsx` | Icon box (primary) + `text-2xl font-semibold` | None | None | Form cards |
| `Organisations.tsx` | Icon box `h-12` (primary) + `text-2xl font-semibold` | Inline in list | Search | Card list |
| `TenantView.tsx` | Icon box `h-12` + org name title | Mixed `text-xl` / `text-2xl` stats | None | shadcn `Table` |
| `Clients.tsx` | Plain `text-2xl font-semibold` | None | Search | shadcn `Table` |
| `ClientDetail.tsx` | Plain `text-2xl font-semibold` | None | None | shadcn `Table` |
| `TenantAdminDashboard.tsx` | Icon box + `text-2xl font-semibold` | 4× `text-2xl font-bold` | None | Links/cards |
| `SuperAdminDashboard.tsx` | Icon box (amber) + `text-2xl font-semibold` | Inline stats | None | Card grid |
| `SuperAdminOrgView.tsx` | Plain `text-2xl font-semibold` | 6× `text-2xl font-bold` | None | shadcn `Table` |
| `PlatformOverview.tsx` | Icon box `h-12` + `text-2xl font-semibold` | Inline | None | shadcn `Table` |

### Client portal (`ClientLayout` / `ClientPortalShell`)

| Page | Custom styling level |
|------|---------------------|
| `ClientDashboard.tsx` | **High** — custom nav, inline styles, raw `<table>`, local `MetricCard` clone |
| `ClientTicketDetail.tsx` | Medium — mirrors TicketDetail with `font-bold` title |
| `ClientSupport.tsx` | Low — mostly standard tokens |
| `ClientReports.tsx` | Reuses `Analytics.tsx` in client mode |

### Field executive (mobile-first, dark theme)

| Page | Custom styling level |
|------|---------------------|
| `FEMyTickets.tsx` | **High** — dark purple shell, `text-base font-extrabold` brand, card list |
| `FETicketView.tsx` | Medium — `text-[9px]`/`text-[11px]` meta |
| `FEActionPage.tsx` | Medium — success green headings, amber alerts |

### Auth (standalone gray gradient shells)

`ForgotPassword`, `ResetPassword`, `ChangePassword` — use `bg-gradient-to-b from-gray-50` (not brand tokens).

### Marketing / public (excluded from operational standardization)

`SahayaLanding`, `EnquiryPage`, `Index`, `NotFound`, `public/PublicReportPage`

---

## 1. Typography Inconsistencies

### Sizes currently in use (operational app)

| Class / pattern | ~px | Frequency | Examples |
|-----------------|-----|-----------|----------|
| `text-[9px]` | 9 | Rare | `FETicketView` branding |
| `text-[10px]` | 10 | High | Dashboard/ClientDashboard metric labels, Sidebar |
| `text-[11px]` | 11 | High | Welcome stats labels, ClientDashboard table headers |
| `text-[13px]` | 13 | Medium | ClientDashboard nav |
| `text-xs` | 12 | **Very high** | Badges, meta, StatCard descriptions |
| `text-sm` | 14 | **Default body** | Tables, forms, subtitles |
| `text-base` | 16 | Medium | Button md breakpoint, FEMyTickets brand |
| `text-lg` | 18 | Medium | Section titles, CardTitle overrides |
| `text-xl` | 20 | Medium | Welcome stat values, SectionWrapper mobile |
| `text-2xl` | 24 | **Page titles + KPIs** | Most `h1`, FieldExecutives stats |
| `text-3xl` | 30 | Medium | Dashboard/Analytics responsive titles, StatCard values |
| `text-4xl` | 36 | Rare | `NotFound` only |

### Font weights

| Weight | Usage |
|--------|-------|
| `font-normal` (400) | Implicit body; rare explicit |
| `font-medium` (500) | Labels, nav, table headers, Button default |
| `font-semibold` (600) | **Page titles (dominant)**, CardTitle, global `h1–h6` base |
| `font-bold` (700) | KPI values, TicketDetail titles, SectionWrapper |
| `font-extrabold` (800) | FEMyTickets brand only |

**Problem:** Page titles use semibold; detail pages use bold. KPI values always bold; page titles sometimes scale to 3xl on md+.

### CardTitle default mismatch

`components/ui/card.tsx` sets `CardTitle` to `text-2xl font-semibold`, but many pages override to `text-lg`. Creates visual competition with page `h1`.

---

## 2. Card Inconsistencies

### Reusable patterns found

| ID | Pattern | Location |
|----|---------|----------|
| C1 | shadcn `Card` + `CardHeader`/`CardContent` | Default across app |
| C2 | `StatCard` component (`text-3xl font-bold`, 6 variants) | `components/dashboard/StatCard.tsx` — **imported nowhere in pages** |
| C3 | Dashboard local `MetricCard` (gradient primary/accent/default) | `Dashboard.tsx` lines 25–74 |
| C4 | ClientDashboard local `MetricCard` clone | `ClientDashboard.tsx` — nearly identical to C3 |
| C5 | Inline stat divs `p-4 md:p-6 rounded-xl border bg-card shadow-sm` | `FieldExecutives.tsx` |
| C6 | `Card` with `bg-gradient-to-br from-background to-muted/20` | `ServiceManagers.tsx` stats |
| C7 | `SectionWrapper` elevated shell `rounded-xl md:rounded-2xl shadow-card` | Landing sections, reusable layout |
| C8 | CSS classes `.stat-card-primary`, `.stat-card-accent` | `index.css` — used by StatCard only |
| C9 | `.info-box-warning/success/danger` | Alert callouts |
| C10 | `.card-interactive` hover lift | FECard, StatCard |
| C11 | Table wrapper `rounded-xl border bg-card overflow-hidden` | Tickets, Users, SLA, etc. |
| C12 | Muted nested table `rounded-lg border bg-muted/20` | `Users.tsx` org sections |
| C13 | Analytics chart cards `min-h-[340px] overflow-hidden` + `cardSkin` | `Analytics.tsx` |

### Padding variance on cards

- shadcn default: `p-4 md:p-6`
- StatCard content: `p-5`
- SectionWrapper elevated: `p-3 md:p-5`
- FieldExecutives stat divs: `p-4 md:p-6`
- ServiceManagers stat cards: shadcn + gradient bg

### Border radius variance

- Standard card: `rounded-xl`
- SectionWrapper md+: `rounded-2xl`
- AuditLogs table shell: `rounded-lg`
- ClientDashboard table: `rounded-2xl`

---

## 3. Table Inconsistencies

### Variant T1 — shadcn Table (standard)

**Primitive:** `components/ui/table.tsx`
- Table: `text-sm`, `min-w-[640px]`
- Head: `h-12 px-4 font-medium text-muted-foreground` (sentence case)
- Cell: `p-4`
- Row hover: `hover:bg-muted/50`

**Used by:** `TicketsTable`, `Users`, `SLAMonitor`, `AuditLogs`, `TenantView`, `SuperAdminOrgView`, `PlatformOverview`, `SuperAdminDashboard`, `ServiceManagers`, `Clients`, `ClientDetail`, `ComplaintPointTable`, `EmailsTable`, modals

### Variant T2 — ClientDashboard raw table

- Custom `<table>` inside styled div
- Headers: `text-[11px] font-bold uppercase tracking-[0.08em]`
- Gradient header row via inline `style`
- Row hover via inline styles
- **Not using shadcn Table at all**

### Variant T3 — Compact mode

`TicketsTable` `compact` prop — reduced padding for dashboard embed

### Wrapper inconsistency

| Wrapper | Pages |
|---------|-------|
| `rounded-xl border bg-card overflow-hidden` | SLA, Users, TenantView |
| `rounded-lg border bg-card shadow-sm` | AuditLogs |
| `rounded-lg border bg-muted/20 overflow-hidden` | Users nested org tables |
| `Card` with `overflow-hidden` | ServiceManagers |
| No wrapper (Table scrolls inline) | Some list pages |

### Domain-specific table components (good candidates for DataTable wrapper)

- `components/tickets/TicketsTable.tsx`
- `components/emails/EmailsTable.tsx`
- `components/complaint-points/ComplaintPointTable.tsx`

---

## 4. Filter / Search Bar Inconsistencies

### Variant F1 — TicketFiltersBar (closest to standard)

`components/tickets/TicketFiltersBar.tsx`
- `flex flex-wrap gap-3`
- Search: `flex-1 min-w-[200px] max-w-sm`, `pl-9` + Search icon
- Selects: `w-[180px]`, `w-[160px]`

**Used only by:** `TicketsList.tsx`

### Variant F2 — TicketsList date/sort strip

- Separate panel: `rounded-lg border bg-muted/20 p-3`
- Date inputs + sort Select — not part of TicketFiltersBar

### Variant F3 — FieldExecutives inline toolbar

- Search + 3 Selects in page header area (no shared component)

### Variant F4 — Users / ServiceManagers

- Search Input + role/status Selects in card header or toolbar

### Variant F5 — AuditLogs sticky filter panel

- `sticky top-0 z-20 rounded-lg border bg-background/95 backdrop-blur`
- Quick-range buttons, multiple Selects, ticket # search
- Most complex filter UI in the app

### Variant F6 — SLAMonitor

- KPI row above filters
- Select row (`w-[180px]`) + date inputs inline

### Variant F7 — RawEmails status pills

- Clickable pill buttons for status counts (unique pattern)
- Separate search row below

### Variant F8 — ComplaintPoints

- Org Select + status Select + search (mirrors F3 layout)

### Variant F9 — Analytics / ClientReports

- Date range controls embedded in page header actions

### Variant F10 — Organisations / Clients

- Search only in header card

---

## 5. Button Inconsistencies

### shadcn Button (`components/ui/button.tsx`)

| Variant | Style |
|---------|-------|
| `default` | `bg-primary` solid purple |
| `destructive` | Red |
| `outline` | Border |
| `secondary` | Secondary fill |
| `ghost` | Hover only |
| `link` | Underlined primary |

| Size | Spec |
|------|------|
| `default` | `h-10`, `text-sm md:text-base`, `min-h-[44px]` mobile |
| `sm` | `h-9` — **dominant in page toolbars** |
| `lg` | `h-11` |
| `icon` | `h-10 w-10` |

### CSS utility buttons (`index.css`)

| Class | Style | Usage |
|-------|-------|-------|
| `.btn-primary` | Orange gradient + glow hover | `Dashboard.tsx`, `EmailDetailSheet.tsx` |
| `.btn-purple` | Purple gradient | Defined but rarely used |
| `.nav-item` | Sidebar nav | `Sidebar.tsx` |

### Other button patterns

- SahayaLanding `PrimaryButton` — custom inline-styled `<button>` with hover JS
- ClientDashboard CTA — inline gradient `style={{ background: ... }}`
- FEMyTickets — standard Button on dark bg

**Problem:** Primary CTA color is purple (`Button default`) in most pages but orange gradient (`.btn-primary`) on Dashboard and email actions. Outline/ghost used inconsistently for secondary actions.

---

## 6. Spacing Inconsistencies

### Page-level (PageContainer)

```
px-3 pt-6 space-y-6          (mobile)
md:max-w-7xl md:px-6 md:pt-8 md:space-y-10   (desktop)
```

**Adoption:** Most staff pages use `PageContainer`. `Dashboard` and `ClientDashboard` use custom section layout with their own `px-3 md:px-6 md:max-w-7xl`.

### Vertical rhythm

| Pattern | Where |
|---------|-------|
| `space-y-6` | Default page stacks |
| `space-y-10` | PageContainer desktop |
| `space-y-4` | Subsections, form groups |
| `gap-3` | Filter bars |
| `gap-4` | Header rows |
| `gap-6` | Card grids |
| `py-8` | SectionWrapper sections |
| `py-6 md:py-8` | Dashboard welcome section |

### Card / component padding

| Value | Usage |
|-------|-------|
| `p-3` | Mobile cards, filter strips |
| `p-4` | Standard card mobile, stat tiles |
| `p-5` | StatCard, SectionWrapper md |
| `p-6` | Card desktop, modals |

### Gaps without semantic tokens

No `spacing-xs/sm/md/lg/xl` aliases — raw Tailwind numbers chosen per page.

---

## 7. Color Inconsistencies

### Semantic tokens (correct usage)

Defined in `index.css` / `tailwind.config.ts`:
- `primary`, `accent`, `muted`, `destructive`, `success`, `warning`, `info`
- `status-*` ticket lifecycle colors
- `confidence-*` score colors
- Sidebar-specific tokens

### Hardcoded Tailwind palette (bypasses tokens)

| Color | Usage |
|-------|-------|
| `text-green-600`, `bg-green-100 text-green-800` | FieldExecutives available count, SLA on-track, TicketDetail badges, FEActionPage |
| `text-amber-600`, `text-amber-800`, `bg-amber-50` | SLA at-risk, FieldExecutives workload, warnings |
| `text-red-600` | SLA breached |
| `text-blue-600` | SLA paused, AuditLogs status |
| `from-green-500 to-emerald-600` | Users page icon header |
| `from-amber-500 to-orange-600` | SLA Monitor, SuperAdminDashboard icons |
| `from-blue-500 to-purple-600` | RawEmails icon |
| `from-gray-600 to-gray-800` | Settings icon |

### Inline HSL styles (duplicate token values)

Dashboard and ClientDashboard use `style={{ color: "hsl(145 65% 35%)" }}` instead of `text-success` or `hsl(var(--success))`.

### Auth pages

`from-gray-50 to-gray-100/80` — neutral gray, not brand background token.

### FE dark theme

`FEMyTickets` uses inline `hsl(285 45% 12%)` backgrounds — separate visual language from staff app.

---

## 8. Page Header Inconsistencies

### Pattern inventory

| ID | Structure | Pages |
|----|-----------|-------|
| H1 | Title only: `text-2xl font-semibold` + optional `text-sm text-muted-foreground` subtitle | TicketsList, ReviewQueue, Organisations, Settings, etc. |
| H2 | Icon box `h-11 w-11 rounded-xl` + gradient + title | FieldExecutives, Users, AuditLogs, SLA, RawEmails, TicketSettings, TenantAdmin, ServiceManagers |
| H3 | Responsive title: `text-2xl md:text-3xl font-semibold tracking-tight` | Dashboard, ClientDashboard, Analytics (client mode) |
| H4 | Bold detail title: `text-2xl font-bold` | TicketDetail, ClientTicketDetail |
| H5 | Smaller responsive: `text-xl sm:text-2xl font-semibold` | AuditLogs |
| H6 | Icon box size variance: `h-11` vs `h-12` | TenantView, Organisations, PlatformOverview use `h-12` |
| H7 | Icon gradient color per page | See Color section — 6+ distinct gradients |
| H8 | Welcome hero section with background grid | Dashboard, ClientDashboard (full-width, not PageContainer) |

### Subtitle consistency

Most pages: `text-sm text-muted-foreground`  
Some omit subtitle entirely; Dashboard adds `mt-1` explicitly.

### Actions placement

- Right-aligned `Button size="sm"` cluster — dominant pattern
- Dashboard CTA uses `btn-primary` instead of default Button

---

## Reusable UI Patterns Currently Present

| Pattern | Component / location | Maturity |
|---------|---------------------|----------|
| App shell | `AppLayoutNew`, `Sidebar`/`SidebarNew` | Stable |
| Page width / spacing | `PageContainer` | Stable, not universal |
| Section blocks | `SectionWrapper` | Used on landing; rare in ops app |
| Cards | shadcn `Card` | Stable primitive |
| Tables | shadcn `Table` + domain tables | Stable but wrapper varies |
| Filters | `TicketFiltersBar` | Single consumer |
| Status display | `StatusBadge`, `.status-badge` CSS | Stable |
| Confidence | `ConfidenceScore` | Stable |
| Ticket # display | `TicketNumberDisplay` | Stable |
| FE cards | `FECard` | Domain-specific |
| Bulk actions | `BulkAssignToolbar` | Domain-specific |
| Stats | `StatCard` | **Exists but unused in pages** |
| Auth | `LoginForm`, `AuthGuards` | Separate visual language |
| Client shell | `ClientLayout`, `ClientPortalShell` | Parallel to staff shell |

---

## Duplicate Implementations

| Concern | Implementations | Files |
|---------|-----------------|-------|
| Metric / KPI card | StatCard, Dashboard MetricCard, ClientDashboard MetricCard, inline stat divs, Analytics `<p>` grid, welcome stats strip | See Card section |
| Page header | 8 header patterns, 6 icon gradient colors | All `src/pages/*` with `h1` |
| Filter bar | TicketFiltersBar + 9 bespoke layouts | Per-page |
| Table shell | 4 wrapper styles + raw HTML table | See Table section |
| Primary CTA | `Button default` vs `.btn-primary` | button.tsx vs index.css |
| Gradient divider | Duplicated inline in Dashboard + ClientDashboard | Same 1-line component copy-pasted |
| Welcome stats strip | Duplicated in Dashboard + ClientDashboard | Nearly identical markup |
| CardTitle size | Default `text-2xl` vs page overrides `text-lg` | card.tsx vs detail pages |

---

## Pages Using Custom Styles (priority for migration)

### Tier 1 — Heavy custom (rewrite against design system)

1. **`ClientDashboard.tsx`** — custom nav, MetricCard clone, raw table, extensive inline styles
2. **`Dashboard.tsx`** — local MetricCard, welcome hero, `.btn-primary`, dashboard-* CSS shadows
3. **`FEMyTickets.tsx`** — dark theme shell, extrabold branding, separate spacing
4. **`SahayaLanding.tsx`** — marketing (isolate, do not merge into ops tokens)

### Tier 2 — Moderate custom

5. **`Analytics.tsx`** — responsive KPI typography, chart card skin
6. **`AuditLogs.tsx`** — sticky filter panel, custom status colors
7. **`SLAMonitor.tsx`** — many stat boxes, semantic Tailwind colors
8. **`RawEmails.tsx`** — status pill filters
9. **`TicketDetail.tsx`** / **`ClientTicketDetail.tsx`** — bold titles, amber warning cards

### Tier 3 — Mostly standard (header/icon tweaks only)

10. Users, FieldExecutives, ServiceManagers, Organisations, TenantView, PlatformOverview, Settings, TicketSettings, SuperAdmin*, TenantAdminDashboard, ComplaintPoints, Clients, ClientDetail, ClientSupport, ReviewQueue, TicketsList

### Tier 4 — Auth / edge

ForgotPassword, ResetPassword, ChangePassword (gray gradients), NotFound, FETicketView, FEActionPage

---

## Components That Should Become Shared Primitives

| Proposed primitive | Replaces | Priority |
|-------------------|----------|----------|
| `PageHeader` | 8 inline header patterns | P0 |
| `MetricCard` | StatCard + 2 local MetricCards + inline stat divs | P0 |
| `FilterBar` | TicketFiltersBar + 9 bespoke filter rows | P0 |
| `DataTable` / `DataTableShell` | 4 table wrappers + ClientDashboard raw table | P0 |
| `StatGrid` | Repeated 4-column KPI rows | P1 |
| `GradientDivider` | Copy-pasted divider | P2 |
| `WelcomeStatsStrip` | Dashboard + ClientDashboard header stats | P1 |
| `EmptyState` | Per-page empty messages | P2 |
| `PageSection` | Ad-hoc `h2` + card combos | P2 |

### Extend existing primitives (not new files)

| Primitive | Change |
|-----------|--------|
| `Card` / `CardTitle` | Default section title to `text-lg`; keep page titles on `PageHeader` |
| `Button` | Add `accent` variant matching `.btn-primary`; deprecate CSS class |
| `Table` / `TableHead` | Add optional `dense` and `uppercase` header modes for DataTable |

---

## Relationship to `docs/DESIGN_SYSTEM.md`

The February 2026 design doc describes the **intended** system. This audit documents **actual** usage. Key divergences:

- Design doc specifies typography scale; code uses arbitrary `text-[Npx]` widely
- Design doc assumes consistent cards; code has 3 KPI implementations
- `.btn-primary` orange gradient is canonical in design doc but not wired into Button variants
- `StatCard` exists per design doc but pages don't use it

**Recommendation:** Treat `design-system-v1.md` as the operational implementation spec; keep `DESIGN_SYSTEM.md` for brand/marketing reference or merge later.

---

## Metrics Summary

| Category | Distinct variants found |
|----------|------------------------|
| Text sizes (ops app) | 12+ (including arbitrary px) |
| Font weights | 4 active (medium, semibold, bold, extrabold) |
| Page header patterns | 8 |
| Card / KPI patterns | 13 |
| Table patterns | 3 (+ wrapper variants) |
| Filter bar patterns | 10 |
| Button systems | 2 (shadcn + CSS utilities) |
| Icon header gradient colors | 6+ |
| Page vertical spacing values | 4+ (`space-y-4/6/10`, `py-6/8`) |

---

*End of audit. Implementation spec: `docs/design-system-v1.md`*
