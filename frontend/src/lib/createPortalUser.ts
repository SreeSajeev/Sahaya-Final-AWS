import { createAdminUser } from "@/lib/createAdminUser";
import type { UserRole } from "@/lib/types";

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

export type CreatePortalUserInput = {
  name: string;
  email: string;
  password: string;
  organisationId: string;
  clientSlug: string;
};

/**
 * Provision a CLIENT portal user for a tenant_clients row via existing admin provisioning.
 */
export async function createPortalUser(
  signUp: SignUpFn,
  input: CreatePortalUserInput
): Promise<{ error: Error | null }> {
  return createAdminUser(signUp, {
    email: input.email.trim(),
    password: input.password,
    name: input.name.trim(),
    role: "CLIENT",
    organisationId: input.organisationId,
    clientSlug: input.clientSlug.trim(),
    active: true,
  });
}
