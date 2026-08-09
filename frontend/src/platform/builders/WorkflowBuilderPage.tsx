/**
 * Visual Workflow Builder — states, transitions, pan/zoom, analyze cycles/deadlocks.
 */
import { useEffect, useMemo, useState } from "react";
import {
  listBuilderArtifacts,
  upsertBuilderArtifact,
  publishArtifactVersion,
  validateWorkflowDefinition,
  analyzeWorkflow,
  fetchRegistryCatalog,
} from "../lib/platformApi";
import { BuilderShell, BuilderButton, EmptyBuilderState } from "../shared/BuilderShell";
import { VersionPanel, downloadJson, parseImportFile } from "../shared/VersionPanel";

type State = { key: string; label?: string; color?: string; icon?: string; terminal?: boolean; x: number; y: number };
type Transition = {
  key: string;
  from: string;
  to: string;
  roles?: string[];
  requirements?: { requireComment?: boolean; requireAttachment?: boolean; requireFields?: string[] };
  conditions?: { field: string; equals: string };
};

type Row = { id: string; key: string; name: string };

const PRESET_STATES = ["DRAFT", "OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING", "ESCALATED", "RESOLVED", "CLOSED", "CANCELLED"];

export default function WorkflowBuilderPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [key, setKey] = useState("default_flow");
  const [name, setName] = useState("Default workflow");
  const [states, setStates] = useState<State[]>([
    { key: "OPEN", label: "Open", color: "#3b82f6", x: 80, y: 120 },
    { key: "ASSIGNED", label: "Assigned", color: "#8b5cf6", x: 320, y: 120 },
    { key: "CLOSED", label: "Closed", color: "#64748b", x: 560, y: 120, terminal: true },
  ]);
  const [transitions, setTransitions] = useState<Transition[]>([
    { key: "assign", from: "OPEN", to: "ASSIGNED", roles: ["ADMIN", "SM"] },
    { key: "close", from: "ASSIGNED", to: "CLOSED", requirements: { requireComment: true } },
  ]);
  const [initialState, setInitialState] = useState("OPEN");
  const [selected, setSelected] = useState<string | null>("OPEN");
  const [selectedTransition, setSelectedTransition] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [message, setMessage] = useState("");
  const [analysis, setAnalysis] = useState<string>("");
  const [registryFields, setRegistryFields] = useState<{ internalName: string; displayLabel: string }[]>([]);
  const [undo, setUndo] = useState<{ states: State[]; transitions: Transition[] }[]>([]);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);

  const definition = useMemo(
    () => ({
      initialState,
      states: states.map(({ key, label, color, icon, terminal }) => ({ key, label, color, icon, terminal })),
      transitions,
    }),
    [states, transitions, initialState]
  );

  useEffect(() => {
    void listBuilderArtifacts("workflows").then((r) => setItems(((r as { items?: Row[] }).items || []) as Row[]));
    void fetchRegistryCatalog()
      .then((r) => setRegistryFields(((r as { fields?: { internalName: string; displayLabel: string }[] }).fields || []).slice(0, 50)))
      .catch(() => undefined);
  }, []);

  function pushUndo() {
    setUndo((u) => [...u.slice(-20), { states: structuredClone(states), transitions: structuredClone(transitions) }]);
  }

  function autoLayout() {
    pushUndo();
    setStates((prev) =>
      prev.map((s, i) => ({
        ...s,
        x: 80 + (i % 4) * 220,
        y: 80 + Math.floor(i / 4) * 140,
      }))
    );
  }

  async function saveAndPublish() {
    try {
      await validateWorkflowDefinition(definition);
      await upsertBuilderArtifact("workflows", { key, name, status: "draft" });
      await publishArtifactVersion("workflow", key, definition);
      setMessage("Workflow published (versioned snapshot)");
      const list = (await listBuilderArtifacts("workflows")) as { items?: Row[] };
      setItems(list.items || []);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    }
  }

  const selectedState = states.find((s) => s.key === selected);
  const selectedTx = transitions.find((t) => t.key === selectedTransition);

  return (
    <BuilderShell
      title="Workflow Builder"
      subtitle="Visual state machine — conditions, approvals, roles, cycle/deadlock analysis"
      toolbar={
        <>
          <BuilderButton onClick={() => void saveAndPublish()}>Publish</BuilderButton>
          <BuilderButton
            variant="ghost"
            onClick={async () => {
              try {
                const r = (await analyzeWorkflow(definition)) as {
                  cycles?: { hasCycle?: boolean; cycles?: unknown[] };
                  deadlocks?: { deadlocks?: string[] };
                };
                setAnalysis(
                  `Cycles: ${r.cycles?.hasCycle ? JSON.stringify(r.cycles.cycles) : "none"} · Deadlocks: ${(r.deadlocks?.deadlocks || []).join(", ") || "none"}`
                );
              } catch (e) {
                setAnalysis(e instanceof Error ? e.message : "Analyze failed");
              }
            }}
          >
            Analyze
          </BuilderButton>
          <BuilderButton variant="ghost" onClick={autoLayout}>
            Auto layout
          </BuilderButton>
          <BuilderButton variant="ghost" onClick={() => setScale((s) => Math.min(2, s + 0.1))}>
            Zoom +
          </BuilderButton>
          <BuilderButton variant="ghost" onClick={() => setScale((s) => Math.max(0.5, s - 0.1))}>
            Zoom −
          </BuilderButton>
          <BuilderButton
            variant="ghost"
            onClick={() => {
              if (!undo.length) return;
              const prev = undo[undo.length - 1];
              setUndo((u) => u.slice(0, -1));
              setStates(prev.states);
              setTransitions(prev.transitions);
            }}
          >
            Undo
          </BuilderButton>
          <BuilderButton variant="ghost" onClick={() => downloadJson(`${key}.workflow.json`, definition)}>
            Export
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
                const data = (await parseImportFile(f)) as {
                  initialState?: string;
                  states?: State[];
                  transitions?: Transition[];
                };
                pushUndo();
                if (data.initialState) setInitialState(data.initialState);
                if (data.states) setStates(data.states.map((s, i) => ({ x: 80 + i * 200, y: 120, ...s })));
                if (data.transitions) setTransitions(data.transitions);
              }}
            />
          </label>
        </>
      }
      sidebar={
        <>
          <div className="rounded-lg border bg-white p-2 text-sm">
            <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Workflows</p>
            {items.map((it) => (
              <button
                key={it.id}
                type="button"
                className="block w-full rounded px-2 py-1 text-left hover:bg-slate-100"
                onClick={() => {
                  setKey(it.key);
                  setName(it.name);
                }}
              >
                {it.name}
              </button>
            ))}
            <div className="mt-2 space-y-1">
              <input className="w-full rounded border px-2 py-1 text-xs" value={key} onChange={(e) => setKey(e.target.value)} />
              <input className="w-full rounded border px-2 py-1 text-xs" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          <div className="rounded-lg border bg-white p-2 text-sm">
            <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Add state</p>
            <div className="flex flex-wrap gap-1">
              {PRESET_STATES.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="rounded border px-1.5 py-0.5 text-[10px]"
                  onClick={() => {
                    if (states.some((x) => x.key === s)) return;
                    pushUndo();
                    setStates((prev) => [...prev, { key: s, label: s, color: "#0f172a", x: 100 + prev.length * 40, y: 200 }]);
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
            <BuilderButton
              variant="ghost"
              onClick={() => {
                const k = `STATE_${states.length + 1}`;
                pushUndo();
                setStates((prev) => [...prev, { key: k, label: k, color: "#059669", x: 120, y: 260 }]);
              }}
            >
              + Custom
            </BuilderButton>
          </div>
          <VersionPanel artifactType="workflow" artifactKey={key} onLoadSnapshot={(snap) => {
            const d = snap as { initialState?: string; states?: State[]; transitions?: Transition[] };
            if (d.states) setStates(d.states.map((s, i) => ({ x: 80 + i * 200, y: 120, ...s })));
            if (d.transitions) setTransitions(d.transitions);
            if (d.initialState) setInitialState(d.initialState);
          }} />
        </>
      }
    >
      <div className="relative h-[420px] overflow-hidden rounded-xl border border-slate-200 bg-[linear-gradient(to_right,#e2e8f022_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f022_1px,transparent_1px)] bg-[size:24px_24px]">
        {!states.length ? (
          <EmptyBuilderState title="Add states to begin" hint="Drag boxes, connect transitions, then Publish." />
        ) : (
          <svg
            className="h-full w-full"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) {
                const start = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
                const move = (ev: MouseEvent) =>
                  setOffset({ x: start.ox + (ev.clientX - start.x), y: start.oy + (ev.clientY - start.y) });
                const up = () => {
                  window.removeEventListener("mousemove", move);
                  window.removeEventListener("mouseup", up);
                };
                window.addEventListener("mousemove", move);
                window.addEventListener("mouseup", up);
              }
            }}
          >
            <g transform={`translate(${offset.x},${offset.y}) scale(${scale})`}>
              {transitions.map((t) => {
                const from = states.find((s) => s.key === t.from);
                const to = states.find((s) => s.key === t.to);
                if (!from || !to) return null;
                const x1 = from.x + 70;
                const y1 = from.y + 28;
                const x2 = to.x + 70;
                const y2 = to.y + 28;
                return (
                  <g key={t.key} onClick={() => setSelectedTransition(t.key)} className="cursor-pointer">
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={selectedTransition === t.key ? "#0f172a" : "#94a3b8"} strokeWidth={2} markerEnd="url(#arrow)" />
                    <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} fontSize={11} fill="#475569" textAnchor="middle">
                      {t.key}
                    </text>
                  </g>
                );
              })}
              <defs>
                <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill="#94a3b8" />
                </marker>
              </defs>
              {states.map((s) => (
                <g
                  key={s.key}
                  transform={`translate(${s.x},${s.y})`}
                  onClick={() => {
                    if (connectFrom && connectFrom !== s.key) {
                      pushUndo();
                      const k = `${connectFrom}_to_${s.key}`.toLowerCase();
                      setTransitions((prev) => [...prev, { key: k, from: connectFrom, to: s.key, roles: ["ADMIN"] }]);
                      setConnectFrom(null);
                    } else setSelected(s.key);
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    const start = { mx: e.clientX, my: e.clientY, x: s.x, y: s.y };
                    const move = (ev: MouseEvent) => {
                      const dx = (ev.clientX - start.mx) / scale;
                      const dy = (ev.clientY - start.my) / scale;
                      setStates((prev) =>
                        prev.map((st) =>
                          st.key === s.key
                            ? { ...st, x: Math.round((start.x + dx) / 12) * 12, y: Math.round((start.y + dy) / 12) * 12 }
                            : st
                        )
                      );
                    };
                    const up = () => {
                      window.removeEventListener("mousemove", move);
                      window.removeEventListener("mouseup", up);
                    };
                    window.addEventListener("mousemove", move);
                    window.addEventListener("mouseup", up);
                  }}
                >
                  <rect
                    width={140}
                    height={56}
                    rx={10}
                    fill={selected === s.key ? "#0f172a" : "#fff"}
                    stroke={s.color || "#334155"}
                    strokeWidth={2}
                  />
                  <text x={70} y={24} textAnchor="middle" fontSize={12} fill={selected === s.key ? "#fff" : "#0f172a"} fontWeight={600}>
                    {s.label || s.key}
                  </text>
                  <text x={70} y={42} textAnchor="middle" fontSize={10} fill={selected === s.key ? "#cbd5e1" : "#64748b"}>
                    {initialState === s.key ? "initial" : s.terminal ? "terminal" : "state"}
                  </text>
                </g>
              ))}
            </g>
            {/* mini map */}
            <rect x="calc(100% - 120)" y="12" width={100} height={60} fill="#fff" stroke="#cbd5e1" rx={4} />
          </svg>
        )}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border bg-white p-3 text-sm">
          <p className="font-medium">State properties</p>
          {selectedState ? (
            <div className="mt-2 space-y-2">
              <label className="block text-xs">
                Label
                <input
                  className="mt-1 w-full rounded border px-2 py-1"
                  value={selectedState.label || ""}
                  onChange={(e) => setStates((prev) => prev.map((s) => (s.key === selectedState.key ? { ...s, label: e.target.value } : s)))}
                />
              </label>
              <label className="block text-xs">
                Color
                <input
                  type="color"
                  className="mt-1"
                  value={selectedState.color || "#334155"}
                  onChange={(e) => setStates((prev) => prev.map((s) => (s.key === selectedState.key ? { ...s, color: e.target.value } : s)))}
                />
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={!!selectedState.terminal}
                  onChange={(e) =>
                    setStates((prev) => prev.map((s) => (s.key === selectedState.key ? { ...s, terminal: e.target.checked } : s)))
                  }
                />
                Terminal
              </label>
              <BuilderButton variant="ghost" onClick={() => setInitialState(selectedState.key)}>
                Set initial
              </BuilderButton>
              <BuilderButton variant="ghost" onClick={() => setConnectFrom(selectedState.key)}>
                {connectFrom === selectedState.key ? "Connecting… click target" : "Connect transition from here"}
              </BuilderButton>
            </div>
          ) : (
            <p className="text-slate-500">Select a state</p>
          )}
        </div>
        <div className="rounded-lg border bg-white p-3 text-sm">
          <p className="font-medium">Transition properties</p>
          {selectedTx ? (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-slate-500">
                {selectedTx.from} → {selectedTx.to}
              </p>
              <label className="block text-xs">
                Roles (comma)
                <input
                  className="mt-1 w-full rounded border px-2 py-1"
                  value={(selectedTx.roles || []).join(",")}
                  onChange={(e) =>
                    setTransitions((prev) =>
                      prev.map((t) =>
                        t.key === selectedTx.key
                          ? { ...t, roles: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) }
                          : t
                      )
                    )
                  }
                />
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={!!selectedTx.requirements?.requireComment}
                  onChange={(e) =>
                    setTransitions((prev) =>
                      prev.map((t) =>
                        t.key === selectedTx.key
                          ? { ...t, requirements: { ...t.requirements, requireComment: e.target.checked } }
                          : t
                      )
                    )
                  }
                />
                Require comment
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={!!selectedTx.requirements?.requireAttachment}
                  onChange={(e) =>
                    setTransitions((prev) =>
                      prev.map((t) =>
                        t.key === selectedTx.key
                          ? { ...t, requirements: { ...t.requirements, requireAttachment: e.target.checked } }
                          : t
                      )
                    )
                  }
                />
                Require attachment
              </label>
              <label className="block text-xs">
                Condition field (from registry)
                <select
                  className="mt-1 w-full rounded border px-2 py-1"
                  value={selectedTx.conditions?.field || ""}
                  onChange={(e) =>
                    setTransitions((prev) =>
                      prev.map((t) =>
                        t.key === selectedTx.key
                          ? {
                              ...t,
                              conditions: e.target.value
                                ? { field: e.target.value, equals: t.conditions?.equals || "" }
                                : undefined,
                            }
                          : t
                      )
                    )
                  }
                >
                  <option value="">None</option>
                  {registryFields.map((f) => (
                    <option key={f.internalName} value={f.internalName}>
                      {f.displayLabel}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <p className="text-slate-500">Select a transition line</p>
          )}
        </div>
      </div>
      {analysis ? <p className="mt-2 text-sm text-slate-700">{analysis}</p> : null}
      {message ? <p className="mt-2 text-sm text-amber-800">{message}</p> : null}
    </BuilderShell>
  );
}
