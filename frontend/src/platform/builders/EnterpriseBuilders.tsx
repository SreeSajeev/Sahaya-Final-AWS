/**
 * Shared pattern for Assignment / Notification / Automation / Dashboard / Report / AI / Plugin builders.
 */
import { useEffect, useState } from "react";
import {
  listBuilderArtifacts,
  upsertBuilderArtifact,
  publishArtifactVersion,
  fetchRegistryCatalog,
  resolveAssignment,
  renderNotificationPreview,
  simulateAutomation,
  runPlatformReport,
  bindPlatformDashboard,
  validateWebhookConfig,
} from "../lib/platformApi";
import { BuilderShell, BuilderButton, EmptyBuilderState } from "../shared/BuilderShell";
import { VersionPanel, downloadJson, parseImportFile } from "../shared/VersionPanel";

type Row = { id: string; key: string; name: string };

export function AssignmentBuilderPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [key, setKey] = useState("default_routing");
  const [name, setName] = useState("Default routing");
  const [rules, setRules] = useState({
    rules: [
      { strategy: "least_loaded", priority: 1 },
      { strategy: "skill_based", priority: 2, config: { skill: "pump" } },
      { strategy: "round_robin", priority: 3 },
      { strategy: "location_based", priority: 4, config: { field: "location" } },
    ],
    businessHours: { timezone: "Asia/Kolkata", days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" },
    fallbackQueue: "general",
    escalation: [{ afterMinutes: 60, strategy: "round_robin" }],
  });
  const [candidates, setCandidates] = useState([
    { id: "u1", name: "Asha", load: 2, skills: ["pump"], location: "BLR" },
    { id: "u2", name: "Ravi", load: 5, skills: ["electrical"], location: "MUM" },
  ]);
  const [result, setResult] = useState("");
  const [message, setMessage] = useState("");
  const [fields, setFields] = useState<string[]>([]);

  useEffect(() => {
    void listBuilderArtifacts("assignments").then((r) => setItems((r as { items?: Row[] }).items || []));
    void fetchRegistryCatalog()
      .then((r) => setFields(((r as { assignmentFields?: { internalName: string }[] }).assignmentFields || []).map((f) => f.internalName)))
      .catch(() => undefined);
  }, []);

  return (
    <BuilderShell
      title="Assignment Builder"
      subtitle="Visual routing — round robin, workload, skills, location, hours, escalation, simulation"
      toolbar={
        <>
          <BuilderButton
            onClick={async () => {
              await upsertBuilderArtifact("assignments", { key, name, rules });
              await publishArtifactVersion("assignment", key, rules);
              setMessage("Published");
            }}
          >
            Publish
          </BuilderButton>
          <BuilderButton
            variant="ghost"
            onClick={async () => {
              const r = (await resolveAssignment(rules, { location: "BLR" }, candidates)) as { assigneeId?: string };
              setResult(`Assignee: ${r.assigneeId}`);
            }}
          >
            Simulate
          </BuilderButton>
        </>
      }
      sidebar={<VersionPanel artifactType="assignment" artifactKey={key} onLoadSnapshot={(s) => setRules(s as typeof rules)} />}
    >
      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <input className="rounded border px-2 py-1.5 text-sm" value={key} onChange={(e) => setKey(e.target.value)} />
        <input className="rounded border px-2 py-1.5 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border bg-white p-3">
          <h3 className="text-sm font-semibold">Rules (priority order)</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {rules.rules.map((r, i) => (
              <li key={i} className="rounded border px-2 py-2">
                <div className="flex justify-between">
                  <span className="font-medium">{r.strategy}</span>
                  <span className="text-xs text-slate-500">P{r.priority}</span>
                </div>
                {"config" in r && r.config ? <pre className="mt-1 text-xs text-slate-500">{JSON.stringify(r.config)}</pre> : null}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">Registry routing fields: {fields.join(", ") || "(publish a form first)"}</p>
          <label className="mt-2 block text-xs">Fallback queue
            <input className="ml-2 rounded border px-2 py-1" value={rules.fallbackQueue} onChange={(e) => setRules({ ...rules, fallbackQueue: e.target.value })} />
          </label>
        </div>
        <div className="rounded-lg border bg-white p-3">
          <h3 className="text-sm font-semibold">Candidates</h3>
          <textarea
            className="mt-2 w-full rounded border p-2 font-mono text-xs"
            rows={10}
            value={JSON.stringify(candidates, null, 2)}
            onChange={(e) => {
              try {
                setCandidates(JSON.parse(e.target.value));
              } catch {
                /* typing */
              }
            }}
          />
          <p className="mt-2 text-sm text-emerald-700">{result}</p>
        </div>
      </div>
      {message ? <p className="mt-2 text-sm text-amber-800">{message}</p> : null}
      {!items.length ? <p className="mt-2 text-xs text-slate-500">No saved assignment configs yet — Publish to create.</p> : null}
    </BuilderShell>
  );
}

export function NotificationBuilderPage() {
  const [key, setKey] = useState("ticket_assigned");
  const [name, setName] = useState("Ticket assigned");
  const [channel, setChannel] = useState("email");
  const [subject, setSubject] = useState("Ticket {{ticket.number}} assigned");
  const [bodyHtml, setBodyHtml] = useState("<p>Hello {{assignee.name}}, ticket <b>{{ticket.number}}</b> needs you.</p>");
  const [bodyText, setBodyText] = useState("Hello {{assignee.name}}, ticket {{ticket.number}} needs you.");
  const [vars, setVars] = useState({ ticket: { number: "MD-100" }, assignee: { name: "Asha" } });
  const [preview, setPreview] = useState("");
  const [variables, setVariables] = useState<{ path: string; label: string }[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void fetchRegistryCatalog()
      .then((r) => setVariables((r as { notificationVariables?: { path: string; label: string }[] }).notificationVariables || []))
      .catch(() => undefined);
  }, []);

  const template = { channel, subject, body_html: bodyHtml, body_text: bodyText };

  return (
    <BuilderShell
      title="Notification Builder"
      subtitle="Email / SMS / WhatsApp / Push / Slack / Teams / Webhook — variables from Metadata Registry"
      toolbar={
        <>
          <BuilderButton
            onClick={async () => {
              await upsertBuilderArtifact("notifications", { key, name, channel, template, trigger: { event: "ticket.assigned" } });
              await publishArtifactVersion("notification", key, { channel, template, trigger: { event: "ticket.assigned" } });
              setMessage("Published");
            }}
          >
            Publish
          </BuilderButton>
          <BuilderButton
            variant="ghost"
            onClick={async () => {
              const r = (await renderNotificationPreview(template, vars)) as { subject?: string; bodyHtml?: string };
              setPreview(`${r.subject}\n\n${r.bodyHtml}`);
            }}
          >
            Preview / Test render
          </BuilderButton>
          <BuilderButton variant="ghost" onClick={() => downloadJson(`${key}.notification.json`, template)}>
            Export
          </BuilderButton>
        </>
      }
      sidebar={
        <div className="rounded-lg border bg-white p-2 text-xs">
          <p className="font-semibold uppercase text-slate-500">Variables</p>
          <ul className="mt-1 max-h-64 space-y-1 overflow-auto">
            {variables.map((v) => (
              <li key={v.path}>
                <button
                  type="button"
                  className="text-left text-blue-700 hover:underline"
                  onClick={() => setBodyHtml((b) => `${b} {{${v.path.replace("ticket.data.", "")}}}`)}
                >
                  {v.label} <span className="text-slate-400">{v.path}</span>
                </button>
              </li>
            ))}
            {!variables.length && <li className="text-slate-500">Publish a form to populate variables</li>}
          </ul>
          <VersionPanel artifactType="notification" artifactKey={key} />
        </div>
      }
    >
      <div className="mb-3 flex flex-wrap gap-2">
        {["email", "sms", "whatsapp", "push", "slack", "teams", "webhook"].map((c) => (
          <BuilderButton key={c} variant={channel === c ? "primary" : "ghost"} onClick={() => setChannel(c)}>
            {c}
          </BuilderButton>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <input className="w-full rounded border px-2 py-1.5 text-sm" value={key} onChange={(e) => setKey(e.target.value)} />
          <input className="w-full rounded border px-2 py-1.5 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="w-full rounded border px-2 py-1.5 text-sm" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <textarea className="w-full rounded border px-2 py-1.5 font-mono text-xs" rows={8} value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} />
          <textarea className="w-full rounded border px-2 py-1.5 text-sm" rows={4} value={bodyText} onChange={(e) => setBodyText(e.target.value)} />
        </div>
        <div className="rounded-lg border bg-white p-3">
          <p className="text-sm font-semibold">Preview (escaped)</p>
          <pre className="mt-2 whitespace-pre-wrap text-xs">{preview || "Render to preview"}</pre>
        </div>
      </div>
      {message ? <p className="mt-2 text-sm text-amber-800">{message}</p> : null}
    </BuilderShell>
  );
}

export function AutomationBuilderPage() {
  const [key, setKey] = useState("high_priority_queue");
  const [definition, setDefinition] = useState({
    id: "high_priority_queue",
    trigger: { type: "ticket.created" },
    condition: { field: "priority", equals: "HIGH" },
    actions: [
      { type: "field_update", config: { field: "queue", value: "P1" } },
      { type: "notify", config: { templateKey: "ticket_assigned" } },
    ],
  });
  const [plan, setPlan] = useState("");
  const [message, setMessage] = useState("");

  return (
    <BuilderShell
      title="Automation Builder"
      subtitle="Triggers → conditions → actions with simulation, retries, and loop protection"
      toolbar={
        <>
          <BuilderButton
            onClick={async () => {
              await upsertBuilderArtifact("automations", { key, name: key, definition });
              await publishArtifactVersion("automation", key, definition);
              setMessage("Published");
            }}
          >
            Publish
          </BuilderButton>
          <BuilderButton
            variant="ghost"
            onClick={async () => {
              const r = await simulateAutomation(definition, { event: "ticket.created", data: { priority: "HIGH" }, ticketId: "sim-1" });
              setPlan(JSON.stringify(r, null, 2));
            }}
          >
            Simulate
          </BuilderButton>
        </>
      }
      sidebar={<VersionPanel artifactType="automation" artifactKey={key} onLoadSnapshot={(s) => setDefinition(s as typeof definition)} />}
    >
      <textarea
        className="min-h-[320px] w-full rounded-lg border p-3 font-mono text-xs"
        value={JSON.stringify(definition, null, 2)}
        onChange={(e) => {
          try {
            setDefinition(JSON.parse(e.target.value));
          } catch {
            /* */
          }
        }}
      />
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        {["ticket.created", "ticket.updated", "ticket.assigned", "timer.elapsed"].map((t) => (
          <BuilderButton key={t} variant="ghost" onClick={() => setDefinition({ ...definition, trigger: { type: t } })}>
            Trigger: {t}
          </BuilderButton>
        ))}
      </div>
      <pre className="mt-3 max-h-48 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-100">{plan || "Simulation output"}</pre>
      {message ? <p className="mt-2 text-sm text-amber-800">{message}</p> : null}
    </BuilderShell>
  );
}

export function DashboardBuilderPage() {
  const [key, setKey] = useState("ops_home");
  const [layout, setLayout] = useState({
    widgets: [
      { type: "kpi", title: "Total", id: "w1" },
      { type: "chart", title: "By status", id: "w2", chartType: "bar" },
      { type: "table", title: "Recent", id: "w3" },
      { type: "gauge", title: "Open ratio", id: "w4" },
    ],
  });
  const [bound, setBound] = useState("");
  const [message, setMessage] = useState("");

  return (
    <BuilderShell
      title="Dashboard Builder"
      subtitle="Drag-style widget layout — KPI, charts, tables, gauges (bound via Metadata runtime)"
      toolbar={
        <>
          <BuilderButton
            onClick={async () => {
              await upsertBuilderArtifact("dashboards", { key, name: key, layout });
              await publishArtifactVersion("dashboard", key, layout);
              setMessage("Published");
            }}
          >
            Publish
          </BuilderButton>
          <BuilderButton
            variant="ghost"
            onClick={async () => {
              const r = await bindPlatformDashboard(layout, {});
              setBound(JSON.stringify(r, null, 2));
            }}
          >
            Bind preview
          </BuilderButton>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap gap-2">
        {["kpi", "chart", "table", "gauge", "map", "heatmap", "timeline", "calendar", "pivot"].map((t) => (
          <BuilderButton
            key={t}
            variant="ghost"
            onClick={() =>
              setLayout({
                widgets: [...layout.widgets, { type: t, title: t, id: `w_${Date.now()}` }],
              })
            }
          >
            + {t}
          </BuilderButton>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {layout.widgets.map((w) => (
          <div key={w.id} className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-xs uppercase text-slate-500">{w.type}</p>
            <p className="font-medium">{w.title}</p>
            <button
              type="button"
              className="mt-2 text-xs text-red-600"
              onClick={() => setLayout({ widgets: layout.widgets.filter((x) => x.id !== w.id) })}
            >
              Remove
            </button>
          </div>
        ))}
        {!layout.widgets.length && <EmptyBuilderState title="Add widgets" hint="KPI, charts, tables…" />}
      </div>
      <pre className="mt-3 max-h-40 overflow-auto rounded bg-slate-50 p-2 text-xs">{bound}</pre>
      {message ? <p className="mt-2 text-sm text-amber-800">{message}</p> : null}
    </BuilderShell>
  );
}

export function ReportBuilderPage() {
  const [key, setKey] = useState("open_tickets");
  const [columns, setColumns] = useState<{ field_key: string; label: string }[]>([]);
  const [result, setResult] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void fetchRegistryCatalog()
      .then((r) => {
        const cols = (r as { reportColumns?: { field_key: string; label: string }[] }).reportColumns || [];
        setColumns(cols.length ? cols.slice(0, 8) : [{ field_key: "status_key", label: "Status" }]);
      })
      .catch(() => setColumns([{ field_key: "status_key", label: "Status" }]));
  }, []);

  const definition = { columns, sort: [{ field: "ticket_number", dir: "desc" }], format: "json" };

  return (
    <BuilderShell
      title="Report Builder"
      subtitle="No-SQL reports from Metadata Registry columns — CSV / Excel / PDF export hooks"
      toolbar={
        <>
          <BuilderButton
            onClick={async () => {
              await upsertBuilderArtifact("reports", { key, name: key, definition });
              await publishArtifactVersion("report", key, definition);
              setMessage("Published");
            }}
          >
            Publish
          </BuilderButton>
          <BuilderButton
            variant="ghost"
            onClick={async () => {
              const r = await runPlatformReport(definition);
              setResult(JSON.stringify(r, null, 2));
            }}
          >
            Run
          </BuilderButton>
          <BuilderButton
            variant="ghost"
            onClick={() => {
              const blob = new Blob([result || ""], { type: "text/csv" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `${key}.csv`;
              a.click();
            }}
          >
            Export CSV
          </BuilderButton>
        </>
      }
    >
      <ul className="space-y-1 text-sm">
        {columns.map((c, i) => (
          <li key={i} className="flex gap-2 rounded border bg-white px-2 py-1">
            <span className="font-mono text-xs">{c.field_key}</span>
            <span>{c.label}</span>
          </li>
        ))}
      </ul>
      <pre className="mt-3 max-h-64 overflow-auto rounded bg-slate-900 p-3 text-xs text-slate-100">{result || "Run report"}</pre>
      {message ? <p className="mt-2 text-sm text-amber-800">{message}</p> : null}
    </BuilderShell>
  );
}

export function AiBuilderPage() {
  const [key, setKey] = useState("extract_incident");
  const [config, setConfig] = useState({
    provider: "stub",
    prompt: "Extract title, priority, location from text.",
    threshold: 80,
    fallbackPrompt: "Return empty fields if unsure.",
    tasks: ["extraction", "classification", "summarization"],
  });
  const [message, setMessage] = useState("");

  return (
    <BuilderShell
      title="AI Builder"
      subtitle="Prompt editor, confidence thresholds, provider abstraction, versioning"
      toolbar={
        <BuilderButton
          onClick={async () => {
            await upsertBuilderArtifact("ai", { key, name: key, config });
            await publishArtifactVersion("ai", key, config);
            setMessage("Published");
          }}
        >
          Publish
        </BuilderButton>
      }
      sidebar={<VersionPanel artifactType="ai" artifactKey={key} onLoadSnapshot={(s) => setConfig(s as typeof config)} />}
    >
      <div className="space-y-2">
        <input className="w-full rounded border px-2 py-1.5 text-sm" value={key} onChange={(e) => setKey(e.target.value)} />
        <select className="rounded border px-2 py-1.5 text-sm" value={config.provider} onChange={(e) => setConfig({ ...config, provider: e.target.value })}>
          <option value="stub">Stub (deterministic)</option>
          <option value="openai">OpenAI</option>
          <option value="azure">Azure OpenAI</option>
          <option value="bedrock">AWS Bedrock</option>
        </select>
        <textarea className="w-full rounded border p-2 text-sm" rows={6} value={config.prompt} onChange={(e) => setConfig({ ...config, prompt: e.target.value })} />
        <textarea className="w-full rounded border p-2 text-sm" rows={3} value={config.fallbackPrompt} onChange={(e) => setConfig({ ...config, fallbackPrompt: e.target.value })} />
        <label className="text-sm">Confidence threshold
          <input type="number" className="ml-2 w-20 rounded border px-2 py-1" value={config.threshold} onChange={(e) => setConfig({ ...config, threshold: Number(e.target.value) })} />
        </label>
      </div>
      {message ? <p className="mt-2 text-sm text-amber-800">{message}</p> : null}
    </BuilderShell>
  );
}

export function PluginBuilderPage() {
  const [key, setKey] = useState("crm_webhook");
  const [config, setConfig] = useState({
    auth: { type: "api_key", header: "X-Api-Key" },
    webhook: { url: "https://example.com/hooks/sahaya", secretRef: "PLUGIN_SECRET" },
    rest: { baseUrl: "https://api.example.com", timeoutMs: 5000, retries: 3 },
    graphql: { endpoint: "" },
  });
  const [validation, setValidation] = useState("");
  const [message, setMessage] = useState("");

  return (
    <BuilderShell
      title="Plugin Builder"
      subtitle="OAuth / API keys / webhooks / REST / GraphQL — retry, logging, marketplace packaging"
      toolbar={
        <>
          <BuilderButton
            onClick={async () => {
              await upsertBuilderArtifact("plugins", { key, name: key, config });
              await publishArtifactVersion("plugin", key, config);
              setMessage("Published");
            }}
          >
            Publish
          </BuilderButton>
          <BuilderButton
            variant="ghost"
            onClick={async () => {
              const r = await validateWebhookConfig({ url: config.webhook.url });
              setValidation(JSON.stringify(r, null, 2));
            }}
          >
            Validate webhook
          </BuilderButton>
          <BuilderButton variant="ghost" onClick={() => downloadJson(`${key}.plugin.json`, config)}>
            Package
          </BuilderButton>
          <label className="cursor-pointer rounded-md border px-3 py-1.5 text-sm">
            Import
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setConfig((await parseImportFile(f)) as typeof config);
              }}
            />
          </label>
        </>
      }
    >
      <textarea
        className="min-h-[280px] w-full rounded-lg border p-3 font-mono text-xs"
        value={JSON.stringify(config, null, 2)}
        onChange={(e) => {
          try {
            setConfig(JSON.parse(e.target.value));
          } catch {
            /* */
          }
        }}
      />
      <pre className="mt-3 text-xs text-slate-600">{validation}</pre>
      {message ? <p className="mt-2 text-sm text-amber-800">{message}</p> : null}
    </BuilderShell>
  );
}
