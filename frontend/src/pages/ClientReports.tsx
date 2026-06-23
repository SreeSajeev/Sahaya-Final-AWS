import { DashboardFooter } from "@/pages/ClientDashboard";
import Analytics from "@/pages/Analytics";
import { ClientPortalBackground } from "@/components/layout/ClientPortalShell";

/**
 * Client Dashboard Reports: same analytics as Service Manager (charts, CSV export, metrics)
 * but scoped to the signed-in client (user.client_slug). Client selector and admin
 * controls are hidden by Analytics when role is CLIENT. No backend changes.
 */
export default function ClientReports() {
  return (
    <ClientPortalBackground>
      <section className="min-w-0 overflow-x-hidden py-2 md:py-4">
        <Analytics clientReportsMode />
      </section>
      <DashboardFooter />
    </ClientPortalBackground>
  );
}
