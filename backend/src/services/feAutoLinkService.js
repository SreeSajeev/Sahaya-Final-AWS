import { supabase } from "../supabaseClient.js";
import { hasPublicColumn } from "./schemaCompatService.js";

export function normalizeFeEmail(email) {
  return email ? String(email).trim().toLowerCase() : "";
}

/**
 * Attempt to link an orphan field_executives row to the logged-in app user by email + org.
 * Only mutates when user_id IS NULL and exactly one FE matches.
 *
 * @returns {Promise<string | null>} field_executives.id when linked, else null
 */
export async function attemptFeAutoLink({ appUser, authUserId }) {
  if (appUser?.role !== "FIELD_EXECUTIVE") return null;

  const appUserId = appUser?.id ? String(appUser.id) : null;
  const email = normalizeFeEmail(appUser?.email);
  const organisationId = appUser?.organisation_id ? String(appUser.organisation_id) : null;

  if (!appUserId || !email || !organisationId) return null;

  const hasFeUserId = await hasPublicColumn("field_executives", "user_id");
  if (!hasFeUserId) return null;

  const { data: candidates, error } = await supabase
    .from("field_executives")
    .select("id, email, user_id, organisation_id")
    .eq("organisation_id", organisationId)
    .is("user_id", null)
    .not("email", "is", null);

  if (error) {
    console.warn("[FE_AUTO_LINK] lookup failed", { message: error.message, email, organisationId });
    return null;
  }

  const matches = (candidates ?? []).filter((fe) => normalizeFeEmail(fe.email) === email);

  if (matches.length === 0) return null;

  if (matches.length > 1) {
    console.warn(
      "[FE_AUTO_LINK_SKIPPED_DUPLICATE_EMAIL]",
      JSON.stringify({ email, organisationId, count: matches.length })
    );
    return null;
  }

  const fe = matches[0];
  const patch = { user_id: appUserId };

  const hasAuthUserId = await hasPublicColumn("field_executives", "auth_user_id");
  if (hasAuthUserId && authUserId) {
    patch.auth_user_id = String(authUserId);
  }

  const { data: updated, error: updErr } = await supabase
    .from("field_executives")
    .update(patch)
    .eq("id", fe.id)
    .is("user_id", null)
    .select("id")
    .maybeSingle();

  if (updErr) {
    console.warn("[FE_AUTO_LINK] update failed", { message: updErr.message, feId: fe.id, email });
    return null;
  }

  if (!updated?.id) return null;

  console.log("[FE_AUTO_LINK]", JSON.stringify({ feId: updated.id, userId: appUserId, email }));

  return updated.id;
}

/**
 * Read-only diagnostic report for field_executives ↔ users linkage.
 * @returns {Promise<{ items: object[] }>}
 */
export async function buildFeLinkAuditReport() {
  const { data: fes, error: feErr } = await supabase
    .from("field_executives")
    .select("id, name, email, user_id, organisation_id")
    .order("name", { ascending: true });

  if (feErr) throw Object.assign(new Error(feErr.message), { code: feErr.code });

  const { data: feUsers, error: userErr } = await supabase
    .from("users")
    .select("id, email, organisation_id, role")
    .eq("role", "FIELD_EXECUTIVE");

  if (userErr) throw Object.assign(new Error(userErr.message), { code: userErr.code });

  const usersByOrgEmail = new Map();
  for (const u of feUsers ?? []) {
    const key = `${String(u.organisation_id ?? "")}:${normalizeFeEmail(u.email)}`;
    if (!key.endsWith(":") && normalizeFeEmail(u.email)) {
      const list = usersByOrgEmail.get(key) ?? [];
      list.push(u);
      usersByOrgEmail.set(key, list);
    }
  }

  const items = (fes ?? []).map((fe) => {
    const linked = fe.user_id != null && String(fe.user_id).length > 0;

    let usersId = linked ? String(fe.user_id) : null;
    if (!usersId && fe.email && fe.organisation_id) {
      const key = `${String(fe.organisation_id)}:${normalizeFeEmail(fe.email)}`;
      const emailMatches = usersByOrgEmail.get(key) ?? [];
      if (emailMatches.length === 1) {
        usersId = String(emailMatches[0].id);
      }
    }

    return {
      fe_id: fe.id,
      fe_name: fe.name ?? null,
      email: fe.email ?? null,
      linked,
      user_id: fe.user_id ?? null,
      users_id: usersId,
    };
  });

  return { items };
}



