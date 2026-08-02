import { fetchJson } from "@/lib/backendDataApi";
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
 * Admin-created users via PostgreSQL-backed /auth/provision/admin (no Supabase Auth).
 */
export async function createAdminUser(
  _signUp: SignUpFn,
  input: CreateAdminUserInput
): Promise<{ error: Error | null }> {
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
