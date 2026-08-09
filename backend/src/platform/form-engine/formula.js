/**
 * AST Formula Engine — NO eval / Function / vm.
 * Pipeline: tokenize → parse → validate → interpret.
 */
const BLOCKED_IDENTS = new Set([
  "GLOBALTHIS",
  "PROCESS",
  "REQUIRE",
  "MODULE",
  "EXPORTS",
  "WINDOW",
  "DOCUMENT",
  "EVAL",
  "FUNCTION",
  "CONSTRUCTOR",
  "PROTOTYPE",
  "__PROTO__",
  "IMPORT",
]);

const FUNCTIONS = new Set([
  "IF", "SUM", "COUNT", "AVG", "MIN", "MAX", "ABS", "ROUND",
  "DATEADD", "DATEDIFF", "NOW", "CONCAT", "LEN", "LOWER", "UPPER", "TRIM",
]);

const MAX_FORMULA_LEN = 2000;
const MAX_AST_NODES = 500;
const MAX_DEPTH = 64;

export function listSupportedFormulaFunctions() {
  return [...FUNCTIONS].sort();
}

/** @typedef {{ type: string, [k: string]: unknown }} AstNode */

/**
 * @param {string} input
 * @returns {{ ok: true, tokens: object[] } | { ok: false, error: string }}
 */
export function tokenize(input) {
  const src = String(input || "");
  if (!src.trim()) return { ok: false, error: "formula required" };
  if (src.length > MAX_FORMULA_LEN) return { ok: false, error: "formula too long" };
  /** @type {object[]} */
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    if (c === "{" && src[i + 1] === "{") {
      const end = src.indexOf("}}", i + 2);
      if (end < 0) return { ok: false, error: "unclosed field ref" };
      const path = src.slice(i + 2, end).trim();
      if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(path)) return { ok: false, error: "invalid field ref" };
      tokens.push({ type: "REF", path });
      i = end + 2;
      continue;
    }
    if (c === "'" || c === '"') {
      const q = c;
      let j = i + 1;
      let out = "";
      while (j < src.length) {
        if (src[j] === "\\" && j + 1 < src.length) {
          out += src[j + 1];
          j += 2;
          continue;
        }
        if (src[j] === q) break;
        out += src[j];
        j += 1;
      }
      if (j >= src.length) return { ok: false, error: "unclosed string" };
      tokens.push({ type: "STRING", value: out });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] || ""))) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j += 1;
      const num = Number(src.slice(i, j));
      if (Number.isNaN(num)) return { ok: false, error: "invalid number" };
      tokens.push({ type: "NUMBER", value: num });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j += 1;
      const word = src.slice(i, j);
      const upper = word.toUpperCase();
      if (BLOCKED_IDENTS.has(upper) || word.includes("__proto__")) {
        return { ok: false, error: `forbidden identifier: ${word}` };
      }
      if (upper === "TRUE" || upper === "FALSE" || upper === "NULL") {
        tokens.push({
          type: "LITERAL",
          value: upper === "NULL" ? null : upper === "TRUE",
        });
      } else if (FUNCTIONS.has(upper)) {
        tokens.push({ type: "IDENT", name: upper });
      } else if (/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/.test(word)) {
        // bare field path (no braces)
        tokens.push({ type: "REF", path: word });
      } else {
        return { ok: false, error: `unknown identifier: ${word}` };
      }
      i = j;
      continue;
    }
    // multi-char ops
    const two = src.slice(i, i + 2);
    if (["==", "!=", "<=", ">=", "&&", "||"].includes(two)) {
      tokens.push({ type: "OP", op: two });
      i += 2;
      continue;
    }
    if ("+-*/%()<>,!".includes(c)) {
      if (c === "!" && src[i + 1] !== "=") {
        tokens.push({ type: "OP", op: "!" });
        i += 1;
        continue;
      }
      tokens.push({ type: "OP", op: c });
      i += 1;
      continue;
    }
    return { ok: false, error: `unexpected character: ${c}` };
  }
  tokens.push({ type: "EOF" });
  return { ok: true, tokens };
}

/**
 * Recursive-descent parser.
 * @param {object[]} tokens
 */
export function parse(tokens) {
  let pos = 0;
  let nodes = 0;

  function peek() {
    return tokens[pos];
  }
  function consume(type, op) {
    const t = tokens[pos];
    if (!t || t.type !== type || (op != null && t.op !== op)) {
      throw new Error(`expected ${type}${op || ""}`);
    }
    pos += 1;
    return t;
  }
  function bump() {
    nodes += 1;
    if (nodes > MAX_AST_NODES) throw new Error("formula too complex");
  }

  function parsePrimary() {
    bump();
    const t = peek();
    if (t.type === "NUMBER") {
      pos += 1;
      return { type: "Number", value: t.value };
    }
    if (t.type === "STRING") {
      pos += 1;
      return { type: "String", value: t.value };
    }
    if (t.type === "LITERAL") {
      pos += 1;
      return { type: "Literal", value: t.value };
    }
    if (t.type === "REF") {
      pos += 1;
      return { type: "Ref", path: t.path };
    }
    if (t.type === "IDENT") {
      const name = t.name;
      pos += 1;
      consume("OP", "(");
      const args = [];
      if (!(peek().type === "OP" && peek().op === ")")) {
        args.push(parseExpr());
        while (peek().type === "OP" && peek().op === ",") {
          pos += 1;
          args.push(parseExpr());
        }
      }
      consume("OP", ")");
      return { type: "Call", name, args };
    }
    if (t.type === "OP" && t.op === "(") {
      pos += 1;
      const inner = parseExpr();
      consume("OP", ")");
      return inner;
    }
    if (t.type === "OP" && (t.op === "-" || t.op === "!")) {
      pos += 1;
      return { type: "Unary", op: t.op, arg: parsePrimary() };
    }
    throw new Error(`unexpected token ${t.type}`);
  }

  function parseMul() {
    let left = parsePrimary();
    while (peek().type === "OP" && "*/%".includes(peek().op)) {
      const op = peek().op;
      pos += 1;
      bump();
      left = { type: "Binary", op, left, right: parsePrimary() };
    }
    return left;
  }

  function parseAdd() {
    let left = parseMul();
    while (peek().type === "OP" && (peek().op === "+" || peek().op === "-")) {
      const op = peek().op;
      pos += 1;
      bump();
      left = { type: "Binary", op, left, right: parseMul() };
    }
    return left;
  }

  function parseCmp() {
    let left = parseAdd();
    while (peek().type === "OP" && ["==", "!=", "<", ">", "<=", ">="].includes(peek().op)) {
      const op = peek().op;
      pos += 1;
      bump();
      left = { type: "Binary", op, left, right: parseAdd() };
    }
    return left;
  }

  function parseAnd() {
    let left = parseCmp();
    while (peek().type === "OP" && peek().op === "&&") {
      pos += 1;
      bump();
      left = { type: "Binary", op: "&&", left, right: parseCmp() };
    }
    return left;
  }

  function parseOr() {
    let left = parseAnd();
    while (peek().type === "OP" && peek().op === "||") {
      pos += 1;
      bump();
      left = { type: "Binary", op: "||", left, right: parseAnd() };
    }
    return left;
  }

  function parseExpr() {
    return parseOr();
  }

  try {
    const ast = parseExpr();
    if (peek().type !== "EOF") throw new Error("trailing tokens");
    return { ok: true, ast, nodeCount: nodes };
  } catch (err) {
    return { ok: false, error: err?.message || "parse error" };
  }
}

/**
 * Static validation: cycle among formula fields, depth, unknown refs (optional allowlist).
 */
export function validateAst(ast, opts = {}) {
  let depth = 0;
  let maxDepth = 0;
  const refs = new Set();
  function walk(node, d) {
    if (!node) return;
    maxDepth = Math.max(maxDepth, d);
    if (d > MAX_DEPTH) throw new Error("AST depth exceeded");
    if (node.type === "Ref") {
      refs.add(node.path);
      return;
    }
    if (node.type === "Call") {
      if (!FUNCTIONS.has(node.name)) throw new Error(`unknown function ${node.name}`);
      for (const a of node.args || []) walk(a, d + 1);
      return;
    }
    if (node.type === "Binary" || node.type === "Unary") {
      walk(node.left || node.arg, d + 1);
      walk(node.right, d + 1);
    }
  }
  try {
    walk(ast, 0);
    if (opts.knownFields) {
      const known = new Set(opts.knownFields);
      for (const r of refs) {
        const base = r.startsWith("parent.") || r.startsWith("row.") ? r.split(".").slice(1).join(".") : r;
        const top = base.split(".")[0];
        if (!known.has(top) && !r.startsWith("parent.") && !r.startsWith("row.")) {
          // allow unknown for flexibility unless strict
          if (opts.strictRefs) throw new Error(`unknown field ${r}`);
        }
      }
    }
    return { ok: true, refs: [...refs], maxDepth };
  } catch (err) {
    return { ok: false, error: err?.message || "validation failed" };
  }
}

function resolvePath(path, data, parent, row) {
  if (path.startsWith("parent.") && parent) {
    return getPath(parent, path.slice(7));
  }
  if (path.startsWith("row.") && row) {
    return getPath(row, path.slice(4));
  }
  return getPath(data, path);
}

function getPath(obj, path) {
  let cur = obj;
  for (const p of String(path).split(".")) {
    if (cur == null || typeof cur !== "object") return null;
    if (!Object.prototype.hasOwnProperty.call(cur, p)) return null;
    cur = cur[p];
  }
  return cur === undefined ? null : cur;
}

function toNum(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function interpret(node, ctx) {
  switch (node.type) {
    case "Number":
    case "String":
    case "Literal":
      return node.value;
    case "Ref":
      return resolvePath(node.path, ctx.data, ctx.parent, ctx.row);
    case "Unary": {
      const v = interpret(node.arg, ctx);
      if (node.op === "-") return -(toNum(v) ?? 0);
      if (node.op === "!") return !v;
      return null;
    }
    case "Binary": {
      const l = interpret(node.left, ctx);
      const r = interpret(node.right, ctx);
      switch (node.op) {
        case "+": {
          if (typeof l === "string" || typeof r === "string") return `${l ?? ""}${r ?? ""}`;
          const a = toNum(l);
          const b = toNum(r);
          if (a == null || b == null) return null;
          return a + b;
        }
        case "-":
        case "*":
        case "/":
        case "%": {
          const a = toNum(l);
          const b = toNum(r);
          if (a == null || b == null) return null;
          if (node.op === "-") return a - b;
          if (node.op === "*") return a * b;
          if (node.op === "/") return b === 0 ? null : a / b;
          return a % b;
        }
        case "==":
          return l == null && r == null ? true : String(l) === String(r);
        case "!=":
          return String(l) !== String(r);
        case "<":
          return (toNum(l) ?? 0) < (toNum(r) ?? 0);
        case ">":
          return (toNum(l) ?? 0) > (toNum(r) ?? 0);
        case "<=":
          return (toNum(l) ?? 0) <= (toNum(r) ?? 0);
        case ">=":
          return (toNum(l) ?? 0) >= (toNum(r) ?? 0);
        case "&&":
          return Boolean(l) && Boolean(r);
        case "||":
          return Boolean(l) || Boolean(r);
        default:
          return null;
      }
    }
    case "Call":
      return callFn(node.name, (node.args || []).map((a) => interpret(a, ctx)), ctx);
    default:
      return null;
  }
}

function callFn(name, args, ctx) {
  const flatNums = () => args.flat(Infinity).map(toNum).filter((n) => n != null);
  switch (name) {
    case "IF":
      return args[0] ? args[1] : args[2];
    case "SUM":
      return flatNums().reduce((a, b) => a + b, 0);
    case "COUNT":
      return args.flat(Infinity).filter((v) => v != null && v !== "").length;
    case "AVG": {
      const nums = flatNums();
      return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
    }
    case "MIN": {
      const nums = flatNums();
      return nums.length ? Math.min(...nums) : null;
    }
    case "MAX": {
      const nums = flatNums();
      return nums.length ? Math.max(...nums) : null;
    }
    case "ABS":
      return Math.abs(toNum(args[0]) ?? 0);
    case "ROUND": {
      const n = toNum(args[0]);
      if (n == null) return null;
      const d = toNum(args[1]) ?? 0;
      const p = 10 ** d;
      return Math.round(n * p) / p;
    }
    case "NOW":
      return ctx.now || new Date().toISOString();
    case "CONCAT":
      return args.flat(Infinity).map((v) => (v == null ? "" : String(v))).join("");
    case "LEN":
      return String(args[0] ?? "").length;
    case "LOWER":
      return String(args[0] ?? "").toLowerCase();
    case "UPPER":
      return String(args[0] ?? "").toUpperCase();
    case "TRIM":
      return String(args[0] ?? "").trim();
    case "DATEADD": {
      const d = new Date(args[0] || ctx.now || Date.now());
      const n = toNum(args[1]) ?? 0;
      const unit = String(args[2] || "days").toLowerCase();
      if (unit === "days") d.setDate(d.getDate() + n);
      else if (unit === "hours") d.setHours(d.getHours() + n);
      else if (unit === "minutes") d.setMinutes(d.getMinutes() + n);
      else if (unit === "months") d.setMonth(d.getMonth() + n);
      return d.toISOString();
    }
    case "DATEDIFF": {
      const ms = new Date(args[0]).getTime() - new Date(args[1]).getTime();
      const unit = String(args[2] || "days").toLowerCase();
      if (unit === "hours") return ms / 3_600_000;
      if (unit === "minutes") return ms / 60_000;
      return ms / 86_400_000;
    }
    default:
      return null;
  }
}

/**
 * Detect cycles among formula fields that reference each other.
 */
export function detectFormulaCycles(schema) {
  const fields = Array.isArray(schema?.fields) ? schema.fields : [];
  const formulas = {};
  for (const f of fields) {
    const type = f.fieldType || f.field_type;
    if (type !== "formula" && type !== "computed") continue;
    const name = f.internalName || f.internal_name;
    const tok = tokenize(f.formula || f.expression || "");
    if (!tok.ok) continue;
    const parsed = parse(tok.tokens);
    if (!parsed.ok) continue;
    const v = validateAst(parsed.ast);
    formulas[name] = (v.refs || []).map((r) => r.split(".")[0]);
  }
  const cycles = [];
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  function dfs(n) {
    visiting.add(n);
    stack.push(n);
    for (const next of formulas[n] || []) {
      if (!formulas[next]) continue;
      if (visiting.has(next)) {
        cycles.push([...stack.slice(stack.indexOf(next)), next]);
      } else if (!visited.has(next)) dfs(next);
    }
    stack.pop();
    visiting.delete(n);
    visited.add(n);
  }
  for (const k of Object.keys(formulas)) {
    if (!visited.has(k)) dfs(k);
  }
  return { ok: cycles.length === 0, cycles };
}

/**
 * Public API — same shape as legacy evaluateFormula.
 */
export function evaluateFormula(formula, data = {}, opts = {}) {
  const tok = tokenize(formula);
  if (!tok.ok) return tok;
  const parsed = parse(tok.tokens);
  if (!parsed.ok) return parsed;
  const validated = validateAst(parsed.ast, opts);
  if (!validated.ok) return validated;
  try {
    const value = interpret(parsed.ast, {
      data,
      parent: opts.parent || null,
      row: opts.row || null,
      now: opts.now || null,
    });
    return { ok: true, value, ast: parsed.ast };
  } catch (err) {
    return { ok: false, error: err?.message || "interpret failed" };
  }
}

export function applyCalculatedFields(schema, data) {
  const fields = Array.isArray(schema?.fields) ? schema.fields : [];
  const cycle = detectFormulaCycles(schema);
  if (!cycle.ok) return { ...(data || {}), __formulaError: "cycle" };
  const next = { ...(data || {}) };
  // topological-ish: multiple passes
  for (let pass = 0; pass < fields.length + 1; pass++) {
    let changed = false;
    for (const f of fields) {
      const type = f.fieldType || f.field_type;
      if (type !== "formula" && type !== "computed") continue;
      const name = f.internalName || f.internal_name;
      const result = evaluateFormula(f.formula || f.expression || "", next);
      if (result.ok && next[name] !== result.value) {
        next[name] = result.value;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return next;
}

/** Constant-fold number-only subtrees (optional optimization). */
export function constantFold(ast) {
  if (!ast || typeof ast !== "object") return ast;
  if (ast.type === "Binary") {
    const left = constantFold(ast.left);
    const right = constantFold(ast.right);
    if (left?.type === "Number" && right?.type === "Number") {
      const v = interpret({ ...ast, left, right }, { data: {} });
      if (typeof v === "number" && !Number.isNaN(v)) return { type: "Number", value: v };
    }
    return { ...ast, left, right };
  }
  if (ast.type === "Unary") {
    const arg = constantFold(ast.arg);
    if (arg?.type === "Number" && ast.op === "-") return { type: "Number", value: -arg.value };
    return { ...ast, arg };
  }
  if (ast.type === "Call") {
    return { ...ast, args: (ast.args || []).map(constantFold) };
  }
  return ast;
}
