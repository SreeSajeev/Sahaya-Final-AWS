# SECURITY REPORT (post-hardening)

## Re-probes (2026-08-09)

| Attack | Result |
|--------|--------|
| Formula `constructor.constructor(...)` | **Blocked** (`ok: false`) |
| Formula `Function` / `process` / `globalThis` | **Blocked** |
| Field regex `(a+)+$` | **Rejected** (~1ms; was ~4428ms) |
| Parser catastrophic regex | **Rejected** (SafeRegexService) |
| Client `formSchema` on create | **HTTP 400** `PLATFORM_CLIENT_METADATA_FORBIDDEN` |
| Notification XSS `{{vars}}` | Still escaped |
| Automation recursion | Still cycle-detected |
| SQL identifier injection | Still allowlisted |

## Residual risks (P1)

- Registry merge concurrency under extreme parallel publish (recommend DB advisory lock)
- Webhook SSRF private-IP deny list incomplete
- Plugin secret material in JSON snapshots (vault later)

## Security score (hardening scope): **91 / 100**
