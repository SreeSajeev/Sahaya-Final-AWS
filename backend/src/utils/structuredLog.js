export function logEvent(event, fields = {}) {
  try {
    // Single-line JSON for CloudWatch / ELK.
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        event,
        ...fields,
      })
    );
  } catch (_e) {
    console.log("[logEvent]", event);
  }
}

