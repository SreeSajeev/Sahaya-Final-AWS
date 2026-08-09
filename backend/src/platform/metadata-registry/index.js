/**
 * Metadata Registry — single source of truth for published METADATA artifacts.
 * All builders publish here. Consumers read only from registry (never peer tables).
 */
import crypto from "crypto";
import { publishArtifactVersion, getPublishedSnapshot, listArtifactVersions } from "../builders/versioning.js";
import {
  getCachedCatalog,
  setCachedCatalog,
  broadcastRegistryPublish,
  invalidateRegistryCache,
} from "./registryCache.js";

export const REGISTRY_ARTIFACT = "metadata_registry";
export const REGISTRY_KEY = "catalog";

export const REGISTRY_BUCKETS = Object.freeze([
  "forms",
  "workflows",
  "assignments",
  "automations",
  "notifications",
  "reports",
  "dashboards",
  "permissions",
  "ai",
  "parsers",
  "plugins",
  "search",
]);

function emptyCatalog() {
  const buckets = {};
  for (const b of REGISTRY_BUCKETS) buckets[b] = {};
  return { ...buckets, fields: [], updatedAt: null, revision: null };
}

export function buildFormCatalogEntry(formKey, version, schema, layout) {
  const fields = Array.isArray(schema?.fields) ? schema.fields : [];
  return {
    type: "form",
    key: formKey,
    version: Number(version),
    publishedAt: new Date().toISOString(),
    layout: layout || null,
    schema: schema || null,
    fields: fields
      .filter((f) => f && !["section", "divider", "tab", "group", "accordion"].includes(String(f.fieldType)))
      .map((f) => ({
        internalName: f.internalName || f.internal_name,
        displayLabel: f.displayLabel || f.display_label || f.internalName,
        fieldType: f.fieldType || f.field_type,
        formKey,
        formVersion: Number(version),
        reportable: f.reportable !== false,
        searchable: f.searchable !== false,
        filterable: f.filterable !== false,
        options: f.options || null,
        required: Boolean(f.required),
        regex: f.regex || null,
        formula: f.formula || f.expression || null,
      })),
  };
}

/**
 * Merge any artifact into registry under a bucket. Immutable new registry version.
 */
export async function publishToRegistry(organisationId, bucket, key, version, snapshot, createdBy = null) {
  if (!REGISTRY_BUCKETS.includes(bucket)) {
    return { data: null, error: new Error(`unknown registry bucket: ${bucket}`) };
  }
  const current = await getPublishedSnapshot(organisationId, REGISTRY_ARTIFACT, REGISTRY_KEY);
  const prev = current.data?.snapshot_json || emptyCatalog();
  const bucketMap = { ...(prev[bucket] || {}) };

  let entry;
  if (bucket === "forms") {
    entry = buildFormCatalogEntry(key, version, snapshot?.schema || snapshot, snapshot?.layout);
  } else if (bucket === "workflows") {
    entry = {
      type: "workflow",
      key,
      version: Number(version),
      definition: snapshot?.definition || snapshot,
      publishedAt: new Date().toISOString(),
      states: ((snapshot?.definition || snapshot)?.states || []).map((s) => s.key || s),
      transitions: ((snapshot?.definition || snapshot)?.transitions || []).map((t) => ({
        key: t.key,
        from: t.from,
        to: t.to,
      })),
    };
  } else {
    entry = {
      type: bucket.replace(/s$/, ""),
      key,
      version: Number(version),
      snapshot,
      publishedAt: new Date().toISOString(),
    };
  }

  bucketMap[key] = entry;
  const next = { ...prev, [bucket]: bucketMap };

  // Rebuild flattened fields from all forms
  const fields = [];
  for (const f of Object.values(next.forms || {})) {
    for (const field of f.fields || []) fields.push(field);
  }
  next.fields = fields;
  next.updatedAt = new Date().toISOString();
  next.revision = crypto.randomUUID();

  const published = await publishArtifactVersion(organisationId, {
    artifactType: REGISTRY_ARTIFACT,
    artifactKey: REGISTRY_KEY,
    snapshot: next,
    createdBy,
  });

  if (published.data) {
    setCachedCatalog(organisationId, published.data.version, next);
    broadcastRegistryPublish(organisationId, {
      bucket,
      key,
      artifactVersion: Number(version),
      registryVersion: published.data.version,
      revision: next.revision,
    });
  }

  return published;
}

export async function publishFormToRegistry(organisationId, formKey, version, schema, layout, createdBy = null) {
  return publishToRegistry(organisationId, "forms", formKey, version, { schema, layout }, createdBy);
}

export async function publishWorkflowToRegistry(organisationId, workflowKey, version, definition, createdBy = null) {
  return publishToRegistry(organisationId, "workflows", workflowKey, version, { definition }, createdBy);
}

export async function getRegistryCatalog(organisationId) {
  const cached = getCachedCatalog(organisationId);
  if (cached) {
    return {
      data: enrichCatalog(cached.catalog, cached.version),
      error: null,
      cacheHit: true,
    };
  }
  const { data, error } = await getPublishedSnapshot(organisationId, REGISTRY_ARTIFACT, REGISTRY_KEY);
  if (error) return { data: null, error };
  const snap = data?.snapshot_json || emptyCatalog();
  const version = data?.version || 0;
  setCachedCatalog(organisationId, version, snap);
  return { data: enrichCatalog(snap, version), error: null, cacheHit: false };
}

function enrichCatalog(snap, version) {
  return {
    ...snap,
    version,
    fields: snap.fields || [],
    formKeys: Object.keys(snap.forms || {}),
    workflowKeys: Object.keys(snap.workflows || {}),
    notificationVariables: (snap.fields || []).map((f) => ({
      path: `ticket.data.${f.internalName}`,
      label: f.displayLabel,
      fieldType: f.fieldType,
    })),
    reportColumns: (snap.fields || [])
      .filter((f) => f.reportable !== false)
      .map((f) => ({
        field_key: f.internalName,
        label: f.displayLabel,
        fieldType: f.fieldType,
        formKey: f.formKey,
      })),
    searchFields: (snap.fields || []).filter((f) => f.searchable !== false),
    assignmentFields: (snap.fields || []).filter((f) =>
      ["location", "vehicle", "asset", "people", "department", "dropdown", "tags", "user"].includes(f.fieldType)
    ),
  };
}

export async function listRegistryHistory(organisationId) {
  return listArtifactVersions(organisationId, REGISTRY_ARTIFACT, REGISTRY_KEY);
}

export function diffRegistrySnapshots(a, b) {
  const aFields = new Map((a?.fields || []).map((f) => [`${f.formKey}:${f.internalName}`, f]));
  const bFields = new Map((b?.fields || []).map((f) => [`${f.formKey}:${f.internalName}`, f]));
  const added = [];
  const removed = [];
  const changed = [];
  for (const [k, f] of bFields) {
    if (!aFields.has(k)) added.push(f);
    else if (JSON.stringify(aFields.get(k)) !== JSON.stringify(f)) changed.push({ before: aFields.get(k), after: f });
  }
  for (const [k, f] of aFields) {
    if (!bFields.has(k)) removed.push(f);
  }
  return { added, removed, changed };
}

/**
 * Resolve published form schema by formVersionId or form key from registry / form_versions table.
 */
export async function resolvePublishedForm(organisationId, { formVersionId, formKey } = {}) {
  const { prisma } = await import("../../db/prisma.js");
  if (formVersionId) {
    try {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT id, form_id, version, schema_json, layout_json
         FROM platform_form_versions
         WHERE organisation_id = $1::uuid AND id = $2::uuid
         LIMIT 1`,
        String(organisationId),
        String(formVersionId)
      );
      const row = rows?.[0];
      if (row) {
        return {
          ok: true,
          formVersionId: row.id,
          version: row.version,
          schema: row.schema_json,
          layout: row.layout_json,
        };
      }
    } catch (err) {
      return { ok: false, error: err };
    }
  }
  if (formKey) {
    const { data } = await getRegistryCatalog(organisationId);
    const entry = data?.forms?.[formKey];
    if (entry?.schema) {
      return {
        ok: true,
        formVersionId: null,
        version: entry.version,
        schema: entry.schema,
        layout: entry.layout,
        formKey,
      };
    }
  }
  return { ok: false, error: new Error("published form not found") };
}

export async function resolvePublishedWorkflow(organisationId, { workflowVersionId, workflowKey } = {}) {
  if (workflowKey) {
    const { data } = await getRegistryCatalog(organisationId);
    const entry = data?.workflows?.[workflowKey];
    if (entry?.definition) {
      return { ok: true, definition: entry.definition, version: entry.version, workflowKey };
    }
  }
  if (workflowVersionId) {
    const { getPublishedSnapshot: getSnap } = await import("../builders/versioning.js");
    // workflow versions stored as artifact type workflow
    // Prefer registry
  }
  return { ok: false, error: new Error("published workflow not found") };
}

export { invalidateRegistryCache, broadcastRegistryPublish };
