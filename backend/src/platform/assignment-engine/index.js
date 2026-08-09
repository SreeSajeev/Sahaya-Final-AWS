/**
 * Assignment Engine — rule evaluation (METADATA). No FE-only assumptions.
 */

export const ASSIGNMENT_STRATEGIES = Object.freeze([
  "manual",
  "individual",
  "team",
  "department",
  "queue",
  "round_robin",
  "least_loaded",
  "skill_based",
  "location_based",
  "priority_based",
  "ai_recommendation",
]);

export function validateAssignmentRules(rules) {
  if (!rules || typeof rules !== "object") return { ok: false, error: "rules required" };
  const list = Array.isArray(rules.rules) ? rules.rules : [];
  for (const r of list) {
    if (!r.strategy) return { ok: false, error: "rule.strategy required" };
    if (!ASSIGNMENT_STRATEGIES.includes(r.strategy) && r.strategy !== "fixed") {
      return { ok: false, error: `unknown strategy: ${r.strategy}` };
    }
  }
  return { ok: true, rules: list };
}

function ruleMatches(rule, ticketData) {
  const when = rule.when || rule.condition;
  if (!when) return true;
  if (when.field != null && Object.prototype.hasOwnProperty.call(when, "equals")) {
    return String(ticketData?.[when.field] ?? "") === String(when.equals ?? "");
  }
  return true;
}

/**
 * Pick assignee from rules + candidate pool.
 * @param {object} rulesDoc
 * @param {object} ticketData
 * @param {{ id: string, skills?: string[], region?: string, load?: number }[]} candidates
 */
export function resolveAssignee(rulesDoc, ticketData, candidates = []) {
  const v = validateAssignmentRules(rulesDoc);
  if (!v.ok) return { ok: false, error: v.error };

  const sorted = [...v.rules].sort((a, b) => Number(a.priority ?? 100) - Number(b.priority ?? 100));
  for (const rule of sorted) {
    if (!ruleMatches(rule, ticketData)) continue;

    if (rule.strategy === "fixed" || rule.strategy === "individual") {
      return { ok: true, assigneeId: rule.assigneeId || rule.config?.assigneeId, strategy: rule.strategy, rule };
    }
    if (rule.strategy === "round_robin") {
      if (!candidates.length) return { ok: true, assigneeId: null, strategy: "round_robin", rule };
      const idx = Number(rule.config?.cursor || 0) % candidates.length;
      return { ok: true, assigneeId: candidates[idx].id, strategy: "round_robin", rule, nextCursor: idx + 1 };
    }
    if (rule.strategy === "least_loaded") {
      const pool = [...candidates].sort((a, b) => Number(a.load || 0) - Number(b.load || 0));
      return { ok: true, assigneeId: pool[0]?.id ?? null, strategy: "least_loaded", rule };
    }
    if (rule.strategy === "skill_based") {
      const need = rule.config?.skill;
      const hit = candidates.find((c) => (c.skills || []).includes(need));
      if (hit) return { ok: true, assigneeId: hit.id, strategy: "skill_based", rule };
    }
    if (rule.strategy === "location_based") {
      const region = ticketData?.[rule.config?.regionField || "region"];
      const hit = candidates.find((c) => c.region && String(c.region) === String(region));
      if (hit) return { ok: true, assigneeId: hit.id, strategy: "location_based", rule };
    }
  }
  return { ok: true, assigneeId: null, strategy: "none" };
}
