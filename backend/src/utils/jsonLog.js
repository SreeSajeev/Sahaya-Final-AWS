/**
 * Single-line JSON logs for CloudWatch / log aggregation (no secrets).
 */
export function logJson(level, event, fields = {}) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level,
      event,
      ...fields,
    })
  );
}
