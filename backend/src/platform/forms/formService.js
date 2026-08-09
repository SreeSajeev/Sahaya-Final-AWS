import crypto from "crypto";
import { prisma } from "../../db/prisma.js";
import { listByOrg, getById, getByOrgAndKey } from "../runtime/platformCrud.js";
import { validateFormSchema } from "./formSchema.js";
import { validateLayout } from "../form-engine/layout.js";
import { publishFormToRegistry } from "../metadata-registry/index.js";
import { writePlatformAudit } from "../builders/versioning.js";

const TABLE = "platform_forms";

export async function listForms(organisationId, opts) {
  return listByOrg(TABLE, organisationId, opts);
}

export async function getForm(organisationId, idOrKey) {
  const byId = await getById(TABLE, organisationId, idOrKey);
  if (byId.data) return byId;
  return getByOrgAndKey(TABLE, organisationId, idOrKey);
}

export async function createOrUpdateForm(organisationId, { key, name, description, status = "draft" }) {
  const id = crypto.randomUUID();
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO platform_forms (id, organisation_id, key, name, description, status, current_version, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, 1, NOW(), NOW())
       ON CONFLICT (organisation_id, key) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         status = EXCLUDED.status,
         updated_at = NOW()`,
      id,
      String(organisationId),
      String(key),
      String(name || key),
      description ?? null,
      String(status)
    );
    return getByOrgAndKey(TABLE, organisationId, key);
  } catch (err) {
    return { data: null, error: err };
  }
}

export async function publishFormVersion(organisationId, formId, { schema, layout, createdBy }) {
  const validation = validateFormSchema(schema);
  if (!validation.ok) return { data: null, error: new Error(validation.error) };
  const layoutCheck = validateLayout(layout);
  if (!layoutCheck.ok) return { data: null, error: new Error(layoutCheck.error) };

  const formRes = await getById(TABLE, organisationId, formId);
  if (!formRes.data) return { data: null, error: new Error("Form not found") };
  const form = formRes.data;
  const version =
    form.status === "draft" && Number(form.current_version || 1) === 1
      ? 1
      : Number(form.current_version || 0) + 1;

  const versionId = crypto.randomUUID();
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO platform_form_versions
         (id, form_id, organisation_id, version, schema_json, layout_json, published_at, created_by, created_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::jsonb, $6::jsonb, NOW(), NULLIF($7, '')::uuid, NOW())
       ON CONFLICT (form_id, version) DO UPDATE SET
         schema_json = EXCLUDED.schema_json,
         layout_json = EXCLUDED.layout_json,
         published_at = NOW()`,
      versionId,
      String(form.id),
      String(organisationId),
      version,
      JSON.stringify(schema || {}),
      JSON.stringify(layoutCheck.layout || layout || {}),
      createdBy ? String(createdBy) : ""
    );
    await prisma.$executeRawUnsafe(
      `UPDATE platform_forms
       SET status = 'published', current_version = $1, updated_at = NOW()
       WHERE id = $2::uuid AND organisation_id = $3::uuid`,
      version,
      String(form.id),
      String(organisationId)
    );
    await publishFormToRegistry(
      organisationId,
      form.key,
      version,
      schema,
      layoutCheck.layout || layout,
      createdBy
    );
    await writePlatformAudit(organisationId, {
      actorUserId: createdBy,
      action: "form.publish",
      entityType: "form",
      entityId: form.id,
      before: { version: form.current_version },
      after: { version, versionId },
    });
    return {
      data: { form_id: form.id, version, version_id: versionId, key: form.key },
      error: null,
    };
  } catch (err) {
    return { data: null, error: err };
  }
}

export async function listFormVersions(organisationId, formId) {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT id, form_id, organisation_id, version, schema_json, layout_json, published_at, created_at
       FROM platform_form_versions
       WHERE organisation_id = $1::uuid AND form_id = $2::uuid
       ORDER BY version DESC`,
      String(organisationId),
      String(formId)
    );
    return { data: rows || [], error: null };
  } catch (err) {
    return { data: [], error: err };
  }
}
