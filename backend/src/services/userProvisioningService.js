import { z } from "zod";
import { PROVISION_SERVER_SIDE_ENABLED } from "../config/appConfig.js";
import { insertAuditLog } from "./auditLogService.js";
import { hasPublicColumn } from "./schemaCompatService.js";
import { safeTrim } from "../utils/http.js";
import { logEvent } from "../utils/structuredLog.js";
import { redactEmail } from "../utils/redact.js";
import { normalizeLocation } from "../utils/normalizeLocation.js";
import { hashPassword, normalizeEmail } from "./passwordService.js";
import {
  findUserByEmail,
  insertUser,
  updateUserById,
} from "../repositories/userRepository.js";
import {
  findFieldExecutiveByUserIdFull,
  insertFieldExecutive,
} from "../repositories/fieldExecutiveRepository.js";
import { prisma } from "../db/prisma.js";

const ROLES = ["CLIENT", "STAFF", "FIELD_EXECUTIVE", "ADMIN", "SUPER_ADMIN"];

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be less than 72 characters")
  .refine(
    (s) => /[a-z]/.test(s) && /[A-Z]/.test(s) && /\d/.test(s) && /[^\w\s]/.test(s),
    "Password must include uppercase, lowercase, a number, and a special character"
  );

const provisionBodySchema = z.object({
  email: z.string().trim().email().max(255),
  password: passwordSchema,
  name: z.string().trim().min(1).max(100),
  role: z.enum(ROLES),
  organisationId: z.string().uuid().nullable().optional(),
  clientSlug: z.string().trim().min(1).max(255).nullable().optional(),
  active: z.boolean().optional(),
  fieldExecutive: z
    .object({
      phone: z.string().max(20).nullable().optional(),
      base_location: z.string().max(255).nullable().optional(),
      skills: z.unknown().nullable().optional(),
      active: z.boolean().optional(),
    })
    .optional(),
});

const TENANT_ADMIN_CREATABLE = new Set(["STAFF", "FIELD_EXECUTIVE", "CLIENT"]);

function resolveOrganisationId({ role, organisationId }) {
  if (role === "SUPER_ADMIN") return null;
  return organisationId ?? null;
}

/**
 * Authorize and normalize admin provision request.
 */
export function authorizeAdminProvision(req, rawBody) {
  const parsed = provisionBodySchema.safeParse(rawBody ?? {});
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join("; ") || "Invalid request";
    return { ok: false, status: 400, message: msg };
  }

  const body = parsed.data;
  const actorRole = req.appUser?.role;
  if (!actorRole || !["ADMIN", "SUPER_ADMIN"].includes(actorRole)) {
    return { ok: false, status: 403, message: "Forbidden" };
  }

  if (actorRole === "ADMIN") {
    if (!TENANT_ADMIN_CREATABLE.has(body.role)) {
      return { ok: false, status: 403, message: "Role not allowed for tenant admin" };
    }
    if (body.role === "SUPER_ADMIN") {
      return { ok: false, status: 403, message: "Cannot create super admin" };
    }
    const tenantId = req.tenantId ?? req.appUser?.organisation_id ?? null;
    if (!tenantId) {
      return { ok: false, status: 403, message: "Tenant context missing" };
    }
    if (!body.organisationId || body.organisationId !== tenantId) {
      return { ok: false, status: 403, message: "organisationId must match your tenant" };
    }
  }

  if (body.role === "CLIENT" && !safeTrim(body.clientSlug)) {
    return { ok: false, status: 400, message: "clientSlug is required for CLIENT role" };
  }

  const organisationId = resolveOrganisationId({
    role: body.role,
    organisationId: body.organisationId ?? null,
  });

  if (body.role !== "SUPER_ADMIN" && !organisationId) {
    return { ok: false, status: 400, message: "organisationId is required" };
  }

  return {
    ok: true,
    body: {
      ...body,
      email: normalizeEmail(body.email),
      name: body.name.trim(),
      organisationId,
      clientSlug: safeTrim(body.clientSlug),
    },
  };
}

/**
 * Server-side admin user provisioning — PostgreSQL only (no Supabase Auth).
 */
export async function provisionAdminUser({ req, body }) {
  if (!PROVISION_SERVER_SIDE_ENABLED) {
    return { ok: false, status: 404, message: "Server-side provisioning is not enabled" };
  }

  const email = body.email;
  const role = body.role;
  const organisationId = body.organisationId;
  const clientSlug = body.clientSlug;
  const active = body.active !== false;

  const { data: existingUser, error: existingErr } = await findUserByEmail(email);
  if (existingErr) return { ok: false, status: 500, message: existingErr.message };

  if (existingUser?.password_hash) {
    let feRow = null;
    if (role === "FIELD_EXECUTIVE" && existingUser.id) {
      const hasFeUserId = await hasPublicColumn("field_executives", "user_id");
      if (hasFeUserId) {
        const { data: fe } = await findFieldExecutiveByUserIdFull(existingUser.id, "id, organisation_id, name");
        feRow = fe ?? null;
      }
    }
    return {
      ok: true,
      status: 200,
      payload: {
        profile: existingUser,
        created: false,
        fieldExecutive: feRow,
      },
    };
  }

  try {
    const passwordHash = await hashPassword(body.password);
    const userPayload = {
      email,
      name: body.name,
      role,
      approval_status: "approved",
      active,
      is_active: active,
      password_hash: passwordHash,
      ...(organisationId ? { organisation_id: organisationId } : {}),
      ...(clientSlug ? { client_slug: clientSlug } : {}),
    };

    let profile = existingUser;
    let createdProfile = false;

    if (existingUser) {
      const { data: updated, error: updErr } = await updateUserById(existingUser.id, userPayload);
      if (updErr) throw Object.assign(new Error(updErr.message), { code: updErr.code });
      profile = updated;
      await prisma.user.update({
        where: { id: existingUser.id },
        data: { passwordHash, passwordChangedAt: new Date() },
      });
    } else {
      const { data: inserted, error: insErr } = await insertUser(userPayload);
      if (insErr) {
        if (insErr.code === "23505") {
          return { ok: false, status: 409, message: "Email already registered" };
        }
        throw Object.assign(new Error(insErr.message), { code: insErr.code });
      }
      profile = inserted;
      createdProfile = true;
      if (profile?.id) {
        await prisma.user.update({
          where: { id: profile.id },
          data: { passwordHash, passwordChangedAt: new Date() },
        });
      }
    }

    let fieldExecutive = null;
    if (role === "FIELD_EXECUTIVE") {
      const hasFeUserId = await hasPublicColumn("field_executives", "user_id");
      const feOpts = body.fieldExecutive ?? {};
      const feName = body.name || email;

      if (!hasFeUserId) {
        return { ok: false, status: 500, message: "field_executives.user_id column is required" };
      }
      const { data: existingFe } = await findFieldExecutiveByUserIdFull(profile.id);
      if (existingFe) {
        fieldExecutive = existingFe;
      } else {
        const fePayload = {
          name: feName,
          email,
          phone: safeTrim(feOpts.phone),
          base_location: normalizeLocation(safeTrim(feOpts.base_location)),
          skills: feOpts.skills ?? null,
          active: feOpts.active !== false,
          organisation_id: organisationId,
          user_id: profile.id,
        };
        const { data: feData, error: feErr } = await insertFieldExecutive(fePayload);
        if (feErr) throw Object.assign(new Error(feErr.message), { code: feErr.code });
        fieldExecutive = feData;
      }
    }

    const auditOrgId = organisationId ?? profile?.organisation_id ?? null;
    void insertAuditLog({
      req,
      entity_type: "user",
      entity_id: profile.id,
      action: "user_created",
      organisation_id: auditOrgId,
      metadata: { email: redactEmail(email), role, created: createdProfile, auth: "local" },
    });

    if (role === "CLIENT") {
      void insertAuditLog({
        req,
        entity_type: "user",
        entity_id: profile.id,
        action: "client_user_created",
        organisation_id: auditOrgId,
        client_slug: clientSlug,
        metadata: { email: redactEmail(email), client_slug: clientSlug },
      });
    }

    if (fieldExecutive?.id) {
      void insertAuditLog({
        req,
        entity_type: "field_executive",
        entity_id: fieldExecutive.id,
        action: "field_executive_created",
        organisation_id: auditOrgId,
        metadata: { name: fieldExecutive.name, user_id: profile.id },
      });
    }

    logEvent("userProvisioning.admin.success", {
      actorUserId: req.appUser?.id ?? null,
      createdUserId: profile?.id ?? null,
      created: createdProfile,
      email: redactEmail(email),
    });

    return {
      ok: true,
      status: 200,
      payload: {
        profile,
        created: createdProfile,
        fieldExecutive,
      },
    };
  } catch (err) {
    logEvent("userProvisioning.admin.failed", {
      email: redactEmail(email),
      message: err?.message ?? String(err),
    });
    return { ok: false, status: 500, message: err?.message || "Provisioning failed" };
  }
}
