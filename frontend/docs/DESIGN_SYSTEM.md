# Sahaya Design System Documentation
## By Pariskq

> **Version:** 1.0  
> **Platform:** Web (React + Tailwind CSS)  
> **Last Updated:** February 2026

---

## Table of Contents

1. [Brand & Visual Identity](#1-brand--visual-identity)
2. [Color System](#2-color-system)
3. [Typography System](#3-typography-system)
4. [Spacing & Layout Rules](#4-spacing--layout-rules)
5. [Component Library](#5-component-library)
6. [Iconography & Imagery](#6-iconography--imagery)
7. [Interaction & Motion](#7-interaction--motion)
8. [Accessibility & Mobile UX](#8-accessibility--mobile-ux)
9. [Reusability & Consistency Guidelines](#9-reusability--consistency-guidelines)

---

## 1. Brand & Visual Identity

### 1.1 Overall Design Style
- **Style:** Modern Enterprise SaaS
- **Approach:** Clean, professional, operations-focused
- **Aesthetic:** Refined minimalism with purposeful color accents

### 1.2 Design Philosophy
The Sahaya interface prioritizes **operational clarity** and **status-driven visual communication**. The design supports:
- Quick status recognition through color coding
- Scannable data tables with clear hierarchy
- Action-oriented workflows with prominent CTAs
- Human-in-the-loop decision making with visual confidence indicators

### 1.3 Emotional Tone
- **Trustworthy:** Deep purple tones convey reliability and professionalism
- **Energetic:** Orange accents inject action-oriented energy
- **Efficient:** Clean layouts minimize cognitive load
- **Confident:** Bold typography and clear status indicators

### 1.4 Brand Elements
- **Logo:** Shield icon with gradient background
- **Product Name:** "Sahaya"
- **Tagline:** "by Pariskq"
- **Brand Statement:** "Clear Connections, Total Control"

---

## 2. Color System

### 2.1 Primary Colors

| Color Name | HSL Value | HEX Equivalent | Usage |
|------------|-----------|----------------|-------|
| **Primary** | `285 45% 30%` | `#5C2D6D` | Buttons, links, sidebar accents, headers |
| **Primary Foreground** | `0 0% 100%` | `#FFFFFF` | Text on primary backgrounds |

### 2.2 Accent Colors

| Color Name | HSL Value | HEX Equivalent | Usage |
|------------|-----------|----------------|-------|
| **Accent (Orange)** | `32 95% 52%` | `#F5A623` | CTAs, highlights, badges, sidebar active state |
| **Accent Foreground** | `0 0% 100%` | `#FFFFFF` | Text on accent backgrounds |

### 2.3 Surface Colors

| Color Name | HSL Value | Usage |
|------------|-----------|-------|
| **Background** | `30 5% 98%` | Page background |
| **Card** | `0 0% 100%` | Card surfaces, elevated elements |
| **Popover** | `0 0% 100%` | Dropdown menus, tooltips |
| **Muted** | `270 10% 94%` | Subtle backgrounds, hover states |
| **Secondary** | `280 20% 95%` | Secondary button backgrounds |

### 2.4 Text Colors

| Color Name | HSL Value | Usage |
|------------|-----------|-------|
| **Foreground** | `270 25% 15%` | Primary body text |
| **Muted Foreground** | `270 10% 45%` | Secondary text, labels, descriptions |
| **Card Foreground** | `270 25% 15%` | Text on cards |

### 2.5 Status Colors (Semantic)

| Status | HSL Value | HEX Approx | Usage |
|--------|-----------|------------|-------|
| **Success** | `145 65% 35%` | `#2D8A4E` | Success states, resolved tickets |
| **Warning** | `38 95% 50%` | `#F5A623` | Warnings, needs review |
| **Destructive (Error)** | `0 72% 51%` | `#DC2626` | Errors, breaches, critical alerts |
| **Info** | `205 85% 50%` | `#2196F3` | Informational badges, open status |

### 2.6 Ticket Status Colors

| Status | HSL Value | Visual Representation |
|--------|-----------|----------------------|
| **Open** | `205 85% 50%` | Blue badge |
| **Needs Review** | `38 95% 50%` | Amber/orange badge |
| **Assigned** | `285 45% 50%` | Purple badge |
| **En Route** | `175 60% 40%` | Teal badge |
| **On Site** | `145 65% 38%` | Green badge |
| **Resolved** | `145 65% 28%` | Dark green badge |
| **Pending Verification** | `32 95% 52%` | Orange badge |
| **Reopened** | `0 72% 51%` | Red badge |

### 2.7 Confidence Score Colors

| Level | HSL Value | Threshold |
|-------|-----------|-----------|
| **High** | `145 65% 35%` (Green) | ≥ 95% |
| **Medium** | `38 95% 50%` (Amber) | 80-94% |
| **Low** | `0 72% 51%` (Red) | < 80% |

### 2.8 Sidebar Colors (Dark Theme)

| Element | HSL Value |
|---------|-----------|
| **Sidebar Background** | `285 45% 18%` |
| **Sidebar Foreground** | `270 10% 92%` |
| **Sidebar Primary (Active)** | `32 95% 52%` |
| **Sidebar Accent (Hover)** | `285 40% 25%` |
| **Sidebar Border** | `285 35% 25%` |

### 2.9 Border & Input Colors

| Element | HSL Value |
|---------|-----------|
| **Border** | `270 15% 88%` |
| **Input Border** | `270 15% 88%` |
| **Focus Ring** | `285 45% 45%` |

### 2.10 Gradients

```css
/* Primary Gradient - Purple */
--gradient-primary: linear-gradient(135deg, hsl(285 45% 28%), hsl(285 45% 35%));

/* Accent Gradient - Orange */
--gradient-accent: linear-gradient(135deg, hsl(32 95% 48%), hsl(32 95% 55%));

/* Hero Gradient */
--gradient-hero: linear-gradient(135deg, hsl(285 45% 22%), hsl(285 55% 35%));
```

### 2.11 Shadows

```css
--shadow-sm: 0 1px 2px 0 hsl(285 25% 10% / 0.05);
--shadow-md: 0 4px 6px -1px hsl(285 25% 10% / 0.08), 0 2px 4px -2px hsl(285 25% 10% / 0.06);
--shadow-lg: 0 10px 15px -3px hsl(285 25% 10% / 0.10), 0 4px 6px -4px hsl(285 25% 10% / 0.07);
--shadow-card: 0 1px 3px 0 hsl(285 25% 10% / 0.07), 0 1px 2px -1px hsl(285 25% 10% / 0.07);
--shadow-glow: 0 0 20px hsl(32 95% 52% / 0.3); /* Orange glow for CTAs */
```

---

## 3. Typography System

### 3.1 Font Families

| Usage | Font Family | Fallbacks |
|-------|-------------|-----------|
| **Primary (Sans)** | Inter | system-ui, -apple-system, sans-serif |
| **Monospace** | JetBrains Mono | ui-monospace, monospace |

**Font Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
```

**Font Features:**
```css
font-feature-settings: "cv02", "cv03", "cv04", "cv11";
```

### 3.2 Font Weights

| Weight | Value | Usage |
|--------|-------|-------|
| Regular | 400 | Body text, descriptions |
| Medium | 500 | Labels, secondary headings |
| Semibold | 600 | Headings, card titles, buttons |
| Bold | 700 | Main headings, stats, emphasis |

### 3.3 Type Scale

| Element | Size | Weight | Line Height | Letter Spacing |
|---------|------|--------|-------------|----------------|
| **H1 (Page Title)** | 2rem (32px) | 700 | 1.2 | -0.02em |
| **H2 (Section Title)** | 1.5rem (24px) | 700 | 1.3 | -0.02em |
| **H3 (Card Title)** | 1.25rem (20px) | 600 | 1.4 | -0.02em |
| **H4 (Subsection)** | 1.125rem (18px) | 600 | 1.4 | -0.02em |
| **H5 (Small Heading)** | 1rem (16px) | 600 | 1.5 | -0.02em |
| **Body Large** | 1.125rem (18px) | 400 | 1.6 | normal |
| **Body** | 0.875rem (14px) | 400 | 1.5 | normal |
| **Body Small** | 0.75rem (12px) | 400 | 1.5 | normal |
| **Caption** | 0.625rem (10px) | 500-700 | 1.4 | 0.05em (uppercase) |
| **Button** | 0.875rem (14px) | 500 | 1 | normal |
| **Label** | 0.875rem (14px) | 500 | 1 | normal |
| **Monospace (Data)** | 0.875rem (14px) | 400-600 | 1.4 | normal |

### 3.4 Text Alignment Conventions

| Context | Alignment |
|---------|-----------|
| Headings | Left |
| Body text | Left |
| Table headers | Left |
| Table numeric data | Left (with tabular-nums) |
| Card stats | Left |
| Centered cards | Center (auth pages only) |

---

## 4. Spacing & Layout Rules

### 4.1 Base Spacing Unit

The design uses an **8px base grid** with the following scale:

| Token | Value | Tailwind Class |
|-------|-------|----------------|
| `space-0.5` | 2px | `0.5` |
| `space-1` | 4px | `1` |
| `space-1.5` | 6px | `1.5` |
| `space-2` | 8px | `2` |
| `space-3` | 12px | `3` |
| `space-4` | 16px | `4` |
| `space-5` | 20px | `5` |
| `space-6` | 24px | `6` |
| `space-8` | 32px | `8` |

### 4.2 Component Spacing

| Component | Padding | Gap/Margin |
|-----------|---------|------------|
| **Page Container** | `p-6` (24px) | — |
| **Card** | `p-5` (20px) | — |
| **Card Header** | `p-6 pb-3` | — |
| **Card Content** | `p-6 pt-0` | `space-y-4` |
| **Button** | `px-4 py-2` (default) | — |
| **Button Small** | `px-3 h-9` | — |
| **Input** | `px-3 py-2` | — |
| **Badge** | `px-2.5 py-1` | `gap-1.5` |
| **Sidebar** | `px-3 py-5` | `space-y-1` |
| **Sidebar Nav Item** | `px-3 py-2.5` | `gap-3` |

### 4.3 Section Spacing

| Context | Spacing |
|---------|---------|
| Between page sections | `space-y-8` (32px) |
| Between cards in grid | `gap-5` (20px) |
| Between form fields | `space-y-4` (16px) |
| Between stat cards | `gap-5` (20px) |

### 4.4 Grid System

| Layout | Configuration |
|--------|--------------|
| **Stat Cards Grid** | `grid gap-5 sm:grid-cols-2 lg:grid-cols-4` |
| **Main Content + Sidebar** | `grid gap-6 lg:grid-cols-3` with `lg:col-span-2` |
| **Form Two Column** | `grid grid-cols-2 gap-3` |

### 4.5 Screen Edge Padding

| Context | Padding |
|---------|---------|
| Main content area | `p-6` (24px) |
| Sidebar | `px-3` (12px horizontal) |
| Modal content | Built into Dialog component |

### 4.6 Border Radius

```css
--radius: 0.625rem; /* 10px - Base radius */
```

| Size | Value | Usage |
|------|-------|-------|
| `rounded-sm` | 6px | Small badges |
| `rounded-md` | 8px | Inputs, small buttons |
| `rounded-lg` | 10px | Cards, buttons |
| `rounded-xl` | 12px | Icon containers, avatars |
| `rounded-full` | 9999px | Badges, avatars, indicators |

---

## 5. Component Library

### 5.1 Buttons

#### Primary Button (Orange Gradient)
```
Background: linear-gradient(135deg, hsl(32 95% 48%), hsl(32 95% 55%))
Text: White
Font: 14px, Semibold
Height: 40px (default), 44px (large), 36px (small)
Padding: px-4 py-2
Border Radius: 8px
Shadow: shadow-md
Hover: Gradient lightens, glow effect, translateY(-1px)
```

#### Purple Button (Secondary Branded)
```
Background: linear-gradient(135deg, hsl(285 45% 30%), hsl(285 45% 38%))
Text: White
Height: 40px
Hover: Gradient lightens, translateY(-1px)
```

#### Outline Button
```
Background: Transparent
Border: 1px solid border color
Text: Foreground
Hover: bg-accent, text-accent-foreground
```

#### Ghost Button
```
Background: Transparent
Text: Foreground
Hover: bg-accent with 10% opacity
```

#### Destructive Button
```
Background: hsl(0 72% 51%)
Text: White
Hover: 90% opacity
```

#### Disabled State (All Buttons)
```
Opacity: 50%
Pointer Events: None
```

#### Button Sizes
| Size | Height | Padding |
|------|--------|---------|
| Default | 40px | px-4 py-2 |
| Small | 36px | px-3 |
| Large | 44px | px-8 |
| Icon | 40px × 40px | — |

### 5.2 Input Fields

#### Text Input
```
Height: 40px (default), 44px (forms)
Border: 1px solid hsl(270 15% 88%)
Border Radius: 8px
Background: Background color
Padding: px-3 py-2
Font: 14px (desktop), 16px (mobile)
Placeholder: Muted foreground
Focus: 2px ring with ring color, ring-offset-2
```

#### Search Input
```
Same as text input
Padding Left: 36px (for icon)
Icon: Search icon at left, muted-foreground
```

#### Select/Dropdown
```
Same dimensions as input
Chevron icon on right
Dropdown: Card background, shadow-md, rounded-lg
Options: py-1.5 px-2, hover:bg-accent
```

#### Textarea
```
Min Height: 80px (3 rows default)
Same styling as input
Resize: Vertical only
```

### 5.3 Cards

#### Standard Card
```
Background: Card color (white)
Border: 1px solid border color
Border Radius: 10px
Shadow: shadow-card
```

#### Interactive Card (Hover)
```
Transition: all 200ms ease-out
Hover: shadow-md, translateY(-2px)
```

#### Stat Card Variants

**Default:**
```
Background: Card
Icon Container: bg-primary/10, text-primary
```

**Primary (Purple Gradient):**
```
Background: linear-gradient(135deg, hsl(285 45% 30%), hsl(285 50% 38%))
Text: White
Icon Container: bg-white/20
```

**Accent (Orange Gradient):**
```
Background: linear-gradient(135deg, hsl(32 95% 48%), hsl(32 95% 55%))
Text: White
Icon Container: bg-white/20
```

**Warning:**
```
Background: hsl(38 95% 50% / 0.08)
Border: hsl(38 95% 50% / 0.20)
Icon Container: bg-warning/20
```

**Success:**
```
Background: hsl(145 65% 35% / 0.08)
Border: hsl(145 65% 35% / 0.20)
```

**Danger:**
```
Background: hsl(0 72% 51% / 0.08)
Border: hsl(0 72% 51% / 0.20)
```

### 5.4 Navigation

#### Sidebar
```
Width: 256px (w-64)
Background: hsl(285 45% 18%) - Deep purple
Height: 100vh
Layout: Flex column
```

#### Sidebar Logo Area
```
Height: 64px (h-16)
Padding: px-5
Border Bottom: 1px solid hsl(285 35% 25%)
Logo Icon: 40px × 40px, rounded-xl, orange gradient
```

#### Sidebar Nav Item
```
Padding: px-3 py-2.5
Border Radius: 8px
Font: 14px, Medium
Text: sidebar-foreground at 80% opacity
Icon Size: 18px (h-4.5 w-4.5)
Gap: 12px

Hover State:
- Background: hsl(285 40% 25%)
- Text: sidebar-accent-foreground

Active State:
- Background: Orange (sidebar-primary)
- Text: White
- Shadow: 0 2px 8px orange at 30% opacity
- Chevron icon appears
```

#### Sidebar Section Headers
```
Font: 10px, Bold, Uppercase
Letter Spacing: 0.1em (tracking-widest)
Color: sidebar-foreground at 40% opacity
Padding: px-3 mb-2
```

### 5.5 Tables

#### Data Table
```
Container: rounded-xl border bg-card overflow-hidden
```

#### Table Header Row
```
Background: muted at 30% opacity
Font: 14px, Semibold
```

#### Table Body Row
```
Alternating: bg-background / bg-muted at 20% opacity
Hover: bg-muted at 50% opacity
Transition: 150ms
```

#### Table Cells
```
Padding: Built into Tailwind table classes
Vertical Align: Middle
```

### 5.6 Modals/Dialogs

#### Dialog Container
```
Max Width: 512px (max-w-lg) typical
Background: Card
Border Radius: 12px
Shadow: shadow-lg
Overlay: Black at 80% opacity
```

#### Dialog Header
```
Title: 18px, Semibold
Description: 14px, muted-foreground
```

#### Dialog Footer
```
Padding Top: 16px
Button arrangement: Right-aligned, gap-2
```

### 5.7 Badges

#### Status Badge (Pill)
```
Display: Inline-flex with gap-1.5
Padding: px-2.5 py-1
Border Radius: 9999px (full)
Font: 12px, Semibold, Uppercase
Letter Spacing: 0.05em
Border: 1px solid at 25% opacity
Background: Status color at 12% opacity
Text: Status color (darkened for readability)
Icon: 12px (h-3 w-3)
```

#### Outline Badge
```
Border: 1px solid border
Background: Transparent
Text: Foreground or muted-foreground
```

### 5.8 Alerts/Info Boxes

#### Warning Info Box
```
Background: hsl(38 95% 50% / 0.08)
Border: 1px solid hsl(38 95% 50% / 0.25)
Border Radius: 12px
Padding: 16px
Icon Container: 48px × 48px, rounded-xl, bg-warning/20
```

#### Success Info Box
```
Background: hsl(145 65% 35% / 0.08)
Border: hsl(145 65% 35% / 0.25)
```

#### Danger Info Box
```
Background: hsl(0 72% 51% / 0.08)
Border: hsl(0 72% 51% / 0.25)
```

### 5.9 Tabs

```
TabsList: Grid with columns, rounded-lg, bg-muted, p-1
TabsTrigger: Font-medium, rounded-md
Active: bg-background, shadow-sm
```

### 5.10 Progress Bar

```
Track: h-1.5 or h-2, bg-muted, rounded-full
Fill: Status color, rounded-full
Transition: width 500ms
```

### 5.11 Avatar/User Initial

```
Size: 40px × 40px (default), 48px × 48px (cards)
Border Radius: rounded-full or rounded-xl
Background: Primary gradient or muted
Text: White or accent color, Bold
Font Size: 16-18px
```

### 5.12 Skeleton Loader

```
Background: Muted color
Animation: Pulse (opacity 1 → 0.7 → 1)
Border Radius: 8px
```

### 5.13 Toast/Notification

```
Background: Card
Border: 1px solid border
Shadow: shadow-lg
Border Radius: 8px
Destructive: Uses destructive colors
```

---

## 6. Iconography & Imagery

### 6.1 Icon Library

**Library:** Lucide React

### 6.2 Icon Style
- **Stroke Weight:** 2px (default)
- **Style:** Outline/Stroke (not filled)
- **Corners:** Rounded

### 6.3 Icon Sizes

| Context | Size | Tailwind Class |
|---------|------|----------------|
| Inline with text | 14px | `h-3.5 w-3.5` |
| Button icon | 16px | `h-4 w-4` |
| Nav item icon | 18px | `h-4.5 w-4.5` |
| Card icon | 24px | `h-6 w-6` |
| Feature icon | 20px | `h-5 w-5` |
| Large display | 28px | `h-7 w-7` |

### 6.4 Icon Color Usage

| Context | Color |
|---------|-------|
| Navigation (default) | `sidebar-foreground` at 80% |
| Navigation (active) | White |
| Card icons | `primary` or status color |
| Inline icons | `muted-foreground` |
| Warning icons | `warning` color |
| Success icons | `success` color |
| Error icons | `destructive` color |

### 6.5 Common Icons by Feature

| Feature | Icon |
|---------|------|
| Dashboard | `LayoutDashboard` |
| Tickets | `Ticket` |
| Review Queue | `AlertTriangle` |
| Field Executives | `Truck` |
| Emails | `Mail` |
| SLA Monitor | `Clock` |
| Audit Logs | `FileText` |
| Analytics | `BarChart3` |
| Users | `Users` |
| Settings | `Settings` |
| Logo | `Shield` |
| Search | `Search` |
| Location | `MapPin` |
| Phone | `Phone` |
| Close | `X` |
| Arrow Right | `ArrowRight`, `ChevronRight` |
| Add | `Plus` |
| External Link | `ExternalLink` |
| Loading | `Loader2` (with spin animation) |

### 6.6 Logo Treatment

```
Container: 40-48px square, rounded-xl
Background: Orange gradient
Icon: Shield, white, centered
Glow Effect: filter: drop-shadow(0 0 10px hsl(32 95% 52% / 0.4))
```

---

## 7. Interaction & Motion

### 7.1 Animation Durations

| Type | Duration | Easing |
|------|----------|--------|
| Micro-interaction | 150ms | ease-out |
| Standard transition | 200ms | ease-out |
| Page/content fade | 300ms | ease-out |
| Slide animations | 350ms | ease-out |
| Accordion | 200ms | ease-out |

### 7.2 Defined Keyframes

```css
/* Fade In */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Slide Up */
@keyframes slideUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Slide In Left */
@keyframes slideInLeft {
  from { opacity: 0; transform: translateX(-16px); }
  to { opacity: 1; transform: translateX(0); }
}

/* Pulse Subtle (SLA indicators) */
@keyframes pulse-subtle {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
```

### 7.3 Button Press Behavior

```
Hover: translateY(-1px) + enhanced shadow
Active: translateY(0)
Transition: all 200ms ease-out
Primary buttons: Glow effect on hover
```

### 7.4 Card Hover Behavior

```
Hover: shadow-md + translateY(-2px)
Transition: all 200ms ease-out
Cursor: pointer (if clickable)
```

### 7.5 Loading States

- **Spinner:** 8×8 circle, 2px border, spin animation
- **Skeleton:** Pulse animation on muted background
- **Button loading:** Inline spinner with "Loading..." text

### 7.6 Page Transitions

- Content areas use `animate-fade-in` class
- Cards use `animate-slide-up` for entrance

### 7.7 SLA Indicators

```
Safe: Static green dot with subtle glow
Warning: Pulsing amber dot
Breached: Pulsing red dot
```

---

## 8. Accessibility & Mobile UX

### 8.1 Touch Target Sizes

| Element | Minimum Size |
|---------|--------------|
| Buttons | 40px height (44px on forms) |
| Nav items | 40px height |
| Icon buttons | 40px × 40px |
| Table row actions | 32px × 32px |

### 8.2 Color Contrast

- Primary text on white: **AAA compliant** (foreground `270 25% 15%`)
- White text on primary purple: **AA compliant**
- White text on orange accent: **AA compliant**
- Muted text: Minimum **4.5:1** ratio maintained

### 8.3 Focus States

```
Focus Ring: 2px solid ring color
Ring Offset: 2px
Ring Color: hsl(285 45% 45%)
```

All interactive elements have visible focus indicators for keyboard navigation.

### 8.4 Mobile Considerations

- **Font Size:** Base 14px, inputs scale to 16px on mobile to prevent zoom
- **Scrolling:** Custom thin scrollbars on webkit browsers
- **Sidebar:** Fixed 256px width (would need mobile drawer for true mobile)
- **Tables:** Horizontal scroll on overflow
- **Touch Zones:** Bottom-aligned CTAs where appropriate

### 8.5 Readability

- **Line Height:** Body text uses 1.5 line-height
- **Paragraph Width:** Max-width constraints on text blocks
- **Contrast:** High contrast mode supported via CSS variables
- **Monospace:** Used for data values (ticket numbers, phone numbers, vehicle plates)

---

## 9. Reusability & Consistency Guidelines

### 9.1 Do's ✅

1. **Always use design tokens** — Never hardcode colors; reference CSS variables
2. **Use semantic color names** — `bg-primary`, not `bg-purple-700`
3. **Maintain spacing rhythm** — Stick to 4px/8px increments
4. **Use provided component variants** — Don't create one-off button styles
5. **Follow the status color system** — Each status has defined colors
6. **Use Inter for UI, JetBrains Mono for data** — Consistent typography
7. **Add hover states** — All interactive elements need feedback
8. **Include loading states** — Skeleton or spinner for async content
9. **Maintain icon consistency** — Use Lucide icons only
10. **Apply focus states** — Accessibility is mandatory

### 9.2 Don'ts ❌

1. **Don't use raw hex colors** — Always use HSL via CSS variables
2. **Don't mix icon libraries** — Lucide only
3. **Don't skip hover/focus states** — Every button needs them
4. **Don't use gradients for non-CTA elements** — Gradients are for emphasis
5. **Don't use shadows inconsistently** — Use defined shadow tokens
6. **Don't break the 8px grid** — Maintain spacing consistency
7. **Don't create custom font sizes** — Use the defined type scale
8. **Don't use light font weights** — Minimum 400, prefer 500+ for UI
9. **Don't ignore dark mode variables** — Design system supports dark mode
10. **Don't modify component base styles** — Extend via className prop

### 9.3 Component Extension Pattern

When extending components:
```tsx
// ✅ Correct - Use className prop
<Button className="custom-class" variant="default">Click</Button>

// ❌ Wrong - Don't modify button.tsx directly
```

### 9.4 CSS Variable Usage

```tsx
// ✅ Correct - Reference token
<div className="bg-primary text-primary-foreground">

// ❌ Wrong - Hardcoded color
<div className="bg-purple-700 text-white">
```

### 9.5 Status Implementation

Always use the `StatusBadge` component for ticket status:
```tsx
<StatusBadge status={ticket.status} showIcon={true} />
```

### 9.6 Responsive Breakpoints

| Breakpoint | Width | Usage |
|------------|-------|-------|
| `sm` | 640px | Stack to row |
| `md` | 768px | Tablet layouts |
| `lg` | 1024px | Desktop layouts |
| `xl` | 1280px | Wide desktop |
| `2xl` | 1400px | Container max-width |

---

## Appendix A: CSS Class Reference

### Utility Classes

| Class | Purpose |
|-------|---------|
| `.nav-item` | Sidebar navigation styling |
| `.status-badge` | Status badge base |
| `.status-{name}` | Status-specific colors |
| `.confidence-{level}` | Confidence score colors |
| `.card-interactive` | Hover effect for cards |
| `.stat-card-primary` | Purple gradient stat card |
| `.stat-card-accent` | Orange gradient stat card |
| `.btn-primary` | Orange gradient button |
| `.btn-purple` | Purple gradient button |
| `.info-box` | Alert box base |
| `.info-box-warning` | Warning alert |
| `.info-box-success` | Success alert |
| `.info-box-danger` | Danger alert |
| `.sla-indicator` | SLA dot indicator |
| `.sla-safe` / `.sla-warning` / `.sla-breached` | SLA states |
| `.logo-glow` | Orange glow for logo |
| `.text-gradient-primary` | Purple gradient text |
| `.text-gradient-accent` | Orange gradient text |
| `.glass` / `.glass-dark` | Glassmorphism effects |
| `.scrollbar-thin` | Custom scrollbar |
| `.data-table-row` | Table row hover |

---

## Appendix B: File Structure

```
src/
├── index.css              # Design tokens & utility classes
├── components/
│   ├── ui/                # Base UI components (shadcn)
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   ├── badge.tsx
│   │   └── ...
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   └── DashboardLayout.tsx
│   ├── dashboard/
│   │   └── StatCard.tsx
│   └── tickets/
│       ├── StatusBadge.tsx
│       ├── ConfidenceScore.tsx
│       └── TicketsTable.tsx
└── tailwind.config.ts     # Tailwind theme extension
```

---

*This design documentation represents the existing Sahaya platform as built. Any future development should strictly adhere to these specifications to maintain visual consistency across all platforms.*
