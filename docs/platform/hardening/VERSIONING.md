# VERSIONING

## Rules

1. Published artifacts are **immutable snapshots**.
2. Rollback = **re-publish** an older snapshot as a **new** version (`rollbackArtifactVersion`) — history is never rewritten.
3. Runtime tickets bind to `form_version_id` / `workflow_version_id` and embed `registryVersionId` in ticket meta at create time.
4. Historical tickets keep resolving against the version IDs they stored — catalog evolution does not mutate old rows.

## Surfaces

- Forms: `platform_form_versions` + registry forms bucket  
- Other builders: `platform_artifact_versions` + registry bucket via publish pipeline  
- Registry itself: versioned artifact `metadata_registry` / `catalog`

## Client contract

Browser may send only:

- `formVersionId` or `formKey`
- `workflowVersionId` or `workflowKey` (optional)
- `data` (field values)

Never: schemas, workflow graphs, automation definitions.
