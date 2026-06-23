/** When false, admin user creation keeps browser signUp + legacy FE POST. */
export function isProvisionServerSideEnabled(): boolean {
  return String(import.meta.env.VITE_PROVISION_SERVER_SIDE_ENABLED ?? "").trim().toLowerCase() === "true";
}
