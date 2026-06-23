/** Must match backend `TENANT_CLIENTS_ENABLED=true`. */
export function isTenantClientsEnabled(): boolean {
  return String(import.meta.env.VITE_TENANT_CLIENTS_ENABLED ?? "").trim().toLowerCase() === "true";
}
