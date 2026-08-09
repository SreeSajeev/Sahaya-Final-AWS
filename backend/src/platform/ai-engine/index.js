/**
 * AI Engine — prompt/extractor config validation + confidence gating (no external calls).
 */

export function validateAiPrompt(prompt) {
  if (!prompt?.key) return { ok: false, error: "key required" };
  if (!prompt.prompt_text && !prompt.promptText) return { ok: false, error: "prompt_text required" };
  return { ok: true };
}

export function validateExtractor(extractor) {
  if (!extractor?.key) return { ok: false, error: "key required" };
  if (!Array.isArray(extractor.field_mappings_json || extractor.fieldMappings)) {
    return { ok: false, error: "fieldMappings required" };
  }
  return { ok: true };
}

export function gateByConfidence(fields, threshold = 80) {
  const accepted = {};
  const review = {};
  for (const [k, v] of Object.entries(fields || {})) {
    const conf = Number(v?.confidence ?? 0);
    if (conf >= threshold) accepted[k] = v;
    else review[k] = v;
  }
  return { accepted, review, threshold };
}
