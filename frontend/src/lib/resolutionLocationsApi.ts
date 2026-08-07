import { fetchJson } from "@/lib/backendDataApi";
export type ResolutionLocation = { id: string; organisation_id: string; name: string; code: string | null; description: string | null; is_active: boolean };
export const listResolutionLocations = (activeOnly = false) =>
  fetchJson<ResolutionLocation[]>(`/data/resolution-locations?${activeOnly ? "active_only=true" : ""}`);
export const createResolutionLocation = (body: Partial<ResolutionLocation>) =>
  fetchJson<ResolutionLocation>("/data/resolution-locations", { method: "POST", body });
export const updateResolutionLocation = (id: string, body: Partial<ResolutionLocation>) =>
  fetchJson<ResolutionLocation>(`/data/resolution-locations/${id}`, { method: "PATCH", body });
