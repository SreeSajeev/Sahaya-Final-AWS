/**
 * Artifact versioning — draft / publish / rollback snapshots for any builder.
 */
import crypto from "crypto";
import { prisma } from "../../db/prisma.js";

export async function listArtifactVersions(organisationId, artifactType, artifactKey) {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT id, version, status, published_at, created_at, created_by
       FROM platform_artifact_versions
       WHERE organisation_id = $1::uuid AND artifact_type = $2 AND artifact_key = $3
       ORDER BY version DESC`,
      String(organisationId),
      String(artifactType),
      String(artifactKey)
    );
    return { data: rows || [], error: null };
  } catch (err) {
    return { data: [], error: err };
  }
}

export async function publishArtifactVersion(organisationId, {
  artifactType,
  artifactKey,
  snapshot,
  createdBy = null,
}) {
  try {
    const existing = await prisma.$queryRawUnsafe(
      `SELECT COALESCE(MAX(version), 0)::int AS max_version
       FROM platform_artifact_versions
       WHERE organisation_id = $1::uuid AND artifact_type = $2 AND artifact_key = $3`,
      String(organisationId),
      String(artifactType),
      String(artifactKey)
    );
    const next = Number(existing?.[0]?.max_version || 0) + 1;
    const id = crypto.randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO platform_artifact_versions
         (id, organisation_id, artifact_type, artifact_key, version, status, snapshot_json, published_at, created_by, created_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'published', $6::jsonb, NOW(), NULLIF($7,'')::uuid, NOW())`,
      id,
      String(organisationId),
      String(artifactType),
      String(artifactKey),
      next,
      JSON.stringify(snapshot || {}),
      createdBy ? String(createdBy) : ""
    );
    return { data: { id, version: next, status: "published" }, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

export async function getPublishedSnapshot(organisationId, artifactType, artifactKey, version = null) {
  try {
    const rows = version
      ? await prisma.$queryRawUnsafe(
          `SELECT * FROM platform_artifact_versions
           WHERE organisation_id = $1::uuid AND artifact_type = $2 AND artifact_key = $3 AND version = $4
           LIMIT 1`,
          String(organisationId),
          String(artifactType),
          String(artifactKey),
          Number(version)
        )
      : await prisma.$queryRawUnsafe(
          `SELECT * FROM platform_artifact_versions
           WHERE organisation_id = $1::uuid AND artifact_type = $2 AND artifact_key = $3 AND status = 'published'
           ORDER BY version DESC LIMIT 1`,
          String(organisationId),
          String(artifactType),
          String(artifactKey)
        );
    return { data: rows?.[0] || null, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

export async function writePlatformAudit(organisationId, { actorUserId, action, entityType, entityId, before, after }) {
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO platform_audit_logs
         (id, organisation_id, actor_user_id, action, entity_type, entity_id, before_json, after_json, created_at)
       VALUES ($1::uuid, $2::uuid, NULLIF($3,'')::uuid, $4, $5, $6, $7::jsonb, $8::jsonb, NOW())`,
      crypto.randomUUID(),
      String(organisationId),
      actorUserId ? String(actorUserId) : "",
      String(action),
      entityType ? String(entityType) : null,
      entityId ? String(entityId) : null,
      JSON.stringify(before ?? null),
      JSON.stringify(after ?? null)
    );
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/**
 * Republish an older snapshot as a new version (rollback).
 */
export async function rollbackArtifactVersion(organisationId, artifactType, artifactKey, toVersion, createdBy = null) {
  const { data, error } = await getPublishedSnapshot(organisationId, artifactType, artifactKey, toVersion);
  if (error || !data) return { data: null, error: error || new Error("version not found") };
  const published = await publishArtifactVersion(organisationId, {
    artifactType,
    artifactKey,
    snapshot: data.snapshot_json,
    createdBy,
  });
  await writePlatformAudit(organisationId, {
    actorUserId: createdBy,
    action: "artifact.rollback",
    entityType: artifactType,
    entityId: artifactKey,
    before: { version: null },
    after: { rolledBackTo: toVersion, newVersion: published.data?.version },
  });
  return published;
}

export async function cloneArtifact(organisationId, artifactType, sourceKey, newKey, createdBy = null) {
  const { data, error } = await getPublishedSnapshot(organisationId, artifactType, sourceKey);
  if (error || !data) return { data: null, error: error || new Error("source not found") };
  return publishArtifactVersion(organisationId, {
    artifactType,
    artifactKey: newKey,
    snapshot: { ...(data.snapshot_json || {}), clonedFrom: sourceKey },
    createdBy,
  });
}

export function compareSnapshots(a, b) {
  const left = JSON.stringify(a ?? null, null, 2).split("\n");
  const right = JSON.stringify(b ?? null, null, 2).split("\n");
  const max = Math.max(left.length, right.length);
  const lines = [];
  for (let i = 0; i < max; i++) {
    const L = left[i] ?? "";
    const R = right[i] ?? "";
    if (L === R) lines.push({ op: "eq", left: L, right: R });
    else lines.push({ op: "diff", left: L, right: R });
  }
  return { lines, changed: lines.filter((l) => l.op === "diff").length };
}
