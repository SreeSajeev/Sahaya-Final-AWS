/**
 * Automation Engine — Zapier-like trigger → condition → action (METADATA).
 * Loop / recursion / budget / cycle protection is mandatory.
 */

export const AUTOMATION_DEFAULTS = Object.freeze({
  maxDepth: 5,
  maxActionsPerRun: 50,
  maxRetries: 3,
  timeoutMs: 5_000,
  simulation: false,
});

export function validateAutomationDefinition(def) {
  if (!def || typeof def !== "object") return { ok: false, error: "definition required" };
  if (!def.trigger?.type) return { ok: false, error: "trigger.type required" };
  if (!Array.isArray(def.actions) || def.actions.length === 0) {
    return { ok: false, error: "actions required" };
  }
  if (def.actions.length > AUTOMATION_DEFAULTS.maxActionsPerRun) {
    return { ok: false, error: "too many actions", code: "AUTOMATION_TOO_MANY_ACTIONS" };
  }
  return { ok: true };
}

function matchCondition(condition, context) {
  if (!condition) return true;
  if (Array.isArray(condition.and)) return condition.and.every((c) => matchCondition(c, context));
  if (Array.isArray(condition.or)) return condition.or.some((c) => matchCondition(c, context));
  if (condition.field != null) {
    const actual = context.data?.[condition.field] ?? context[condition.field];
    if (Object.prototype.hasOwnProperty.call(condition, "equals")) {
      return String(actual ?? "") === String(condition.equals ?? "");
    }
  }
  if (condition.event != null) {
    return String(context.event || "") === String(condition.event);
  }
  return true;
}

function fingerprint(def, context, depth) {
  const id = def?.id || def?.key || def?.trigger?.type || "anon";
  const ticket = context?.ticketId || context?.data?.id || "";
  const event = context?.event || "";
  return `${id}|${ticket}|${event}|d${depth}`;
}

/**
 * Create an execution budget tracker for nested automation chains.
 */
export function createExecutionBudget(opts = {}) {
  const maxDepth = Number(opts.maxDepth ?? AUTOMATION_DEFAULTS.maxDepth);
  const maxActions = Number(opts.maxActionsPerRun ?? AUTOMATION_DEFAULTS.maxActionsPerRun);
  const maxRetries = Number(opts.maxRetries ?? AUTOMATION_DEFAULTS.maxRetries);
  const timeoutMs = Number(opts.timeoutMs ?? AUTOMATION_DEFAULTS.timeoutMs);
  const startedAt = Date.now();
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {string[]} */
  const stack = [];
  /** @type {object[]} */
  const audit = [];
  /** @type {object[]} */
  const deadLetter = [];
  let actionsUsed = 0;
  let cancelled = false;

  return {
    maxDepth,
    maxRetries,
    timeoutMs,
    isCancelled: () => cancelled,
    cancel: (reason = "cancelled") => {
      cancelled = true;
      audit.push({ type: "cancel", reason, at: Date.now() });
    },
    checkTimeout() {
      if (Date.now() - startedAt > timeoutMs) {
        const err = { ok: false, error: "automation timeout", code: "AUTOMATION_TIMEOUT" };
        deadLetter.push(err);
        return err;
      }
      return null;
    },
    enter(def, context, depth) {
      if (cancelled) return { ok: false, error: "cancelled", code: "AUTOMATION_CANCELLED" };
      const timed = this.checkTimeout();
      if (timed) return timed;
      if (depth > maxDepth) {
        const err = { ok: false, error: "max recursion depth exceeded", code: "AUTOMATION_MAX_DEPTH" };
        deadLetter.push({ ...err, fingerprint: fingerprint(def, context, depth) });
        return err;
      }
      const fp = fingerprint(def, context, depth);
      if (seen.has(fp) || stack.includes(fp)) {
        const err = { ok: false, error: "automation loop / cycle detected", code: "AUTOMATION_LOOP" };
        deadLetter.push({ ...err, fingerprint: fp });
        return err;
      }
      // Also detect same automation re-firing same ticket+event at any depth
      const cycleKey = fingerprint(def, context, 0).replace(/\|d0$/, "");
      if (stack.some((s) => s.startsWith(cycleKey))) {
        const err = { ok: false, error: "automation cycle detected", code: "AUTOMATION_CYCLE" };
        deadLetter.push({ ...err, fingerprint: fp });
        return err;
      }
      seen.add(fp);
      stack.push(fp);
      audit.push({ type: "enter", fingerprint: fp, depth, at: Date.now() });
      return { ok: true, fingerprint: fp };
    },
    leave(fp) {
      const idx = stack.lastIndexOf(fp);
      if (idx >= 0) stack.splice(idx, 1);
      audit.push({ type: "leave", fingerprint: fp, at: Date.now() });
    },
    consumeActions(n) {
      actionsUsed += n;
      if (actionsUsed > maxActions) {
        const err = { ok: false, error: "execution budget exceeded", code: "AUTOMATION_BUDGET" };
        deadLetter.push(err);
        return err;
      }
      return { ok: true, actionsUsed };
    },
    recordRetry(info) {
      audit.push({ type: "retry", ...info, at: Date.now() });
    },
    deadLetterPush(item) {
      deadLetter.push(item);
    },
    snapshot() {
      return {
        actionsUsed,
        depth: stack.length,
        audit: [...audit],
        deadLetter: [...deadLetter],
        cancelled,
        elapsedMs: Date.now() - startedAt,
      };
    },
  };
}

/**
 * Run automation in simulation mode (no side effects beyond returned plan).
 * Pass `budget` / `depth` when chaining nested automations.
 */
export function simulateAutomation(def, context, opts = {}) {
  const v = validateAutomationDefinition(def);
  if (!v.ok) return { ok: false, error: v.error, code: v.code, plan: [] };

  const budget = opts.budget || createExecutionBudget(opts);
  const depth = Number(opts.depth ?? 0);
  const entered = budget.enter(def, context, depth);
  if (!entered.ok) return { ...entered, plan: [], budget: budget.snapshot() };

  try {
    if (def.trigger.type !== context.event && def.trigger.type !== "*") {
      return { ok: true, matched: false, plan: [], budget: budget.snapshot() };
    }
    if (!matchCondition(def.condition || def.conditions, context)) {
      return { ok: true, matched: false, plan: [], budget: budget.snapshot() };
    }

    const plan = [];
    for (const action of def.actions) {
      const type = String(action.type || "");
      // Nested automation trigger (simulation only expands one level unless recurse)
      if (type === "run_automation" && opts.recurse) {
        const nested = simulateAutomation(action.config?.definition || action.definition, context, {
          budget,
          depth: depth + 1,
          recurse: true,
        });
        if (!nested.ok) {
          budget.deadLetterPush(nested);
          return { ...nested, plan, budget: budget.snapshot() };
        }
        plan.push(...(nested.plan || []));
        continue;
      }
      plan.push({
        type,
        config: action.config || {},
        simulated: true,
      });
    }

    const consumed = budget.consumeActions(plan.length || 1);
    if (!consumed.ok) return { ...consumed, plan: [], budget: budget.snapshot() };

    return {
      ok: true,
      matched: true,
      plan,
      budget: budget.snapshot(),
      simulation: opts.simulation !== false,
    };
  } finally {
    budget.leave(entered.fingerprint);
  }
}

/**
 * Apply field-update actions to a data clone (safe pure function).
 */
export function applyFieldUpdateActions(plan, data) {
  const next = { ...(data || {}) };
  for (const step of plan || []) {
    if (step.type !== "field_update") continue;
    const field = step.config?.field;
    if (!field) continue;
    next[field] = step.config.value;
  }
  return next;
}

/**
 * Execute with retries; failures go to dead-letter snapshot.
 */
export function runWithRetries(fn, { maxRetries = AUTOMATION_DEFAULTS.maxRetries, budget } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = fn(attempt);
      if (result?.ok === false && result?.retryable) {
        lastErr = result;
        budget?.recordRetry({ attempt, error: result.error });
        continue;
      }
      return result;
    } catch (err) {
      lastErr = { ok: false, error: err?.message || String(err), code: "AUTOMATION_THROW" };
      budget?.recordRetry({ attempt, error: lastErr.error });
    }
  }
  budget?.deadLetterPush(lastErr);
  return lastErr || { ok: false, error: "retries exhausted", code: "AUTOMATION_RETRIES" };
}
