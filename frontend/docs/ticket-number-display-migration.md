# TicketNumberDisplay Migration — Complete

> **Date:** 2026-06-11  
> **Component:** `src/components/common/TicketNumberDisplay.tsx`  
> **Related:** [domain-component-audit.md](./domain-component-audit.md), [emails-table-phase-b.md](./emails-table-phase-b.md)

Replaced arbitrary typography (`text-[10px]`, caller-passed `text-sm` / `text-xs` / `text-2xl`) with design-system `variant` props mapped to `typography` tokens.

---

## Variant API

| Variant | Number token | Prefix token | Typical use |
|---------|--------------|--------------|-------------|
| `default` | `typography.body` + `font-mono` | `typography.meta` + badge chrome | Tables, dialogs, modals, detail fields |
| `compact` | `typography.meta` + `font-mono` | `typography.meta` + badge chrome | Dense lists, badges, bulk-assign summaries |
| `prominent` | `typography.pageTitle` + `font-mono` | `typography.meta` + badge chrome | Page titles (`TicketDetail`, `ClientTicketDetail`) |

### Escape hatches (deprecated)

| Prop | Status |
|------|--------|
| `numberClassName` | Deprecated — no consumer usages remain |
| `prefixClassName` | Deprecated — no consumer usages remain |
| `className` | Retained for layout wrappers (`truncate`, flex context) |

### Unchanged behaviour

| Concern | Status |
|---------|--------|
| Ticket number formatting (`ticket_number` as stored) | Unchanged |
| Tenant prefix badge (`useTenantTerminology`) | Unchanged |
| Complaint ID display | **Not in this component** — remains on parent pages (`InfoRow`, parsed email badges, etc.) |
| Copy functionality | **Not in this component** — no copy UI existed; unchanged |
| Links / navigation | Unchanged — parent `<Link>` wrappers retained; `text-primary` inherited from link |

---

## Files Updated

| File | Variant | Notes |
|------|---------|-------|
| `src/components/common/TicketNumberDisplay.tsx` | — | Core refactor + variant map |
| `src/components/common/index.ts` | — | Export `TicketNumberDisplayVariant` |
| `src/components/tickets/TicketsTable.tsx` | `default` ×3 | Removed `numberClassName={typography.body}` and `text-primary` override |
| `src/pages/SLAMonitor.tsx` | `default` | Link inherits `text-primary` |
| `src/pages/AuditLogs.tsx` | `compact` | Inside `text-xs` badge |
| `src/pages/ClientDashboard.tsx` | `compact` ×2 | Table cell + drawer header |
| `src/pages/TicketDetail.tsx` | `prominent` | `h1` no longer duplicates `text-2xl font-bold` |
| `src/pages/ClientTicketDetail.tsx` | `prominent` + `default` | Page title + detail card field |
| `src/pages/SuperAdminOrgView.tsx` | `default` | Org ticket table |
| `src/components/tickets/CloseTicketDialog.tsx` | `default` | Confirm copy |
| `src/components/tickets/AssignmentConfirmDialog.tsx` | `default` | Modal summary |
| `src/components/tickets/BulkGroupAssignModal.tsx` | `compact` ×2 | Ticket list + error list |
| `src/components/tickets/FEAssignmentModal.tsx` | `default` | Dialog description |

**Total consumers updated:** 12 files (11 call sites + component)

---

## Typography Classes Removed

### From component

| Removed | Replaced with |
|---------|---------------|
| `text-[10px] font-semibold uppercase tracking-wide text-muted-foreground` (prefix) | `typography.meta` + `font-semibold` + `uppercase tracking-wide` |
| Bare `font-mono` + caller sizing | Variant-mapped `typography.body` / `meta` / `pageTitle` |

### From consumers (all `numberClassName` usages eliminated)

| Removed at call site | Replaced with |
|----------------------|---------------|
| `numberClassName={typography.body}` | `variant="default"` |
| `numberClassName={cn(typography.body, 'text-primary')}` | `variant="default"` inside `<Link className="text-primary">` |
| `numberClassName="text-sm"` | `variant="default"` |
| `numberClassName="text-sm text-primary"` | `variant="default"` inside link |
| `numberClassName="text-xs"` | `variant="compact"` |
| `numberClassName="text-2xl"` | `variant="prominent"` |
| `h1 className="text-2xl font-bold"` wrapping prominent | `h1 className="truncate"` — size from variant |

---

## Remaining Custom Overrides

| Location | Override | Reason kept |
|----------|----------|-------------|
| `TicketNumberDisplay.tsx` | `prefixBadgeBase` (`rounded border bg-muted/50 px-1.5 py-0.5`) | Domain prefix badge chrome — not a typography token |
| `TicketNumberDisplay.tsx` | `font-semibold` on number when prefix shown | Visual hierarchy between prefix label and number |
| `TicketNumberDisplay.tsx` | `numberClassName` / `prefixClassName` props | Deprecated escape hatch — zero current usages |
| `TicketsTable.tsx` | Parent `<span className={typography.meta}>` on locked rows | Row-level affordance, not ticket # sizing |
| `TicketsTable.tsx` | Parent `<Link className="text-primary hover:underline">` | Navigation styling — inherited by child |
| `SLAMonitor.tsx` | Parent `<Link className="text-primary hover:underline">` | Same as above |
| `AuditLogs.tsx` | Parent `<Badge variant="secondary" className="text-xs font-normal">` | Badge container sizing |
| `ClientDashboard.tsx` | Parent `td` with `text-xs font-medium` | Table cell context — ticket # uses `compact` variant inside |

No consumer passes `numberClassName` or `prefixClassName` after migration.

---

## Readiness for Dashboard Migration

### **Ready**

| Prerequisite | Status |
|--------------|--------|
| `TicketNumberDisplay` tokenized | ✅ |
| `TicketsTable` compact rows use `variant="default"` | ✅ (via TicketsTable update) |
| Arbitrary `text-[10px]` prefix removed | ✅ |
| Typography tokens centralized | ✅ |

### Dashboard-specific follow-ups (separate wave)

`Dashboard.tsx` does **not** import `TicketNumberDisplay` directly. It embeds `TicketsTable compact`, which now uses `variant="default"` internally. Remaining Dashboard migration items are unrelated to this component:

| Item | File | Blocker? |
|------|------|----------|
| Compact embed loading/empty ownership | `Dashboard.tsx` | No — TicketsTable concern |
| Custom inline `MetricCard` → shared `MetricCard` | `Dashboard.tsx` | No |
| Custom `dashboard-tickets-card` chrome → `DataTableShell` (optional) | `Dashboard.tsx` | No |
| Local `text-[10px]` on metric labels | `Dashboard.tsx` | Separate typography cleanup |

**Verdict:** TicketNumberDisplay standardization is complete. Dashboard page migration can proceed without further changes to this component.

---

## API Reference

```tsx
import {
  TicketNumberDisplay,
  type TicketNumberDisplayVariant,
} from '@/components/common';

// Table / dialog (default)
<TicketNumberDisplay
  ticketNumber={ticket.ticket_number}
  organisationId={ticket.organisation_id}
  variant="default"
/>

// Dense list
<TicketNumberDisplay ticketNumber={n} variant="compact" />

// Page title
<h1 className="truncate">
  <TicketNumberDisplay ticketNumber={n} variant="prominent" />
</h1>

// Linked row (color from parent)
<Link to={`/app/tickets/${id}`} className="text-primary hover:underline">
  <TicketNumberDisplay ticketNumber={n} variant="default" />
</Link>
```

---

*Build verified: `npm run build` passes.*
