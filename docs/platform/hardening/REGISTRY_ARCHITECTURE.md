# REGISTRY ARCHITECTURE

## Principle

```
Draft builder → Validate → Freeze snapshot → Artifact version
                                              ↓
                                         Registry merge (immutable new catalog version)
                                              ↓
                                    Invalidate LRU + broadcast event
                                              ↓
                         Runtime / Reports / Notifications / … reload catalog
```

Builders **must not** read each other’s tables for cross-concern fields. They read:

`GET /platform/registry`

## Buckets

`forms`, `workflows`, `assignments`, `automations`, `notifications`, `reports`, `dashboards`, `permissions`, `ai`, `parsers`, `plugins`, `search`

## Publish entrypoints

| Source | Registry write |
|--------|----------------|
| Form publish (`formService`) | `publishFormToRegistry` |
| `POST /platform/versions/:type/:key/publish` | `publishToRegistry` via `ARTIFACT_TO_BUCKET` map |

## Cache

In-process LRU (`registryCache.js`) keyed by `organisationId`, TTL default 30s, invalidated on publish.

## Live updates

- In-process: `registryEvents` EventEmitter
- HTTP: `GET /platform/registry/events` (SSE)
- FE: `useRegistryCatalog` polls (Bearer-safe); SSE available for cookie sessions

## Runtime resolve

`resolvePublishedForm(organisationId, { formVersionId | formKey })` loads immutable `platform_form_versions` / registry schema — never client JSON.
