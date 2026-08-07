import { fetchJson, getAccessToken, crmApiUrl } from "@/lib/backendDataApi";

export type ResolutionLocation = {
  id: string;
  organisation_id: string;
  name: string;
  code: string | null;
  description: string | null;
  is_active: boolean;
};

export const listResolutionLocations = (activeOnly = false, search = "") => {
  const params = new URLSearchParams();
  if (activeOnly) params.set("active_only", "true");
  if (search.trim()) params.set("search", search.trim());
  const qs = params.toString();
  return fetchJson<ResolutionLocation[]>(`/data/resolution-locations${qs ? `?${qs}` : ""}`);
};

export const createResolutionLocation = (body: Partial<ResolutionLocation>) =>
  fetchJson<ResolutionLocation>("/data/resolution-locations", { method: "POST", body });

export const updateResolutionLocation = (id: string, body: Partial<ResolutionLocation>) =>
  fetchJson<ResolutionLocation>(`/data/resolution-locations/${id}`, { method: "PATCH", body });

/** Authenticated CSV download (window.open would drop Bearer and 401). */
export async function downloadResolutionLocationsCsv(): Promise<void> {
  const token = await getAccessToken();
  const res = await fetch(crmApiUrl("/data/resolution-locations/export"), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Export failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "resolution-locations.csv";
  a.click();
  URL.revokeObjectURL(url);
}
