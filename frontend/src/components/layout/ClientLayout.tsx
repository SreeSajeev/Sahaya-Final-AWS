import { Outlet } from "react-router-dom";
import { ClientHeader } from "@/pages/ClientDashboard";

/**
 * Client portal layout: top nav only (Dashboard | Reports | Support | Log out).
 * No operations sidebar. Same background and content area as staff layout.
 */
export function ClientLayout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <ClientHeader />
      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pt-16 scrollbar-thin bg-[hsl(30_5%_98%)]">
        <Outlet />
      </main>
    </div>
  );
}
