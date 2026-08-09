/**
 * Report Engine — build tabular projections from metadata ticket data.
 */

export function validateReportDefinition(def) {
  if (!def || typeof def !== "object") return { ok: false, error: "definition required" };
  if (!Array.isArray(def.columns) || def.columns.length === 0) {
    return { ok: false, error: "columns required" };
  }
  return { ok: true };
}

export function projectTickets(def, tickets) {
  const v = validateReportDefinition(def);
  if (!v.ok) return { ok: false, error: v.error, rows: [] };

  const rows = [];
  for (const t of tickets || []) {
    const data = t.data_json || t.data || {};
    /** @type {Record<string, unknown>} */
    const row = {
      ticket_number: t.ticket_number,
      status: t.status_key || t.status,
      created_at: t.created_at,
    };
    for (const col of def.columns) {
      const key = col.field_key || col.key;
      if (!key) continue;
      if (key.startsWith("sys.")) {
        row[col.label || key] = row[key.slice(4)] ?? t[key.slice(4)];
      } else {
        row[col.label || key] = data[key];
      }
    }
    // Filters
    let include = true;
    for (const f of def.filters || []) {
      if (f.field && Object.prototype.hasOwnProperty.call(f, "equals")) {
        const val = String(data[f.field] ?? t[f.field] ?? "");
        if (val !== String(f.equals)) include = false;
      }
    }
    if (include) rows.push(row);
  }

  if (def.sort?.field) {
    const dir = def.sort.dir === "desc" ? -1 : 1;
    const field = def.sort.field;
    rows.sort((a, b) => (String(a[field] ?? "") > String(b[field] ?? "") ? dir : -dir));
  }

  return { ok: true, rows };
}

export function aggregateKpi(def, tickets) {
  const statusField = "status_key";
  /** @type {Record<string, number>} */
  const byStatus = {};
  for (const t of tickets || []) {
    const st = String(t[statusField] || t.status || "UNKNOWN");
    byStatus[st] = (byStatus[st] || 0) + 1;
  }
  return {
    total: (tickets || []).length,
    byStatus,
    widgets: Array.isArray(def?.widgets) ? def.widgets : [],
  };
}
