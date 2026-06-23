/** When false, Ticket Settings UI matches pre-terminology behaviour (extra JSON keys still preserved on save). */
export function isTenantConfigurationEnabled(): boolean {
  return String(import.meta.env.VITE_TENANT_CONFIGURATION_ENABLED ?? "").trim().toLowerCase() === "true";
}
