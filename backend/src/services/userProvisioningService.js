import { z } from "zod";
import { supabase } from "../supabaseClient.js";
import { PROVISION_SERVER_SIDE_ENABLED } from "../config/appConfig.js";
import { sharedSupabaseMutationBlock } from "../security/sharedSupabaseMutationFreeze.js";
import { insertAuditLog } from "./auditLogService.js";
import { hasPublicColumn } from "./schemaCompatService.js";
import { safeTrim } from "../utils/http.js";
import { logEvent } from "../utils/structuredLog.js";
import { redactEmail } from "../utils/redact.js";
import { normalizeLocation } from "../utils/normalizeLocation.js";

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

async function findAuthUserByEmail(email) {
  const normalized = String(email).trim().toLowerCase();
  let page = 1;
  for (let i = 0; i < 10; i++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = data?.users ?? [];
    const found = users.find((u) => (u.email || "").trim().toLowerCase() === normalized);
    if (found) return found;
    if (users.length < 200) break;
    page += 1;
  }
  return null;
}

async function deleteAuthUser(authUserId) {
  if (!authUserId) return;
  const freeze = sharedSupabaseMutationBlock();
  if (freeze) {
    logEvent("userProvisioning.compensateAuthDeleteFrozen", {
      authUserId,
      code: freeze.code,
    });
    return;
  }
  try {
    await supabase.auth.admin.deleteUser(authUserId);
  } catch (err) {
    logEvent("userProvisioning.compensateAuthDeleteFailed", {
      authUserId,
      message: err?.message ?? String(err),
    });
  }
}

function resolveOrganisationId({ role, organisationId }) {
  if (role === "SUPER_ADMIN") return null;
  return organisationId ?? null;
}

/**
 * Authorize and normalize admin provision request.
 * @returns {{ ok: true, body: object } | { ok: false, status: number, message: string }}
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
      email: body.email.trim().toLowerCase(),
      name: body.name.trim(),
      organisationId,
      clientSlug: safeTrim(body.clientSlug),
    },
  };
}

/**
 * Server-side admin user provisioning (auth + public.users + optional FE).
 * Idempotent when public.users row already exists for email with auth_id linked.
 */
export async function provisionAdminUser({ req, body }) {
  if (!PROVISION_SERVER_SIDE_ENABLED) {
    return { ok: false, status: 404, message: "Server-side provisioning is not enabled" };
  }

  const freeze = sharedSupabaseMutationBlock();
  if (freeze) {
    return { ok: false, status: 403, message: freeze.message, code: freeze.code };
  }

  const email = body.email;
  const role = body.role;
  const organisationId = body.organisationId;
  const clientSlug = body.clientSlug;
  const active = body.active !== false;

  const { data: existingUser, error: existingErr } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .maybeSingle();
  if (existingErr) return { ok: false, status: 500, message: existingErr.message };

  if (existingUser?.auth_id) {
    let feRow = null;
    if (role === "FIELD_EXECUTIVE" && existingUser.id) {
      const hasFeUserId = await hasPublicColumn("field_executives", "user_id");
      if (hasFeUserId) {
        const { data: fe } = await supabase
          .from("field_executives")
          .select("id, organisation_id, name")
          .eq("user_id", existingUser.id)
          .maybeSingle();
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
        authUserId: existingUser.auth_id,
      },
    };
  }

  let authUserId = null;
  let createdAuth = false;

  try {
    if (existingUser && !existingUser.auth_id) {
      const authUser = await findAuthUserByEmail(email);
      if (authUser?.id) {
        authUserId = authUser.id;
      } else {
        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
          email,
          password: body.password,
          email_confirm: true,
          user_metadata: {
            name: body.name,
            role,
            ...(organisationId ? { organisation_id: organisationId } : {}),
            ...(clientSlug ? { client_slug: clientSlug } : {}),
            approval_status: "approved",
          },
        });
        if (createErr) {
          const dup =
            createErr.message?.toLowerCase().includes("already") ||
            createErr.code === "user_already_exists";
          if (dup) {
            const again = await findAuthUserByEmail(email);
            if (!again?.id) {
              return { ok: false, status: 409, message: "Email already registered" };
            }
            authUserId = again.id;
          } else {
            return { ok: false, status: 400, message: createErr.message };
          }
        } else {
          authUserId = created?.user?.id ?? null;
          createdAuth = true;
        }
      }
    } else if (!existingUser) {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password: body.password,
        email_confirm: true,
        user_metadata: {
          name: body.name,
          role,
          ...(organisationId ? { organisation_id: organisationId } : {}),
          ...(clientSlug ? { client_slug: clientSlug } : {}),
          approval_status: "approved",
        },
      });
      if (createErr) {
        const dup =
          createErr.message?.toLowerCase().includes("already") ||
          createErr.code === "user_already_exists";
        if (dup) {
          const authUser = await findAuthUserByEmail(email);
          if (!authUser?.id) {
            return { ok: false, status: 409, message: "Email already registered" };
          }
          authUserId = authUser.id;
        } else {
          return { ok: false, status: 400, message: createErr.message };
        }
      } else {
        authUserId = created?.user?.id ?? null;
        createdAuth = true;
      }
    }

    if (!authUserId) {
      return { ok: false, status: 500, message: "Failed to create auth user" };
    }

    const userPayload = {
      auth_id: authUserId,
      email,
      name: body.name,
      role,
      approval_status: "approved",
      active,
      is_active: active,
      ...(organisationId ? { organisation_id: organisationId } : {}),
      ...(clientSlug ? { client_slug: clientSlug } : {}),
    };

    let profile = existingUser;
    let createdProfile = false;

    if (existingUser) {
      const { data: updated, error: updErr } = await supabase
        .from("users")
        .update(userPayload)
        .eq("id", existingUser.id)
        .select("*")
        .single();
      if (updErr) throw Object.assign(new Error(updErr.message), { code: updErr.code });
      profile = updated;
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from("users")
        .insert(userPayload)
        .select("*")
        .single();
      if (insErr) {
        if (insErr.code === "23505") {
          const { data: retry } = await supabase.from("users").select("*").eq("email", email).maybeSingle();
          if (retry) {
            profile = retry;
          } else {
            throw Object.assign(new Error(insErr.message), { code: insErr.code });
          }
        } else {
          throw Object.assign(new Error(insErr.message), { code: insErr.code });
        }
      } else {
        profile = inserted;
        createdProfile = true;
      }
    }

    let fieldExecutive = null;
    if (role === "FIELD_EXECUTIVE") {
      const hasFeUserId = await hasPublicColumn("field_executives", "user_id");
      const feOpts = body.fieldExecutive ?? {};
      const feName = body.name || email;

      if (hasFeUserId) {
        const { data: existingFe } = await supabase
          .from("field_executives")
          .select("*")
          .eq("user_id", profile.id)
          .maybeSingle();
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
          const { data: feData, error: feErr } = await supabase
            .from("field_executives")
            .insert(fePayload)
            .select("*")
            .single();
          if (feErr) throw Object.assign(new Error(feErr.message), { code: feErr.code });
          fieldExecutive = feData;
        }
      } else {
        return { ok: false, status: 500, message: "field_executives.user_id column is required" };
      }
    }

    const auditOrgId = organisationId ?? profile?.organisation_id ?? null;
    void insertAuditLog({
      req,
      entity_type: "user",
      entity_id: profile.id,
      action: "user_created",
      organisation_id: auditOrgId,
      metadata: { email, role, created: createdProfile },
    });

    if (role === "CLIENT") {
      void insertAuditLog({
        req,
        entity_type: "user",
        entity_id: profile.id,
        action: "client_user_created",
        organisation_id: auditOrgId,
        client_slug: clientSlug,
        metadata: { email, client_slug: clientSlug },
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
      userId: profile?.id ?? null,
      role,
      createdProfile,
      createdAuth,
      ms: null,
    });

    return {
      ok: true,
      status: 200,
      payload: {
        profile,
        created: createdProfile || createdAuth,
        fieldExecutive,
        authUserId,
      },
    };
  } catch (err) {
    if (createdAuth && authUserId) {
      await deleteAuthUser(authUserId);
    }
    logEvent("userProvisioning.admin.failed", {
      email: redactEmail(email),
      message: err?.message ?? String(err),
    });
    return { ok: false, status: 500, message: err?.message || "Provisioning failed" };
  }
}
