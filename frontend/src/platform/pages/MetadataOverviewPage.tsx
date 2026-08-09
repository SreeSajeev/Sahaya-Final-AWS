import { Link } from "react-router-dom";
import { usePlatformSettings } from "../hooks/usePlatformSettings";

const BUILDERS = [
  { to: "/app/metadata/forms", title: "Form Builder", blurb: "Visual layout, 50+ fields, formulas, preview, templates" },
  { to: "/app/metadata/workflows", title: "Workflow Builder", blurb: "Canvas states, transitions, cycle analysis" },
  { to: "/app/metadata/email-parser", title: "Email Parser", blurb: "Regex/keyword/sender mapping + live preview" },
  { to: "/app/metadata/assignments", title: "Assignment", blurb: "Routing strategies + simulation" },
  { to: "/app/metadata/notifications", title: "Notifications", blurb: "Multi-channel templates + registry variables" },
  { to: "/app/metadata/automations", title: "Automations", blurb: "Trigger → condition → action with loop guards" },
  { to: "/app/metadata/dashboards", title: "Dashboards", blurb: "Widget layout bound to runtime KPIs" },
  { to: "/app/metadata/reports", title: "Reports", blurb: "No-SQL columns from Metadata Registry" },
  { to: "/app/metadata/ai", title: "AI", blurb: "Prompts, thresholds, provider abstraction" },
  { to: "/app/metadata/plugins", title: "Plugins", blurb: "Webhooks, REST, secrets packaging" },
];

export default function MetadataOverviewPage() {
  const { data } = usePlatformSettings();
  const mode = (data as { mode?: string } | undefined)?.mode ?? "LEGACY";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Metadata Platform</h2>
        <p className="mt-1 text-sm text-slate-600">
          Enterprise no-code service management for <strong>METADATA</strong> tenants. LEGACY Sahaya is untouched
          (current mode: {mode}).
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {BUILDERS.map((b) => (
          <Link
            key={b.to}
            to={b.to}
            className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-400 hover:shadow-sm"
          >
            <p className="font-medium text-slate-900">{b.title}</p>
            <p className="mt-1 text-sm text-slate-600">{b.blurb}</p>
          </Link>
        ))}
      </div>
      <Link to="/app/metadata/runtime" className="inline-flex text-sm font-medium text-blue-700 hover:underline">
        Open Metadata runtime →
      </Link>
    </div>
  );
}
