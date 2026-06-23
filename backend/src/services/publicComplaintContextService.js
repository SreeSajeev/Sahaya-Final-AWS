import { supabase } from "../supabaseClient.js";

/**
 * Public-safe complaint point context for QR landing (no internal IDs).
 * @param {string} publicToken
 */
export async function getPublicComplaintPointContext(publicToken) {
  const token = String(publicToken || "").trim();
  if (!token) {
    return { ok: false, status: 404, message: "This link is not available" };
  }

  const { data, error } = await supabase
    .from("tenant_complaint_points")
    .select(
      "name, description, building, floor, site_name, default_client_slug, default_category, default_issue_type, status"
    )
    .eq("public_token", token)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, message: "Failed to load complaint point" };
  }
  if (!data || data.status !== "active") {
    return { ok: false, status: 404, message: "This link is not available" };
  }

  return {
    ok: true,
    data: {
      name: data.name,
      description: data.description ?? null,
      building: data.building ?? null,
      floor: data.floor ?? null,
      site_name: data.site_name ?? null,
      defaults: {
        category: data.default_category ?? null,
        issue_type: data.default_issue_type ?? null,
        client_slug: data.default_client_slug ?? null,
      },
    },
  };
}
