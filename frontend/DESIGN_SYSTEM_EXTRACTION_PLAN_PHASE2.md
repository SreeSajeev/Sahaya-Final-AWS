# Phase 2 — Design System Extraction Plan

**Source:** sahaya-operations-suite (Lovable)  
**Target:** field-ops-assist (Production)  
**Principle:** Extend only; never replace routing, auth, or business logic.

---

## Pre-flight checklist

- [ ] Phase 1 analysis report has been read.
- [ ] No backend or API changes are in scope.
- [ ] Git branch created for design-system work (recommended).
- [ ] Production build passes before starting: `npm run build`

---

## STEP 1 — Merge Tailwind theme extensions

**Goal:** Add Lovable’s theme extensions to production’s `tailwind.config.ts` under `theme.extend` only. Do not remove or overwrite any existing key.

### 1.1 File to modify

- **Path:** `field-ops-assist/tailwind.config.ts`

### 1.2 What to insert and where

**Location:** Inside `theme: { extend: { ... } }`, after existing keys.

**Add the following keys only (do not touch `colors`, `keyframes`, `animation`):**

1. **borderRadius** — Add two keys to the existing `borderRadius` object:
   - After `sm: "calc(var(--radius) - 4px)",` add:
   - `xl: "calc(var(--radius) + 4px)",`
   - `"2xl": "calc(var(--radius) + 8px)",`

2. **fontFamily** — Optionally align fallbacks (low risk):
   - Change `sans: ["Inter", "system-ui", "sans-serif"]` to:
   - `sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],`
   - Change `mono: ["JetBrains Mono", "monospace"]` to:
   - `mono: ["JetBrains Mono", "ui-monospace", "monospace"],`

3. **backgroundImage** — New key (production does not have it):
   - Add after `fontFamily` (or after existing last key in `extend` if fontFamily is not changed):
   ```ts
   backgroundImage: {
     "gradient-primary": "linear-gradient(135deg, hsl(285 45% 28%), hsl(285 45% 35%))",
     "gradient-accent": "linear-gradient(135deg, hsl(32 95% 48%), hsl(32 95% 55%))",
     "gradient-hero": "linear-gradient(135deg, hsl(285 45% 12%), hsl(285 55% 25%))",
     "gradient-hero-subtle": "linear-gradient(135deg, hsl(285 45% 18%), hsl(285 50% 28%))",
   },
   ```

4. **boxShadow** — New key (production does not have it):
   ```ts
   boxShadow: {
     card: "0 1px 3px 0 hsl(285 25% 10% / 0.07), 0 1px 2px -1px hsl(285 25% 10% / 0.07)",
     glow: "0 0 20px hsl(32 95% 52% / 0.3)",
     "glow-lg": "0 0 40px hsl(32 95% 52% / 0.25)",
     "glow-purple": "0 0 30px hsl(285 45% 45% / 0.25)",
   },
   ```

### 1.3 Why it is safe

- All additions are under `extend`. Tailwind merges with existing theme; existing `colors`, `keyframes`, `animation` remain unchanged.
- Production already uses CSS variables for gradients/shadows; these Tailwind utilities add optional class-based usage (e.g. `bg-gradient-hero`, `shadow-glow`) without breaking current CSS.

### 1.4 Risks

- If production already used a custom `backgroundImage` or `boxShadow` key with the same name elsewhere, it would be overridden. Phase 1 confirmed production has no `theme.extend.backgroundImage` or `theme.extend.boxShadow`.

### 1.5 Validation

- Run `npm run build` in `field-ops-assist`.
- Confirm no TypeScript or Tailwind errors.
- Optionally use a page that uses `bg-gradient-hero` or `shadow-card` and confirm styles apply.

---

## STEP 2 — Merge global CSS variables and utilities

**Goal:** Add missing design tokens and optional utility classes to production’s `index.css`. Do not delete or overwrite existing variables or production-only classes.

### 2.1 File to modify

- **Path:** `field-ops-assist/src/index.css`

### 2.2 What to insert and where

**2.2.1 CSS variables (in `:root` inside `@layer base`)**

- **Where:** After existing `--shadow-glow` (around line 94).
- **Insert:**
  ```css
  --gradient-hero-radial: radial-gradient(ellipse at 70% 50%, hsl(32 95% 52% / 0.12) 0%, transparent 60%);
  --shadow-glow-purple: 0 0 30px hsl(285 45% 45% / 0.25);
  ```
- **Why:** Production already has `--gradient-hero` and `--shadow-glow`; these add optional radial hero overlay and purple glow. No naming conflict.

**2.2.2 Optional utility classes (in `@layer components` or `@layer utilities`)**

Add only classes that do not already exist in production:

- **Where:** In `@layer components`, after `.hero-radial-glow` block (before the closing `}` of the layer).
- **Insert:**

  ```css
  /* Step connector line (Lovable) */
  .step-line::after {
    content: '';
    position: absolute;
    top: 50%;
    left: calc(100% + 8px);
    width: calc(100% - 16px);
    height: 1px;
    background: linear-gradient(90deg, hsl(285 45% 45% / 0.5), hsl(32 95% 52% / 0.3));
  }

  /* Glow border (Lovable) */
  .glow-border {
    box-shadow: 0 0 0 1px hsl(32 95% 52% / 0.3), 0 0 20px hsl(32 95% 52% / 0.15);
  }
  ```

- **Where (keyframes + animation):** In `@layer utilities`, after existing `slideInLeft` keyframes, add:
  ```css
  @keyframes glowPulse {
    0%, 100% { box-shadow: 0 0 20px hsl(32 95% 52% / 0.2); }
    50% { box-shadow: 0 0 40px hsl(32 95% 52% / 0.4); }
  }

  .animate-glow-pulse {
    animation: glowPulse 3s ease-in-out infinite;
  }
  ```

### 2.3 Do not add / do not overwrite

- Do **not** add Lovable’s `.text-gradient-hero` if it would conflict with usage; Phase 1 said production has no such class — optional add only if needed.
- Do **not** change existing `.text-gradient-primary`, `.text-gradient-accent`, `.card-interactive`, `.logo-glow`, `.glass`, `.glass-dark`, `.scrollbar-thin`, or any status/SLA/button/nav/timeline classes.
- Do **not** replace production’s `.dark` block; keep production dark mode variables.

### 2.4 Why it is safe

- New variables and classes use new names or are additive. Production tokens and production-only utilities remain intact.

### 2.5 Risks

- Duplicate keyframe name `glowPulse`: ensure it does not exist in production (Phase 1: it does not). If `animate-glow-pulse` is added, ensure no existing class uses that name.

### 2.6 Validation

- `npm run build`.
- Visually spot-check a page that uses design tokens (e.g. SahayaLanding) to ensure no regression.
- If you use `.step-line` or `.glow-border` anywhere, confirm they render.

---

## STEP 3 — Dependencies

**Goal:** Confirm no new packages are required; align versions only if needed.

### 3.1 Action

- **No new installs** for the design system layer. Phase 1 confirmed production already has:
  - `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `tailwindcss-animate`
- **Optional:** If you later add Lovable-specific features that use a package not in production (e.g. framer-motion), add that in a separate change. For this extraction, **skip npm install**.

### 3.2 Validation

- `npm run build` and `npm run dev`; TypeScript and runtime unchanged.

---

## STEP 4 — Copy presentational components only

**Goal:** Avoid overwriting production components. Phase 1 showed Button, Card, Badge, and lib/utils are already equivalent; no file copy required for those.

### 4.1 Components to **not** copy

- **Button, Card, Badge, lib/utils:** Already aligned; do not replace.
- **Lovable pages, routing, or hooks:** Out of scope.
- **Lovable `ui/sidebar.tsx`:** Do not replace production’s `layout/Sidebar.tsx` (different role: auth, routes, nav structure).

### 4.2 Optional: net-new components

If Lovable has a **presentational** component that production does not have and that does not depend on routing or backend, it can be copied as a **new** file (do not overwrite):

- **Example:** If Lovable had a `SectionWrapper.tsx` or `Container.tsx` that is purely styling (no routes, no API), copy it to `field-ops-assist/src/components/ui/` and fix imports to use `@/lib/utils` and `@/components/ui/*`.
- **Current audit:** Phase 1 did not identify a Lovable-only presentational component that production lacks; both share the same shadcn set. So **Step 4 can be a no-op** unless you later add a specific Lovable component by name.

### 4.3 Validation

- Build and dev; no broken imports. If you add a component, use it on one page and confirm it renders.

---

## STEP 5 — Layout refresh (styling only)

**Goal:** Refresh production layout and sidebar **styling** so they use design tokens and look consistent with Lovable, without changing structure, routes, or auth.

### 5.1 File: `field-ops-assist/src/components/layout/DashboardLayout.tsx`

**What to do:**

- Keep the same structure: `div` → `Sidebar` → `main` → inner `div` with children.
- **Only adjust classNames** to use design tokens and spacing consistent with design system:
  - Root: e.g. `flex h-screen overflow-hidden bg-background` (already token-based; keep or align with Lovable’s container if desired).
  - Main content area: ensure padding/spacing use design tokens (e.g. `p-6` per design system). No structural change.

**Exact change (minimal):**

- If the current root is already `flex h-screen overflow-hidden bg-background`, leave it.
- If the inner content div uses fixed pixel padding, consider `p-6` (24px) per design system. No removal of wrappers or routes.

**Why safe:** Only class names change; component tree and children unchanged.

**Risk:** None if only Tailwind classes are edited.

**Validation:** Load a staff route (e.g. `/app`); confirm layout and sidebar still render and content is visible.

---

### 5.2 File: `field-ops-assist/src/components/layout/Sidebar.tsx`

**What to do:**

- **Do not** replace the component with Lovable’s `ui/sidebar.tsx`.
- **Only** replace hardcoded colors with design tokens where they exist:
  - Root container background: replace `style={{ background: 'hsl(285 45% 18%)' }}` with `className="bg-sidebar"` or equivalent token (e.g. `bg-[hsl(var(--sidebar-background))]` if Tailwind does not expose `sidebar` in your config). If production tailwind already has `sidebar` in theme.extend.colors, use `bg-sidebar`.
  - Border: replace `style={{ borderColor: 'hsl(285 35% 25%)' }}` with `border-sidebar-border` or equivalent.
- Keep all logic: `useLocation`, `useAuth`, `navigation`, `monitoringNav`, `adminNavigation`, `superAdminNavigation`, `NavSection`, `Link`, sign out, role display.

**Exact changes (minimal):**

- Root div: add or replace with `className="flex h-screen w-64 flex-col bg-sidebar border-r border-sidebar-border"` (if `sidebar` and `sidebar-border` exist in production Tailwind colors). Otherwise keep inline style but use a CSS variable, e.g. `style={{ background: 'hsl(var(--sidebar-background))' }}`.
- Logo area border: use `border-sidebar-border` or variable.
- Ensure nav items keep `nav-item` and `active` classes (production CSS); do not remove.

**Why safe:** Only styling; routing and auth logic untouched.

**Risk:** If `sidebar` is not in Tailwind theme, use CSS variable in style or add sidebar colors to Tailwind extend (production already has sidebar in index.css variables).

**Validation:** Load `/app`; sidebar background and borders use tokens; nav links and sign out still work.

---

## STEP 6 — Container and section consistency (optional)

**Goal:** If production uses ad-hoc container classes, align with a single pattern.

### 6.1 Recommendation

- Production pages likely use `container mx-auto px-6` or similar. Ensure `tailwind.config.ts` `theme.container` has `center: true`, `padding: "2rem"` (or `p-6`), and `screens.2xl: "1400px"` so that `container` class is consistent. Phase 1 showed both repos already have the same container config; **no change required** unless you want to tweak padding.

### 6.2 Validation

- One staff page and one public page; confirm content is not cut off and alignment looks correct.

---

## Execution order summary

| Order | Step | Action |
|-------|------|--------|
| 1 | Tailwind theme | Add `borderRadius.xl`/`2xl`, optional `fontFamily`, `backgroundImage`, `boxShadow` in `field-ops-assist/tailwind.config.ts`. |
| 2 | Global CSS | Add `--gradient-hero-radial`, `--shadow-glow-purple`, `.step-line`, `.glow-border`, `glowPulse` + `.animate-glow-pulse` in `field-ops-assist/src/index.css`. |
| 3 | Dependencies | No install; verify build. |
| 4 | Components | No copy (Button/Card/Badge/utils already aligned). Optional: add any net-new presentational component only if identified. |
| 5 | Layout refresh | Styling-only updates in `DashboardLayout.tsx` and `Sidebar.tsx`; no structure or logic change. |
| 6 | Container | No change unless desired. |

---

## Rollback

- All changes are in `field-ops-assist` only: Tailwind config, index.css, and two layout components.
- Revert the branch or undo edits to those files to roll back.

---

## Phase 3 readiness

After completing this plan (Phase 3 execution), run:

1. `npm run build`
2. `npm run dev` → open `/`, `/login`, `/app`
3. Confirm no TypeScript errors, no runtime errors, routes and API calls work, and the UI uses the design system visually.

This document is the single source of truth for Phase 3 implementation.
