/**
 * Operational typography token class strings.
 *
 * Use these constants in shared primitives so page migrations stay consistent.
 * Allowed font weights: font-normal, font-medium, font-semibold only.
 */
export const typography = {
  /** Page-level h1 — 24px semibold */
  pageTitle: "text-2xl font-semibold tracking-tight",
  /** KPI / metric values — 24px semibold (below page-title in hierarchy) */
  kpiValue: "text-2xl font-semibold tracking-tight",
  /** Large KPI for dashboard hero sections — 30px semibold */
  kpiValueLg: "text-3xl font-semibold tracking-tight",
  /** Card and section headings — 18px semibold */
  sectionTitle: "text-lg font-semibold",
  /** Default body copy — 14px regular */
  body: "text-sm font-normal",
  /** Captions, labels, table headers — 12px medium muted */
  meta: "text-xs font-medium text-muted-foreground",
} as const;
