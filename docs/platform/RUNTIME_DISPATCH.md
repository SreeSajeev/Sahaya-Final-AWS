# Runtime dispatcher (LEGACY vs METADATA)

## Policy: Exclusive runtime (default)

| Tenant mode | Ticket APIs |
|-------------|-------------|
| **LEGACY** | `/tickets`, `/data/tickets*`, `/fe/me*`, `/sm/*` |
| **METADATA** | `/platform/runtime/*` and `/platform/*` builders only |

A METADATA organisation receives **HTTP 409** `PLATFORM_EXCLUSIVE_RUNTIME` if it calls legacy ticket surfaces.

LEGACY organisations still receive **404** on Metadata builders (`PLATFORM_LEGACY_TENANT`).

## Compatibility mode (explicit, default OFF)

```bash
PLATFORM_COMPATIBILITY_MODE=true
```

When set, METADATA tenants may use **both** legacy and platform ticket APIs.  
This exists only for controlled migration windows and must be documented in the change ticket.

**Default: OFF.** Never enable in production without an explicit dual-runtime waiver.

## Implementation

- Gate: `backend/src/platform/runtime/exclusiveRuntimeGate.js`
- Mounted in `app.js` and `tests/helpers/testApp.js` ahead of legacy ticket routers
- Mode source: `platform_tenant_settings.mode` (absence ⇒ LEGACY)
