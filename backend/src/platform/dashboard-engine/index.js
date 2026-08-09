/**
 * Dashboard Engine — widget layout validation + KPI binding.
 */

export const WIDGET_TYPES = Object.freeze([
  "kpi",
  "chart",
  "table",
  "map",
  "activity",
  "calendar",
  "kanban",
  "workload",
  "sla",
  "ai_insights",
  "html",
  "report",
]);

export function validateDashboardLayout(layout) {
  if (!layout || typeof layout !== "object") return { ok: false, error: "layout required" };
  const widgets = Array.isArray(layout.widgets) ? layout.widgets : [];
  for (const w of widgets) {
    if (!WIDGET_TYPES.includes(String(w.type || ""))) {
      return { ok: false, error: `unknown widget type: ${w.type}` };
    }
  }
  return { ok: true, widgets };
}

export function bindDashboard(layout, kpi) {
  const v = validateDashboardLayout(layout);
  if (!v.ok) return v;
  return {
    ok: true,
    widgets: v.widgets.map((w) => ({
      ...w,
      data:
        w.type === "kpi"
          ? { total: kpi?.total ?? 0, byStatus: kpi?.byStatus ?? {} }
          : w.type === "chart"
            ? { series: kpi?.byStatus ?? {} }
            : null,
    })),
  };
}
