/** Mirror of backend form-engine condition evaluator (frontend-safe). */
export function evaluateCondition(condition: unknown, data: Record<string, unknown>): boolean {
  if (condition == null || typeof condition !== "object") return true;
  const c = condition as Record<string, unknown>;
  if (Array.isArray(c.and)) return c.and.every((x) => evaluateCondition(x, data));
  if (Array.isArray(c.or)) return c.or.some((x) => evaluateCondition(x, data));
  if (c.field != null) {
    const actual = data[String(c.field)];
    if (Object.prototype.hasOwnProperty.call(c, "equals")) {
      return String(actual ?? "") === String(c.equals ?? "");
    }
    if (Object.prototype.hasOwnProperty.call(c, "notEquals")) {
      return String(actual ?? "") !== String(c.notEquals ?? "");
    }
    if (c.exists === true) return actual != null && String(actual).trim() !== "";
  }
  return true;
}
