# UI/UX Audit Report — Field Ops Assist (Sahaya)

**Scope:** `field-ops-assist` frontend (React + Vite + shadcn/Radix + Tailwind)  
**Audit date:** Pre-improvement analysis. No UI changes were implemented.  
**Purpose:** Identify what is implemented correctly, what needs improvement, and what may break responsiveness or usability.

---

## 1. Frontend Architecture Overview

### What is implemented correctly

| Area | Details |
|------|--------|
| **Framework** | React 18 + TypeScript; Vite for build and dev. |
| **Routing** | React Router v6 with clear structure: public (`/`, `/login`), FE (`/fe/*`), Super Admin (`/super-admin/*`, `/app/platform`, `/app/organisations`, `/app/tenant/:orgId`), Client (`/app/client/*`), Staff (`/app/*`). Nested routes with `RequireStaff`, `RequireFE`, `RequireSuperAdmin`, `RequireClient`. |
| **Layout system** | Two layout patterns: (1) `AppLayoutNew` + optional `PageContainer` used by most app pages; (2) `DashboardLayout` (Sidebar + main) exists but is **not used** by any current route—all pages use `AppLayoutNew`. `MobileSidebarWrapper` provides mobile header + overlay drawer; desktop shows `Sidebar` in flow. |
| **Component hierarchy** | Pages → AppLayoutNew → MobileSidebarWrapper (Sidebar) + main; page content often wrapped in `PageContainer` (max-w-7xl, spacing). Some pages (e.g. Dashboard) use custom width/padding instead of `PageContainer`. |
| **State management** | TanStack Query for server state; React local state and `useAuth` for auth/profile. No global client store. |
| **Styling** | Tailwind CSS + CSS variables in `index.css` (design tokens for colors, radius, shadows, sidebar, status, confidence). shadcn-style components use CVA + `cn()`. |
| **Design system** | **Present:** `index.css` defines `:root` and `.dark` tokens (background, primary, accent, status-*, confidence-*, sidebar-*, shadows, gradients). Reusable utility classes: `status-badge`, `btn-primary`, `btn-purple`, `nav-item`, `card-interactive`, `stat-card-primary/accent`, `info-box-*`, `timeline-item`, `scrollbar-thin`, animation utilities. |

### What needs improvement

| Issue | Details |
|-------|--------|
| **Unused layout** | `DashboardLayout` imports `Sidebar` and wraps children in a different main structure than `AppLayoutNew`. It is never used; all pages use `AppLayoutNew`. This can cause confusion and dead code. **Files:** `src/components/layout/DashboardLayout.tsx`. |
| **Duplicate sidebar concept** | `SidebarNew` is a thin wrapper that only renders `Sidebar`; it is not used in the app. **Files:** `src/components/layout/SidebarNew.tsx`. |
| **Inconsistent page wrapper** | Most pages use `PageContainer` inside `AppLayoutNew`; **Dashboard** does not—it uses its own `md:max-w-7xl px-3 md:px-6` and section structure. Result: inconsistent horizontal padding and max-width application. **Files:** `src/pages/Dashboard.tsx` vs e.g. `TicketsList.tsx`, `FieldExecutives.tsx`. |
| **Design tokens in two places** | Token-like values appear both in CSS variables (`index.css`) and inline (e.g. `style={{ background: "linear-gradient(...)" }}` in Dashboard, SahayaLanding, MetricCard). Inline styles bypass the design system and can drift. |

### Summary

- **Frontend framework:** React 18 + Vite + TypeScript.  
- **Routing system:** React Router v6 with role-based route guards.  
- **Layout components:** `AppLayoutNew`, `MobileSidebarWrapper`, `Sidebar`, `PageContainer`, `HeroSection`, `SectionWrapper`; `DashboardLayout` and `SidebarNew` exist but are unused.  
- **Shared UI components:** Full shadcn set under `components/ui/` (button, input, dialog, select, table, badge, tabs, etc.); domain components (e.g. `StatusBadge`, `TicketsTable`, `TicketFiltersBar`, `StatCard`).  
- **State management:** TanStack Query + React state + `useAuth`.  
- **Styling approach:** Tailwind + CSS variables + CVA in components; some inline styles.  
- **Design system:** Exists (tokens, status badges, buttons, cards, nav) but is partially bypassed by inline styles and unused layout components.

---

## 2. UI Components Consistency Analysis

### Buttons

| Finding | Details |
|--------|----------|
| **Implemented well** | `Button` from `components/ui/button.tsx` uses CVA with variants (default, destructive, outline, secondary, ghost, link) and sizes (default, sm, lg, icon). Focus ring and disabled state are consistent. Used widely (TicketsList, TicketDetail, CreateTicketModal, etc.). |
| **Inconsistency** | Some CTAs use custom classes `btn-primary` or `btn-purple` (e.g. Dashboard “View all tickets”, EmailDetailSheet). These are defined in `index.css` and look different from `<Button variant="default">` (which uses `bg-primary`). So primary actions are styled in two ways: design-token primary (purple) vs orange gradient. **Files:** `Dashboard.tsx` (line ~194), `EmailDetailSheet.tsx` (line ~267), `index.css` (`.btn-primary`, `.btn-purple`). |

### Inputs & forms

| Finding | Details |
|--------|----------|
| **Implemented well** | `Input`, `Label`, `Textarea`, `Select`, `Checkbox` from ui are used in CreateTicketModal, LoginForm, TicketFiltersBar. Shared height/radius/focus ring. |
| **Inconsistency** | Input height is `h-10` in component; Button has `min-h-[44px] md:min-h-[2.5rem]` (touch-friendly). No consistent “form group” spacing; some forms use `space-y-4`, others ad hoc gaps. |

### Dropdowns / select

| Finding | Details |
|--------|----------|
| **Implemented well** | Radix Select used consistently (TicketFiltersBar, CreateTicketModal, etc.) with `SelectTrigger`, `SelectContent`, `SelectItem`. |
| **Inconsistency** | Trigger widths are set ad hoc (`w-[180px]`, `w-[160px]`, `w-[200px]`) in TicketFiltersBar; no shared width scale. |

### Tables

| Finding | Details |
|--------|----------|
| **Implemented well** | `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` from ui; used in TicketsTable, EmailsTable, and other list views. Row hover and borders are consistent. |
| **Inconsistency** | Tables are wrapped in `overflow-x-auto` at page level in some places (Users, SLAMonitor, TenantView, SuperAdminDashboard) and in component in TicketsTable (`rounded-xl border bg-card overflow-hidden` + `overflow-x-auto`). No shared “data table” wrapper. No table pagination component used in codebase (pagination.tsx exists in ui but not wired). |

### Cards

| Finding | Details |
|--------|----------|
| **Implemented well** | `Card`, `CardHeader`, `CardContent`, `CardFooter` from ui; `StatCard` with variants (default, warning, success, danger, primary, accent). Dashboard uses custom `MetricCard` with inline gradient styles. |
| **Inconsistency** | Two “metric card” patterns: `StatCard` (design tokens) vs `MetricCard` in Dashboard (inline gradients). Card padding and border radius vary (e.g. `rounded-xl` in TicketsTable card vs default card radius). |

### Modals / dialogs

| Finding | Details |
|--------|----------|
| **Implemented well** | Radix Dialog used via `components/ui/dialog.tsx`; `DialogContent` has `max-w-lg`, `max-h-[90vh]`, overflow-y-auto. CreateTicketModal, CreateFEModal, EditFEModal, etc. use it. |
| **Inconsistency** | Some dialogs override width: `DialogContent className="sm:max-w-md"` (TenantAdminDashboard, Users, Organisations, TenantView, etc.). So modal widths are not uniform (max-w-lg vs sm:max-w-md). |

### Alerts / toasts

| Finding | Details |
|--------|----------|
| **Implemented well** | Two systems: `Toaster` + `toast()` from `@/hooks/use-toast` and Sonner; both mounted in App. Success/error feedback used in TicketDetail, CreateFEModal, Users, ServiceManagers. |
| **Inconsistency** | Using both Toaster and Sonner can lead to two different toast UIs; no single pattern for “alert” vs “toast” in copy or placement. |

### Badges / tags

| Finding | Details |
|--------|----------|
| **Implemented well** | `Badge` from ui (variants default, secondary, destructive, outline). `StatusBadge` uses CSS classes from index.css (`status-open`, `status-needs-review`, etc.) and is consistent for ticket status. |
| **Inconsistency** | StatusBadge uses custom `.status-badge` + status-specific classes; generic `Badge` is used in Sidebar for role. No single “tag” component for non-status labels. |

### Tabs

| Finding | Details |
|--------|----------|
| **Implemented well** | Radix Tabs in `components/ui/tabs.tsx`; used in LoginForm (Sign in / Sign up). |
| **Inconsistency** | Tabs are used in few places; no shared “page with tabs” layout. |

### Navigation elements

| Finding | Details |
|--------|----------|
| **Implemented well** | Sidebar uses `.nav-item` and `.nav-item.active` from index.css; active state uses `sidebar-primary` and ChevronRight. Section labels and grouping (Platform, Operations, Monitoring, Administration) are clear for Super Admin; Tenant Admin has reduced set. |
| **Inconsistency** | Mobile header uses raw `button` with `hover:bg-muted` instead of `Button` component. Mobile drawer has no focus trap or “close on escape” explicitly documented in component. |

### Pagination

| Finding | Details |
|--------|----------|
| **Gap** | `components/ui/pagination.tsx` exists but is **not used** in TicketsTable, EmailsTable, or other list pages. Tables load full result sets; no client-side or server-side pagination UI. |

### Summary of component inconsistencies

- **Buttons:** Mix of `<Button>` and `.btn-primary` / `.btn-purple` for primary actions.  
- **Spacing:** No unified spacing scale applied to form groups, card padding, or section gaps.  
- **Colors:** Status and confidence use design tokens; some cards and CTAs use inline HSL.  
- **Border radius:** Mix of `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl` without a single scale.  
- **Modal width:** `max-w-lg` vs `sm:max-w-md` in different dialogs.  
- **Tables:** No shared pagination or “data table” wrapper.  
- **Duplicate patterns:** `StatCard` vs Dashboard `MetricCard`; `DashboardLayout` vs `AppLayoutNew`.

---

## 3. Layout and Visual Hierarchy Findings

### What is implemented correctly

- **TicketsList:** Clear hierarchy: title + subtitle → primary action (Create Ticket) → filters → table.  
- **TicketDetail:** Back button, title, status/priority, then actions (Assign, Approve, etc.), then content sections.  
- **Dashboard:** Welcome block with stats, then metric grid, then “Recent tickets” with CTA.  
- **PageContainer:** Provides `space-y-6` (md: `space-y-10`) and consistent horizontal padding for most pages.

### What needs improvement

| Issue | Details |
|-------|--------|
| **Dashboard vs other pages** | Dashboard does not use `PageContainer`; it uses custom sections and padding. Vertical rhythm and max-width differ from TicketsList, FieldExecutives, etc. **File:** `Dashboard.tsx`. |
| **Section structure** | No shared “Page header” component (title + description + actions). Each page implements its own (e.g. “All Tickets” + “Manage and track…” + Create button). Repeating this pattern leads to small differences in spacing and alignment. |
| **Secondary content** | Some pages (e.g. TicketDetail) have a lot of secondary info (comments, timeline, metadata). Grouping and visual weight are reasonable but could be clearer with consistent “card per section” or “accordion” pattern. |

### Hierarchy violations

- **ReviewQueue:** Very minimal layout; no clear “page title” or primary action area—just filters and table.  
- **RawEmails:** Title and table; no hero or description. For a list-only page this is acceptable but differs from TicketsList which has subtitle and primary button.  
- **NotFound:** Centered content with no app chrome (no sidebar, no link back into app), only “Return to Home” to `/`. For logged-in users hitting a 404, a link to `/app` might be more appropriate.

### Files involved

- `src/pages/Dashboard.tsx` (custom layout, no PageContainer)  
- `src/pages/ReviewQueue.tsx`, `src/pages/RawEmails.tsx` (minimal headers)  
- `src/pages/NotFound.tsx` (no app layout, home link)  
- `src/components/layout/PageContainer.tsx`, `src/components/layout/HeroSection.tsx`, `src/components/layout/SectionWrapper.tsx`

---

## 4. Navigation Usability Analysis

### What is implemented correctly

- **Sidebar:** Role-based sections (Platform, Operations, Monitoring, Administration for Super Admin; Tenant Admin gets Dashboard, Users, FEs, Service Managers, Ticket Settings, Settings; Staff get Operations + Monitoring + optional Administration).  
- **Labels:** “Dashboard”, “All Tickets”, “Review Queue”, “Field Executives”, “Raw Emails”, “SLA Monitor”, “Audit Logs”, “Analytics”, “Users”, “Settings” are clear.  
- **Active state:** `nav-item.active` with orange primary and ChevronRight; active detection uses `pathname === item.href` or `pathname.startsWith(item.href + '/')`.  
- **Depth:** Most features are one click from sidebar (Dashboard, Tickets, Review, FEs, Emails, SLA, Audit, Analytics, Users, Settings). Ticket detail is two clicks (Tickets → row).  
- **Mobile:** Hamburger opens overlay drawer with same Sidebar; header shows logo and menu; drawer closes on route change.

### What needs improvement

| Issue | Details |
|-------|--------|
| **Ticket Settings vs SLA** | “Ticket Settings” and “SLA Settings” in legacy `configurationNav` both point to `/app/ticket-settings`; “Categories & Issue Types” also to same route. Redundant entries.  
| **Super Admin routes** | “Platform Overview” goes to `/app/platform`; “Organisations” to `/app/organisations`. Nested routes like `/app/tenant/:orgId` and `/super-admin/org/:clientSlug` are reachable from content (e.g. Org table), not from sidebar. Acceptable but no breadcrumb to show context. |
| **Breadcrumbs** | `Breadcrumb` component exists in ui but is **not used** on any page. Deep pages (e.g. Ticket detail, Tenant view, Super Admin org view) do not show “App > Tickets > #123” or similar. |
| **Client routes** | Client users have Dashboard, Reports, Support, and ticket detail; navigation for client is not visible in the audited Sidebar (role-based; Client likely has different nav or same sidebar with fewer items). |

### Confusing or redundant structures

- **configurationNav** (Users, Ticket Settings, SLA Settings, Categories & Issue Types, Settings) is “Legacy” and used for “non-ADMIN staff with config”; multiple items point to the same `/app/ticket-settings`.  
- **SidebarNew** and **DashboardLayout** are unused; developers might look for “new” layout in SidebarNew and get confused.

### Files involved

- `src/components/layout/Sidebar.tsx` (all nav arrays and rendering)  
- `src/components/layout/MobileSidebarWrapper.tsx` (mobile menu)  
- `src/components/ui/breadcrumb.tsx` (present but unused)

---

## 5. Workflow Efficiency Analysis

| Workflow | Steps (current) | Notes |
|----------|------------------|--------|
| **Create ticket** | 1) Open TicketsList → 2) Click “Create Ticket” → 3) Fill modal → 4) Submit. | Efficient; single modal. |
| **Edit ticket** | 1) TicketsList → 2) Open ticket → 3) Edit in place (if implemented) or via modal. | TicketDetail is read-heavy; any “edit” may require opening a form or inline edit. |
| **Assign ticket** | 1) Open ticket → 2) Click Assign → 3) Choose FE in modal → 4) Confirm. | Clear; AssignmentConfirmDialog / FEAssignmentModal. |
| **Add comment** | 1) Open ticket → 2) Scroll to comments → 3) Type and submit. | Fine; no unnecessary steps. |
| **Search tickets** | 1) TicketsList → 2) Use search in TicketFiltersBar. | Good; search is visible. |
| **Filter tickets** | 1) TicketsList → 2) Use status/confidence filters in bar. | Good; filters in one place. |
| **Close ticket** | 1) Open ticket → 2) Resolve flow (e.g. verify) → 3) Close via CloseTicketDialog or similar. | Depends on resolution verification flow; generally 2–3 steps. |

### Inefficiencies

- **No keyboard shortcut** for “Create Ticket” or “Go to tickets” from Dashboard.  
- **Review Queue** is a separate route; users must switch from “All Tickets” to “Review Queue” to see NEEDS_REVIEW tickets (no single “filter by needs review” CTA on TicketsList that deep-links).  
- **Bulk actions:** No multi-select on table for bulk assign or bulk status change; each ticket is handled individually.

### Files involved

- `src/pages/TicketsList.tsx`, `src/components/tickets/CreateTicketModal.tsx`  
- `src/pages/TicketDetail.tsx`, `src/components/tickets/FEAssignmentModal.tsx`, `src/components/tickets/CloseTicketDialog.tsx`  
- `src/components/tickets/TicketFiltersBar.tsx`

---

## 6. Responsiveness Issues

### What is implemented correctly

- **AppLayoutNew:** Main area has `overflow-x-hidden`, `overflow-y-auto`; mobile gets `pt-14` for fixed header.  
- **MobileSidebarWrapper:** Sidebar hidden on small screens; fixed header with logo + menu; overlay drawer.  
- **PageContainer:** `px-3 md:px-6`, `md:max-w-7xl`; tables wrapped in `overflow-x-auto` on several pages.  
- **TicketFiltersBar:** `flex flex-wrap`, `min-w-[200px] max-w-sm` for search; filters wrap.  
- **Dashboard:** Welcome stats and metric grid use responsive classes (`flex-col`, `md:gap-5`, `lg:flex-row`).  
- **Button:** `min-h-[44px] md:min-h-[2.5rem]` for touch targets.

### What may break or be poor on small screens

| Issue | Details |
|-------|--------|
| **Tables** | TicketsTable (full table with many columns) and other data tables will horizontally scroll; no card/stack layout for mobile. Acceptable if scroll is smooth and headers stay visible; no sticky first column. |
| **Modals** | Dialog content has `max-w-lg` or `sm:max-w-md` and `max-h-[90vh]`; on very small viewports form modals (CreateTicketModal, CreateFEModal) may feel cramped. |
| **Dashboard welcome stats** | Inline stats in a row; on narrow mobile they could wrap or squeeze; no explicit breakpoint for “stack below title”. |
| **Ticket detail** | Long content (metadata, comments, timeline) in one column; no bottom sheet or tabbed layout for mobile. |
| **Sidebar drawer** | Width `w-56`; fine for menu list. No explicit `min-width` on touch targets for nav items. |

### Overflow / horizontal scroll

- **Tables:** `overflow-x-auto` used at table wrapper or page level; horizontal scroll is the intended fallback. No reported `overflow-x-hidden` cutting off table content.  
- **Long text:** Truncation used in table cells (e.g. short_description slice); some labels or IDs might overflow in narrow columns if not truncated.

### Files involved

- `src/components/layout/MobileSidebarWrapper.tsx`  
- `src/components/layout/AppLayoutNew.tsx`  
- `src/components/tickets/TicketsTable.tsx` (compact list for mobile could be improved)  
- `src/pages/Dashboard.tsx`, `src/pages/TicketDetail.tsx`  
- `src/components/ui/dialog.tsx`

---

## 7. Typography Issues

### What is implemented correctly

- **Global font:** `Inter` for body, `JetBrains Mono` for code; loaded via Google Fonts in index.css.  
- **Headings:** `h1–h6` get `font-weight: 600` and `letter-spacing: -0.02em` in base layer.  
- **Page titles:** Often `text-2xl` or `text-3xl font-bold` (e.g. TicketsList “All Tickets”, Dashboard “Dashboard”).  
- **Body:** Default Tailwind + `text-foreground`; muted text via `text-muted-foreground`.

### Inconsistencies

| Issue | Details |
|-------|--------|
| **Page title scale** | Mix of `text-2xl`, `text-3xl`, `text-4xl` for main heading (e.g. Dashboard uses `text-3xl md:text-4xl`; TicketsList uses `text-2xl`). No defined scale (e.g. “page = 2xl, section = xl”). |
| **Section headers** | Some sections use `text-lg font-semibold`, others `text-base font-semibold` or plain bold. |
| **Metadata** | Small text uses `text-xs` or `text-sm` inconsistently; “muted” is used but not always `text-muted-foreground`. |
| **Line height** | No global scale; components rely on Tailwind defaults. |

### Files involved

- `src/index.css` (base typography)  
- `src/pages/Dashboard.tsx`, `src/pages/TicketsList.tsx`, `src/pages/TicketDetail.tsx` (heading sizes)  
- Various cards and list headers

---

## 8. Spacing Inconsistencies

### What is implemented correctly

- **PageContainer:** `space-y-6` (md: `space-y-10`) for vertical rhythm between sections.  
- **Card padding:** StatCard uses `p-5`; many cards use `p-4` or `p-6`.  
- **Form gaps:** CreateTicketModal and similar use `space-y-4` or `gap-4`.

### Inconsistencies

| Issue | Details |
|-------|--------|
| **Section spacing** | Dashboard uses custom `py-6 md:py-8` and internal gaps; other pages rely on PageContainer `space-y-6/10`. So section-to-section spacing differs between Dashboard and rest. |
| **Component spacing** | Buttons and inputs use Tailwind spacing (e.g. `gap-2`, `px-4`); no documented 4/8/12/16/24/32 scale. Some components use `space-y-1.5`, others `space-y-2` or `gap-3` for similar “group of fields”. |
| **Grid gaps** | Dashboard and list pages use `gap-4`; some use `gap-3` (TicketFiltersBar). Not wrong but not a single scale. |

### Recommended scale (for future alignment)

- 4px, 8px, 12px, 16px, 24px, 32px (Tailwind: 1, 2, 3, 4, 6, 8).  
- **Current:** Partial use; no central reference.

### Files involved

- `src/components/layout/PageContainer.tsx`  
- `src/pages/Dashboard.tsx`  
- `src/components/tickets/TicketFiltersBar.tsx`  
- Modal and form components

---

## 9. Interaction Feedback Issues

### What is implemented correctly

- **Buttons:** Focus ring (`focus-visible:ring-2 focus-visible:ring-ring`), disabled opacity, hover (e.g. `hover:bg-primary/90`).  
- **Inputs:** Focus ring, disabled state.  
- **Toasts:** Success and error toasts used after create ticket, assign, approve, etc.  
- **Loading:** TicketsTable shows spinner + “Loading tickets…” when `loading`; Dashboard shows “—” for loading stats.  
- **Nav:** `.nav-item:hover` and `.nav-item.active`; Sidebar active state is clear.

### What is missing or inconsistent

| Issue | Details |
|-------|--------|
| **Submit loading** | CreateTicketModal and similar use `disabled={createFEMutation.isPending}` and sometimes Loader2 icon; not every submit button shows a loading state. |
| **Table row feedback** | Row hover is `hover:bg-muted/50`; no “selected” state for table rows when navigating to detail. |
| **Success after create** | Modal closes and list refetches; toast confirms. Good. No inline “Ticket created” banner on the list. |
| **Error states** | Forms show toasts on error; no inline field-level error display in all forms (e.g. validation errors under inputs). |
| **Focus trap in drawer** | Mobile drawer does not explicitly trap focus or restore focus on close; Radix Dialog does, but the custom overlay + div drawer may not. |

### Files involved

- `src/components/ui/button.tsx`, `src/components/ui/input.tsx`  
- `src/components/tickets/CreateTicketModal.tsx`, `src/components/field-executives/CreateFEModal.tsx`  
- `src/components/layout/MobileSidebarWrapper.tsx`  
- `src/hooks/use-toast.ts`, Sonner usage in App

---

## 10. Data Display Improvements

### Tables

- **Implemented:** Tables use shadcn Table; TicketsTable has loading and empty states; StatusBadge and ConfidenceScore in cells.  
- **Missing:** No sorting controls on column headers; no pagination (all data loaded); no column visibility toggle. Filtering is via TicketFiltersBar (search, status, confidence), which is good.  
- **Readability:** Wrapped in `rounded-xl border bg-card`; row hover helps. Long text truncated.  
- **Mobile:** Full table scrolls horizontally; TicketsTable has a `compact` mode (list of links) but it’s not clear if it’s used on small breakpoints automatically.

### Lists / cards

- **TicketsTable compact:** Card-like rows with ticket number, description snippet, StatusBadge.  
- **StatCard / MetricCard:** Clear value + label + optional trend.  
- **Improvement:** No shared “empty state” component; each table/page implements its own (e.g. TicketsTable “No tickets found” with emoji and text).

### Dashboards

- **Dashboard:** Welcome stats + metric grid + recent tickets; clear.  
- **ClientDashboard, SuperAdminDashboard, TenantAdminDashboard:** Each has custom layout and stat blocks; no shared “dashboard grid” component.  
- **Charts:** Analytics and similar pages use recharts; not audited in depth; ensure tooltips and legends are readable on small screens.

### Files involved

- `src/components/tickets/TicketsTable.tsx`  
- `src/components/ui/table.tsx`  
- `src/components/dashboard/StatCard.tsx`  
- `src/pages/Dashboard.tsx`, `src/pages/Analytics.tsx`

---

## 11. Accessibility Concerns

### What is implemented correctly

- **Focus:** Buttons and inputs have `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`.  
- **Dialog:** Radix Dialog provides focus trap and restoration.  
- **Labels:** Form fields use Label component; DialogTitle and DialogDescription used.  
- **Semantic HTML:** Headings, nav, main used; table markup is proper.  
- **ARIA:** TicketsTable priority star has `aria-label="Priority"`; mobile menu button has `aria-label="Open menu"`; drawer has `role="dialog"` and `aria-label="Menu"`.  
- **Color:** Status and confidence use both color and text/labels (e.g. “Open”, “Needs Review”); not relying on color alone.

### What needs improvement

| Issue | Details |
|-------|--------|
| **Color contrast** | Not measured; CSS variables use HSL. Ensure `--muted-foreground`, `--sidebar-foreground`, and status badge text meet WCAG AA on their backgrounds. |
| **Keyboard** | Sidebar nav uses `Link` (focusable); mobile drawer close is only by clicking overlay or navigating. Escape to close drawer not clearly implemented in MobileSidebarWrapper. |
| **Skip link** | No “Skip to main content” link for keyboard users. |
| **Breadcrumbs** | Breadcrumb component has `aria-label="breadcrumb"` but is unused; deep pages lack structural breadcrumbs for screen readers. |
| **Loading** | Loading spinners may need `aria-live` or `role="status"` and “Loading…” text for screen readers (TicketsTable does show text). |

### Files involved

- `src/components/layout/MobileSidebarWrapper.tsx` (drawer keyboard/escape)  
- `src/index.css` (contrast of muted and sidebar colors)  
- `src/components/tickets/TicketsTable.tsx` (loading region)  
- `src/App.tsx` (no skip link)

---

## 12. Performance and Rendering

### What is implemented correctly

- **Code splitting:** Vite + React Router; route-level splitting is default for many setups; not verified in build output.  
- **Queries:** TanStack Query with `retry: 1`, `refetchOnWindowFocus: false`; avoids unnecessary refetches.  
- **Lazy loading:** Not observed for routes in the audited files; all page components imported directly in App.tsx.

### Potential improvements

| Issue | Details |
|-------|--------|
| **Bundle size** | All pages imported in App; no `React.lazy` for route components. Large pages (e.g. Analytics, Users, TicketDetail) could be lazy-loaded. |
| **Re-renders** | List pages (TicketsList, FieldExecutives) pass data to table; no obvious unnecessary re-renders. Complex pages (TicketDetail) may benefit from memoized sections if profiling shows cost. |
| **Images** | Logo uses `<img src="/sahaya-logo.png">`; no explicit dimensions or loading strategy. |
| **Heavy components** | Recharts and large tables on one page could impact time-to-interactive; consider virtualization for very long tables if needed. |

### Files involved

- `src/App.tsx` (all page imports)  
- `src/main.tsx`  
- `src/pages/Analytics.tsx`, `src/pages/Users.tsx`, `src/pages/TicketDetail.tsx`

---

## 13. Visual Polish Opportunities

### What is implemented correctly

- **Palette:** Purple/maroon primary and orange accent are consistent in tokens and most UI.  
- **Shadows:** Design tokens `--shadow-sm`, `--shadow-md`, etc.; card and dashboard sections use them.  
- **Radius:** `--radius: 0.625rem`; many components use `rounded-md`, `rounded-lg`, `rounded-xl`.  
- **Status colors:** Centralized in CSS variables; StatusBadge and index.css status classes align.  
- **Landing:** SahayaLanding has hero, steps, modules, enterprise features; gradient and section labels feel on-brand.

### What looks unfinished or inconsistent

| Issue | Details |
|-------|--------|
| **Mixed primary CTA style** | Orange gradient (btn-primary) vs purple (Button default) for primary actions; pick one for “primary” and use the other for “secondary” or accent. |
| **Inline gradients** | Dashboard MetricCard and welcome block use inline `style={{ background: "linear-gradient(...)" }}` instead of tokens; slight risk of drift and harder theming. |
| **Mobile header** | Fixed header uses `bg-white` instead of `bg-background`; in dark mode could be wrong. |
| **404 page** | Very minimal; no branding or app chrome; “Return to Home” goes to `/` which may be landing; consider “Back to app” for authenticated users. |
| **Empty states** | Different treatments (emoji + text in TicketsTable; other pages may differ); could be one EmptyState component with icon + title + description + optional action. |

### Files involved

- `src/index.css` (tokens, btn-primary, btn-purple)  
- `src/pages/Dashboard.tsx` (inline gradients)  
- `src/components/layout/MobileSidebarWrapper.tsx` (header bg)  
- `src/pages/NotFound.tsx`  
- `src/components/tickets/TicketsTable.tsx` (empty state)

---

## Summary Table

| Section | Implemented well | Needs improvement |
|--------|-------------------|-------------------|
| **Architecture** | React, routing, AppLayoutNew, TanStack Query, Tailwind + tokens, design system base | Unused DashboardLayout/SidebarNew; Dashboard without PageContainer; inline styles vs tokens |
| **Components** | Button, Input, Dialog, Select, Table, Badge, StatusBadge, forms | btn-primary vs Button; modal widths; no pagination; two toast systems; duplicate metric card patterns |
| **Layout / hierarchy** | TicketsList, TicketDetail, PageContainer, section structure | Dashboard inconsistent; no shared page header; ReviewQueue/RawEmails minimal; NotFound |
| **Navigation** | Role-based sidebar, active state, depth, mobile drawer | Redundant Ticket Settings links; no breadcrumbs; configurationNav legacy |
| **Workflows** | Create/assign/filter/close flows generally efficient | No bulk actions; no keyboard shortcuts; Review Queue as separate route only |
| **Responsiveness** | Breakpoints, overflow-x on tables, mobile drawer, touch targets | Tables not card-stacked on mobile; modals on very small screens; no sticky table headers |
| **Typography** | Inter, headings weight, muted text | Inconsistent title sizes; no formal scale |
| **Spacing** | PageContainer, card padding, form gaps | Dashboard vs others; no single scale |
| **Feedback** | Focus, toasts, loading in table, nav hover/active | Some submit buttons without loading state; drawer focus trap/escape; no inline field errors everywhere |
| **Data display** | Tables, StatCard, empty states in place | No table sorting/pagination; no shared EmptyState; compact table not auto for mobile |
| **Accessibility** | Focus ring, labels, ARIA where checked, semantic HTML | Contrast not verified; no skip link; drawer escape; breadcrumbs unused |
| **Performance** | Query options | No route lazy loading; all pages in main bundle |
| **Polish** | Palette, shadows, radius, status colors, landing | Mixed primary CTA; inline gradients; 404 and empty state consistency |

---

## Implementation Summary (Post-Audit)

The following safe, incremental improvements were applied without changing backend, API, routing, or business logic.

### Completed improvements

| Area | Change |
|------|--------|
| **Internal banners** | Removed Review Queue explanation alert; removed Field Executives “view-only / assignments from Ticket Detail” alert; removed FEDetailSheet “view-only profile” alert. |
| **All Statuses** | Standardized label to “All Statuses” in TicketFiltersBar, Users, FieldExecutives, and SLAMonitor dropdowns. |
| **Card padding** | TicketsTable wrapper uses `p-6`; Dashboard Recent Tickets card content uses `p-6`; status badge uses `px-3 py-1` in design tokens. |
| **List row interaction** | Table rows: `transition-colors duration-150`, `hover:bg-muted/40`, `hover:shadow-sm`. Compact list rows: `hover:bg-muted/40`, `hover:shadow-sm`, `transition-all duration-200`, `px-4`. |
| **Status badge** | Status column right-aligned; badge style `px-3 py-1 text-xs font-medium rounded-full` in CSS. |
| **Typography** | Page titles: `text-2xl font-semibold` (e.g. ReviewQueue, TicketsList, Dashboard). Section titles: `text-lg font-semibold`. Descriptions: `text-sm text-muted-foreground`. |
| **Dashboard** | Service Overview grid: `grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4`; section title `text-lg font-semibold`; overview block padding `p-6`. |
| **Performance** | Route-level lazy loading with `React.lazy` + `Suspense` for TicketDetail, AuditLogs, Analytics, Users; shared `PageLoader` fallback. |
| **Memoization** | `TicketsTable` and `EmailsTable` wrapped with `React.memo` to reduce re-renders. |
| **Transitions** | Button: `transition-all duration-200 ease-in-out`. Nav items already use `transition-all duration-150`. |
| **Mobile** | Mobile header uses `bg-background` instead of `bg-white` for theme consistency. |

### Not changed (by design)

- SLA Monitor “SLA Timer Rules” alert retained as user-facing product explanation.
- Backend, API contracts, routing, and business rules unchanged.
- No removal of existing functionality.
