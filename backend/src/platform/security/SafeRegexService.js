/**
 * SafeRegexService — single regex gate for entire Metadata Platform.
 * Parser, form validation, and any future regex MUST use this module.
 */
export const MAX_REGEX_PATTERN_LENGTH = 200;
export const MAX_REGEX_FLAGS_LENGTH = 5;
export const MAX_INPUT_CHARS_FOR_REGEX = 50_000;
export const REGEX_EXEC_BUDGET_MS = 20;

const CATASTROPHIC_PATTERNS = [
  /(\([^)]*[+*][^)]*\)[+*])/,
  /(\([^)]*[+*][^)]*\)\{)/,
  /(\\[+*][+*])/,
  /([+*][+*])/,
  /(\.\*){3,}/,
  /(\.\+){3,}/,
  /(\([^)]*\|[^)]*\)[+*])/, // (a|a)+ style
  /(\(\?[^)]*\))/, // reject lookaround groups for safety
];

/**
 * @param {string} pattern
 * @param {string} [flags]
 */
export function assertSafeRegex(pattern, flags = "") {
  const p = String(pattern ?? "");
  const f = String(flags ?? "");

  if (!p) return { ok: false, error: "regex pattern required", code: "REGEX_EMPTY" };
  if (p.length > MAX_REGEX_PATTERN_LENGTH) {
    return { ok: false, error: `regex exceeds max length ${MAX_REGEX_PATTERN_LENGTH}`, code: "REGEX_TOO_LONG" };
  }
  if (f.length > MAX_REGEX_FLAGS_LENGTH) {
    return { ok: false, error: "regex flags too long", code: "REGEX_FLAGS" };
  }
  if (/[^gimsuy]/.test(f.replace(/[gimsuy]/g, ""))) {
    return { ok: false, error: "unsupported regex flags", code: "REGEX_FLAGS" };
  }

  for (const re of CATASTROPHIC_PATTERNS) {
    if (re.test(p)) {
      return { ok: false, error: "regex rejected as potentially catastrophic (ReDoS)", code: "REGEX_UNSAFE" };
    }
  }

  const groupCount = (p.match(/\(/g) || []).length;
  const quantCount = (p.match(/[+*{]/g) || []).length;
  if (groupCount > 8 || quantCount > 12) {
    return { ok: false, error: "regex too complex", code: "REGEX_COMPLEX" };
  }

  try {
    // eslint-disable-next-line no-new
    new RegExp(p, f || undefined);
  } catch {
    return { ok: false, error: "regex failed to compile", code: "REGEX_INVALID" };
  }

  return { ok: true };
}

/**
 * Sync match after static gate. Input truncated. Budget enforced via wall-clock abort heuristic:
 * after gate, patterns are non-catastrophic; still truncate input aggressively for field validation.
 * @returns {{ ok: true, match: RegExpMatchArray | null, elapsedMs: number } | { ok: false, error: string, code: string, elapsedMs?: number }}
 */
export function safeRegexMatch(pattern, flags, text, opts = {}) {
  const started = Date.now();
  const gate = assertSafeRegex(pattern, flags);
  if (!gate.ok) return { ...gate, elapsedMs: Date.now() - started };

  const maxInput = Number(opts.maxInput ?? MAX_INPUT_CHARS_FOR_REGEX);
  const budget = Number(opts.budgetMs ?? REGEX_EXEC_BUDGET_MS);
  const input = String(text ?? "").slice(0, maxInput);

  try {
    const re = new RegExp(String(pattern), String(flags || ""));
    const match = input.match(re);
    const elapsedMs = Date.now() - started;
    if (elapsedMs > budget) {
      return { ok: false, error: "regex execution budget exceeded", code: "REGEX_TIMEOUT", elapsedMs };
    }
    return { ok: true, match, elapsedMs };
  } catch {
    return { ok: false, error: "regex execution failed", code: "REGEX_EXEC", elapsedMs: Date.now() - started };
  }
}

/** Alias used by form engine and docs. */
export const SafeRegexService = {
  assertSafe: assertSafeRegex,
  match: safeRegexMatch,
  MAX_PATTERN_LENGTH: MAX_REGEX_PATTERN_LENGTH,
  EXEC_BUDGET_MS: REGEX_EXEC_BUDGET_MS,
};

export default SafeRegexService;
