/**
 * Email Parser Engine — metadata-driven extraction (no Hitachi hardcoding).
 * Regex paths always go through safeRegex (ReDoS guard).
 */
import { assertSafeRegex, safeRegexMatch } from "./safeRegex.js";

/**
 * @param {object} config parser config_json
 */
export function validateParserConfig(config) {
  if (!config || typeof config !== "object") return { ok: false, error: "config required" };
  const mappings = Array.isArray(config.fieldMappings) ? config.fieldMappings : [];
  for (const m of mappings) {
    if (!m?.targetField) return { ok: false, error: "fieldMappings.targetField required" };
  }
  for (const rule of config.regexRules || []) {
    if (!rule?.pattern) continue;
    const gate = assertSafeRegex(rule.pattern, rule.flags || "im");
    if (!gate.ok) return { ok: false, error: `unsafe regex: ${gate.error}`, code: gate.code };
  }
  return { ok: true };
}

function applyRegexRules(text, rules) {
  /** @type {Record<string, { value: string, confidence: number, method: string }>} */
  const out = {};
  /** @type {string[]} */
  const rejected = [];
  for (const rule of rules || []) {
    if (!rule?.pattern || !rule?.targetField) continue;
    const result = safeRegexMatch(rule.pattern, rule.flags || "im", text);
    if (!result.ok) {
      rejected.push(String(rule.targetField));
      continue;
    }
    if (result.match) {
      out[rule.targetField] = {
        value: (result.match[1] ?? result.match[0] ?? "").trim(),
        confidence: Number(rule.confidence ?? 90),
        method: "regex",
      };
    }
  }
  return { out, rejected };
}

function applyKeywordRules(text, rules) {
  const out = {};
  const hay = String(text || "").toLowerCase();
  for (const rule of rules || []) {
    if (!rule?.keyword || !rule?.targetField) continue;
    if (hay.includes(String(rule.keyword).toLowerCase())) {
      out[rule.targetField] = {
        value: rule.value ?? rule.keyword,
        confidence: Number(rule.confidence ?? 85),
        method: "keyword",
      };
    }
  }
  return out;
}

function applySenderRules(fromEmail, rules) {
  const out = {};
  const from = String(fromEmail || "").toLowerCase();
  for (const rule of rules || []) {
    if (!rule?.domain && !rule?.equals) continue;
    const ok = rule.equals
      ? from === String(rule.equals).toLowerCase()
      : from.endsWith(String(rule.domain).toLowerCase());
    if (ok && rule.targetField) {
      out[rule.targetField] = {
        value: rule.value,
        confidence: Number(rule.confidence ?? 95),
        method: "sender",
      };
    }
  }
  return out;
}

/**
 * Dry-run / preview extraction.
 */
export function previewEmailParse(config, email) {
  const validation = validateParserConfig(config);
  if (!validation.ok) {
    return { error: validation.error, code: validation.code, fields: {}, needsReview: [], ticketDraft: {} };
  }

  const subject = email?.subject || "";
  const body = email?.body || email?.text || "";
  const html = email?.html || "";
  const from = email?.from || email?.fromEmail || "";
  const blob = `${subject}\n${body}\n${html}`;

  const { out: regexOut, rejected } = applyRegexRules(blob, config.regexRules);
  const fields = {
    ...applySenderRules(from, config.senderRules),
    ...applyKeywordRules(blob, config.keywordRules),
    ...regexOut,
  };

  if (config.mapSubjectToField) {
    fields[config.mapSubjectToField] = {
      value: subject,
      confidence: 99,
      method: "subject",
    };
  }
  if (config.mapBodyToField && !fields[config.mapBodyToField]) {
    fields[config.mapBodyToField] = {
      value: body,
      confidence: 80,
      method: "body",
    };
  }

  const threshold = Number(config.confidenceThreshold ?? 80);
  const needsReview = Object.entries(fields)
    .filter(([, v]) => Number(v.confidence) < threshold)
    .map(([k]) => k);

  const ticketDraft = {};
  for (const [k, v] of Object.entries(fields)) ticketDraft[k] = v.value;

  if (config.ticketTypeKey) ticketDraft.__ticketTypeKey = config.ticketTypeKey;
  if (config.workflowKey) ticketDraft.__workflowKey = config.workflowKey;

  return { fields, needsReview, ticketDraft, threshold, rejectedRegexFields: rejected };
}

export function simulateAiExtraction(promptConfig, email) {
  const text = `${email?.subject || ""}\n${email?.body || ""}`;
  const fields = {};
  const mappings = Array.isArray(promptConfig?.fieldMappings) ? promptConfig.fieldMappings : [];
  for (const m of mappings) {
    if (!m.targetField) continue;
    const line = text.split("\n").map((s) => s.trim()).find(Boolean) || "";
    fields[m.targetField] = {
      value: line.slice(0, 200),
      confidence: Number(m.confidence ?? 70),
      method: "ai_stub",
    };
  }
  return { fields };
}

export { assertSafeRegex, safeRegexMatch } from "./safeRegex.js";
