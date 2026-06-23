import { fetchJson } from "@/lib/backendDataApi";
import { isProvisionServerSideEnabled } from "@/lib/provisionServerSideFeature";
import type { UserRole } from "@/hooks/useAuth";

export type AdminProvisionFieldExecutive = {
  phone?: string | null;
  base_location?: string | null;
  skills?: Record<string, unknown> | null;
  active?: boolean;
};

export type CreateAdminUserInput = {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  organisationId?: string | null;
  clientSlug?: string | null;
  active?: boolean;
  fieldExecutive?: AdminProvisionFieldExecutive;
};

type SignUpResult = {
  data?: { user: { id: string } };
  error: Error | null;
};

type SignUpFn = (
  email: string,
  password: string,
  name: string,
  role: UserRole,
  organisationId?: string | null
) => Promise<SignUpResult>;

/**
 * Admin-created users: server provision when flag on, otherwise legacy browser signUp (+ FE row).
 */
export async function createAdminUser(
  signUp: SignUpFn,
  input: CreateAdminUserInput
): Promise<{ error: Error | null }> {
  if (isProvisionServerSideEnabled()) {
    try {
      await fetchJson("/auth/provision/admin", {
        method: "POST",
        body: {
          email: input.email.trim(),
          password: input.password,
          name: input.name.trim(),
          role: input.role,
          organisationId: input.organisationId ?? null,
          clientSlug: input.clientSlug ?? null,
          active: input.active,
          fieldExecutive: input.fieldExecutive,
        },
      });
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error("Provisioning failed") };
    }
  }

  const { data, error } = await signUp(
    input.email.trim(),
    input.password,
    input.name.trim(),
    input.role,
    input.organisationId ?? undefined
  );
  if (error) return { error };

  if (input.role === "FIELD_EXECUTIVE" && data?.user?.id && input.organisationId) {
    try {
      await fetchJson("/field-executives", {
        method: "POST",
        body: {
          user_id: data.user.id,
          organisation_id: input.organisationId,
          name: input.name.trim() || input.email.trim(),
          email: input.email.trim(),
          phone: input.fieldExecutive?.phone ?? null,
          base_location: input.fieldExecutive?.base_location ?? null,
          skills: input.fieldExecutive?.skills ?? null,
          active: input.fieldExecutive?.active !== false,
        },
      });
    } catch (feErr) {
      return {
        error: feErr instanceof Error ? feErr : new Error("User created; field executive link failed"),
      };
    }
  }

  return { error: null };
}
