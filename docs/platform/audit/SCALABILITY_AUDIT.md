# SCALABILITY AUDIT

**Scope:** Metadata Platform multi-tenant & data volume readiness  
**Date:** 2026-08-09  

---

## Requested scale vs evidence

| Target | Status |
|--------|--------|
| 100 tenants | ❌ Not executed |
| 1,000 / 10,000 tenants | ❌ Not executed |
| 100,000 tickets | ❌ Not executed |
| 1,000,000 metadata field values | ❌ Not executed |
| Pagination everywhere | ⚠️ Limit/offset params exist; UI rarely pages deeply |
| Cache layer | ❌ None for registry/catalog |
| Search index | ⚠️ `search_text` column idea; no ES/OpenSearch |
| Export at volume | ❌ Streaming exports absent |
| Publish/rollback under concurrency | 💥 Race conditions documented in security audit |

---

## Design limits observed in code

1. **In-process analytics ceiling:** 5000 tickets hard-coded for reports/dashboards.  
2. **Registry monolith snapshot:** Entire org catalog rewritten per form publish — O(fields) copy; concurrent loss risk.  
3. **No sharding / read replicas strategy** in platform layer.  
4. **Raw SQL `$queryRawUnsafe`** everywhere — workable early, poor for evolution/ORM batching.  
5. **Artifact versioning** without proven unique constraint contention handling under parallel publish.

---

## Scalability score: **18 / 100**

Cannot claim SaaS multi-tenant scale. Architecture is single-DB, single-process analytics.
