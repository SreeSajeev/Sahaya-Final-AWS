/**
 * Workflow Engine — state machine over metadata definitions only.
 */

/**
 * @param {object} definition
 * @returns {{ ok: true, states: object[], transitions: object[], initial: string } | { ok: false, error: string }}
 */
export function validateWorkflowDefinition(definition) {
  if (!definition || typeof definition !== "object") {
    return { ok: false, error: "definition must be an object" };
  }
  const states = Array.isArray(definition.states) ? definition.states : [];
  const transitions = Array.isArray(definition.transitions) ? definition.transitions : [];
  if (states.length === 0) return { ok: false, error: "at least one state required" };

  const keys = new Set();
  for (const s of states) {
    const key = String(s.key || "").trim();
    if (!key) return { ok: false, error: "state.key required" };
    if (keys.has(key)) return { ok: false, error: `duplicate state: ${key}` };
    keys.add(key);
  }
  const initial = String(definition.initialState || states[0].key).trim();
  if (!keys.has(initial)) return { ok: false, error: `initialState unknown: ${initial}` };

  for (const t of transitions) {
    const from = String(t.from || t.from_state_key || "").trim();
    const to = String(t.to || t.to_state_key || "").trim();
    if (!keys.has(from) || !keys.has(to)) {
      return { ok: false, error: `transition references unknown state: ${from}→${to}` };
    }
  }
  return { ok: true, states, transitions, initial };
}

/**
 * Detect cycles in the transition graph (DFS).
 */
export function detectWorkflowCycles(definition) {
  const v = validateWorkflowDefinition(definition);
  if (!v.ok) return { ok: false, error: v.error, cycles: [] };
  /** @type {Map<string, string[]>} */
  const adj = new Map();
  for (const s of v.states) adj.set(String(s.key), []);
  for (const t of v.transitions) {
    const from = String(t.from || t.from_state_key);
    const to = String(t.to || t.to_state_key);
    adj.get(from)?.push(to);
  }
  const cycles = [];
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  function dfs(node) {
    visiting.add(node);
    stack.push(node);
    for (const next of adj.get(node) || []) {
      if (visiting.has(next)) {
        const idx = stack.indexOf(next);
        cycles.push([...stack.slice(idx), next]);
      } else if (!visited.has(next)) {
        dfs(next);
      }
    }
    stack.pop();
    visiting.delete(node);
    visited.add(node);
  }
  for (const key of adj.keys()) {
    if (!visited.has(key)) dfs(key);
  }
  return { ok: true, cycles, hasCycle: cycles.length > 0 };
}

/**
 * Simple deadlock heuristic: states with inbound but no outbound (excluding terminals marked closed/cancelled).
 */
export function detectWorkflowDeadlocks(definition) {
  const v = validateWorkflowDefinition(definition);
  if (!v.ok) return { ok: false, error: v.error, deadlocks: [] };
  const terminals = new Set(
    v.states
      .filter((s) => s.terminal === true || ["CLOSED", "CANCELLED", "RESOLVED"].includes(String(s.key).toUpperCase()))
      .map((s) => String(s.key))
  );
  const outbound = new Set(v.transitions.map((t) => String(t.from || t.from_state_key)));
  const inbound = new Set(v.transitions.map((t) => String(t.to || t.to_state_key)));
  const deadlocks = [];
  for (const s of v.states) {
    const key = String(s.key);
    if (terminals.has(key)) continue;
    if (inbound.has(key) && !outbound.has(key)) deadlocks.push(key);
  }
  return { ok: true, deadlocks };
}

/**
 * List allowed transitions from current state for a role.
 */
export function listAllowedTransitions(definition, currentState, role) {
  const v = validateWorkflowDefinition(definition);
  if (!v.ok) return [];
  const roleKey = String(role || "").toUpperCase();
  return v.transitions.filter((t) => {
    const from = String(t.from || t.from_state_key || "");
    if (from !== currentState) return false;
    const roles = Array.isArray(t.roles) ? t.roles : t.roles_json || [];
    if (!roles.length) return true;
    return roles.map((r) => String(r).toUpperCase()).includes(roleKey);
  });
}

/**
 * Attempt a transition. Returns next state or error.
 * Requirements: { requireComment, requireAttachment, requireFields: string[] }
 */
export function applyTransition(definition, { currentState, transitionKey, role, context = {} }) {
  const v = validateWorkflowDefinition(definition);
  if (!v.ok) return { ok: false, error: v.error };

  const allowed = listAllowedTransitions(definition, currentState, role);
  const transition =
    allowed.find((t) => String(t.key || t.label || "") === String(transitionKey)) ||
    allowed.find((t) => String(t.to || t.to_state_key) === String(transitionKey));

  if (!transition) {
    return { ok: false, error: "transition not allowed", code: "TRANSITION_DENIED" };
  }

  const req = transition.requirements || transition.requirements_json || {};
  if (req.requireComment && !String(context.comment || "").trim()) {
    return { ok: false, error: "comment required", code: "REQUIRE_COMMENT" };
  }
  if (req.requireAttachment && !(context.attachmentCount > 0)) {
    return { ok: false, error: "attachment required", code: "REQUIRE_ATTACHMENT" };
  }
  const needFields = Array.isArray(req.requireFields) ? req.requireFields : [];
  for (const f of needFields) {
    const val = context.data?.[f];
    if (val == null || String(val).trim() === "") {
      return { ok: false, error: `field required: ${f}`, code: "REQUIRE_FIELD" };
    }
  }

  // Simple condition on ticket data
  if (transition.conditions || transition.conditions_json) {
    const cond = transition.conditions || transition.conditions_json;
    if (cond.field != null) {
      const actual = context.data?.[cond.field];
      if (Object.prototype.hasOwnProperty.call(cond, "equals") && String(actual) !== String(cond.equals)) {
        return { ok: false, error: "condition failed", code: "CONDITION_FAILED" };
      }
    }
  }

  const to = String(transition.to || transition.to_state_key);
  return {
    ok: true,
    from: currentState,
    to,
    transition,
    actions: transition.actions || transition.actions_json || [],
  };
}
