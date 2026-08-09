import { Link, Outlet, useLocation } from "react-router-dom";
import { usePlatformSettings } from "../hooks/usePlatformSettings";

const NAV = [
  { to: "/app/metadata", label: "Overview", end: true },
  { to: "/app/metadata/forms", label: "Forms" },
  { to: "/app/metadata/workflows", label: "Workflows" },
  { to: "/app/metadata/email-parser", label: "Email Parser" },
  { to: "/app/metadata/assignments", label: "Assignments" },
  { to: "/app/metadata/notifications", label: "Notifications" },
  { to: "/app/metadata/automations", label: "Automations" },
  { to: "/app/metadata/dashboards", label: "Dashboards" },
  { to: "/app/metadata/reports", label: "Reports" },
  { to: "/app/metadata/ai", label: "AI" },
  { to: "/app/metadata/plugins", label: "Plugins" },
  { to: "/app/metadata/runtime", label: "Runtime" },
  { to: "/app/metadata/runtime/create", label: "New Ticket" },
  { to: "/app/metadata/settings", label: "Settings" },
];

/**
 * Isolated Metadata Platform shell. Not used by LEGACY Sahaya pages.
 */
export default function MetadataPlatformLayout() {
  const location = useLocation();
  const { data, isLoading } = usePlatformSettings();
  const mode = (data as { mode?: string } | undefined)?.mode ?? "LEGACY";
  const active = mode === "METADATA";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Sahaya V2 · Metadata Platform Layer
          </p>
          <h1 className="text-xl font-semibold">Enterprise configuration builders</h1>
          <p className="text-sm text-slate-600">
            Mode:{" "}
            <span className={active ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>
              {isLoading ? "…" : mode}
            </span>
            {!active && (
              <span className="ml-2 text-slate-500">
                — LEGACY tenants keep using existing Sahaya unchanged. Enable METADATA only for new tenants.
              </span>
            )}
          </p>
        </div>
      </header>
      <div className="mx-auto flex max-w-[1400px] gap-6 px-6 py-6">
        <nav className="w-44 shrink-0 space-y-0.5">
          {NAV.map((item) => {
            const isActive = item.end
              ? location.pathname === item.to
              : location.pathname === item.to || location.pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`block rounded-md px-3 py-1.5 text-sm ${
                  isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-200"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          <Link to="/app" className="mt-4 block px-3 py-2 text-sm text-slate-500 hover:text-slate-800">
            ← Back to Sahaya
          </Link>
        </nav>
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
