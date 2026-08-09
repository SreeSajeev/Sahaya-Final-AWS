/**
 * Re-export SafeRegexService as the parser-engine entry (single implementation).
 */
export {
  assertSafeRegex,
  safeRegexMatch,
  SafeRegexService,
  MAX_REGEX_PATTERN_LENGTH,
  MAX_REGEX_FLAGS_LENGTH,
  MAX_INPUT_CHARS_FOR_REGEX,
  REGEX_EXEC_BUDGET_MS,
} from "../security/SafeRegexService.js";
export { assertSafeRegex as default } from "../security/SafeRegexService.js";
