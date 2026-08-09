/**
 * Enterprise Form Builder — Metadata Platform only.
 * Visual field palette, layout canvas (columns/sections/tabs), properties, preview, versioning.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchPlatformForms,
  savePlatformForm,
  publishPlatformForm,
  fetchFormVersions,
  fetchFormTemplates,
  fetchFieldTypeCatalog,
  validateFormSchema,
  evaluatePlatformFormula,
} from "../lib/platformApi";
import { BuilderShell, BuilderButton, EmptyBuilderState } from "../shared/BuilderShell";
import { downloadJson, parseImportFile } from "../shared/VersionPanel";
import MetadataFormRenderer from "../renderer/MetadataFormRenderer";

export type FormField = {
  internalName: string;
  displayLabel: string;
  fieldType: string;
  required?: boolean;
  readOnly?: boolean;
  hidden?: boolean;
  options?: string[];
  regex?: string;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  formula?: string;
  visibility?: { field: string; equals: string };
  conditionalRequired?: { field: string; equals: string };
  searchable?: boolean;
  reportable?: boolean;
  permission?: { viewRoles?: string[]; editRoles?: string[] };
};

type LayoutNode = {
  type: string;
  key?: string;
  title?: string;
  fieldKey?: string;
  columns?: number;
  collapsible?: boolean;
  children?: LayoutNode[];
  span?: number;
};

type FormRow = { id: string; key: string; name: string; status?: string; current_version?: number };

const FIELD_GROUPS: { label: string; types: string[] }[] = [
  { label: "Text", types: ["single_line_text", "paragraph", "rich_text", "markdown"] },
  { label: "Numbers", types: ["integer", "number", "decimal", "currency", "percentage"] },
  { label: "Dates", types: ["date", "time", "datetime", "duration"] },
  { label: "Selection", types: ["dropdown", "multi_select", "radio", "checkbox", "toggle", "rating"] },
  { label: "Lookup", types: ["user", "team", "customer", "people", "asset", "vehicle", "dynamic_lookup", "api_lookup"] },
  { label: "Files", types: ["file_upload", "multi_file_upload", "image_upload", "document_upload", "pdf_upload"] },
  { label: "Advanced", types: ["formula", "signature", "qr_code", "barcode", "location", "hidden", "auto_number", "repeater"] },
];

function slugify(label: string) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .replace(/^(\d)/, "f_$1") || `field_${Date.now().toString(36)}`;
}

function defaultLayout(fields: FormField[]): LayoutNode {
  return {
    type: "root",
    children: [
      {
        type: "section",
        key: "main",
        title: "Main",
        collapsible: false,
        children: fields.map((f) => ({ type: "field", fieldKey: f.internalName, span: 12 })),
      },
    ],
  };
}

export default function FormBuilderPage() {
  const [forms, setForms] = useState<FormRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [fields, setFields] = useState<FormField[]>([]);
  const [layout, setLayout] = useState<LayoutNode>(defaultLayout([]));
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"desktop" | "tablet" | "mobile" | "print">("desktop");
  const [darkPreview, setDarkPreview] = useState(false);
  const [previewData, setPreviewData] = useState<Record<string, unknown>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [templates, setTemplates] = useState<{ key: string; name: string; description?: string; schema?: { fields?: FormField[] }; layout?: LayoutNode }[]>([]);
  const [catalog, setCatalog] = useState<string[]>([]);
  const [versions, setVersions] = useState<{ version: number }[]>([]);
  const [columnMode, setColumnMode] = useState<1 | 2 | 3 | 4>(1);
  const [undoStack, setUndoStack] = useState<{ fields: FormField[]; layout: LayoutNode }[]>([]);
  const [dragType, setDragType] = useState<string | null>(null);

  const selected = useMemo(() => forms.find((f) => f.id === selectedId) || null, [forms, selectedId]);
  const activeField = fields.find((f) => f.internalName === selectedField) || null;

  const pushUndo = useCallback(() => {
    setUndoStack((s) => [...s.slice(-29), { fields: structuredClone(fields), layout: structuredClone(layout) }]);
  }, [fields, layout]);

  async function refresh() {
    const res = (await fetchPlatformForms()) as { items?: FormRow[] };
    setForms(res.items || []);
  }

  useEffect(() => {
    void refresh();
    void fetchFormTemplates().then((r) => setTemplates((r as { items?: typeof templates }).items || []));
    void fetchFieldTypeCatalog().then((r) => setCatalog((r as { items?: string[] }).items || []));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    void fetchFormVersions(selectedId).then((r) => setVersions((r as { items?: { version: number }[] }).items || []));
  }, [selectedId]);

  function addField(fieldType: string) {
    pushUndo();
    const label = fieldType.replace(/_/g, " ");
    let internalName = slugify(label);
    let i = 1;
    while (fields.some((f) => f.internalName === internalName)) {
      internalName = `${slugify(label)}_${i++}`;
    }
    const field: FormField = {
      internalName,
      displayLabel: label.replace(/\b\w/g, (c) => c.toUpperCase()),
      fieldType,
      required: false,
      searchable: true,
      reportable: true,
      options: ["dropdown", "multi_select", "radio"].includes(fieldType) ? ["Option A", "Option B"] : undefined,
    };
    const next = [...fields, field];
    setFields(next);
    setSelectedField(internalName);
    setLayout((prev) => {
      const root = structuredClone(prev);
      const section = root.children?.[0];
      if (section) {
        section.children = [...(section.children || []), { type: "field", fieldKey: internalName, span: Math.floor(12 / columnMode) }];
      }
      return root;
    });
  }

  function updateField(name: string, patch: Partial<FormField>) {
    pushUndo();
    setFields((prev) => prev.map((f) => (f.internalName === name ? { ...f, ...patch } : f)));
  }

  function removeField(name: string) {
    pushUndo();
    setFields((prev) => prev.filter((f) => f.internalName !== name));
    setLayout((prev) => {
      const walk = (n: LayoutNode): LayoutNode => ({
        ...n,
        children: (n.children || []).filter((c) => c.fieldKey !== name).map(walk),
      });
      return walk(prev);
    });
    if (selectedField === name) setSelectedField(null);
  }

  function applyColumnLayout(cols: 1 | 2 | 3 | 4) {
    pushUndo();
    setColumnMode(cols);
    const span = Math.floor(12 / cols);
    setLayout({
      type: "root",
      children: [
        {
          type: "section",
          key: "main",
          title: "Main",
          children: [
            {
              type: "columns",
              columns: cols,
              children: Array.from({ length: cols }, (_, colIdx) => ({
                type: "column",
                children: fields
                  .filter((_, i) => i % cols === colIdx)
                  .map((f) => ({ type: "field", fieldKey: f.internalName, span })),
              })),
            },
          ],
        },
      ],
    });
  }

  async function handleSaveHeader() {
    if (!key.trim()) return setMessage("Key required");
    setBusy(true);
    try {
      const saved = (await savePlatformForm({ key: key.trim(), name: name || key })) as FormRow;
      setMessage("Form saved (draft)");
      await refresh();
      if (saved?.id) setSelectedId(saved.id);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function handlePublish() {
    if (!selectedId) return setMessage("Save the form first");
    setBusy(true);
    try {
      const schema = { fields, crossFieldValidations: [] as unknown[] };
      await validateFormSchema(schema, layout);
      await publishPlatformForm(selectedId, { schema, layout });
      setMessage("Published — registry updated for Reports, Search, Notifications, etc.");
      await refresh();
      const vers = (await fetchFormVersions(selectedId)) as { items?: { version: number }[] };
      setVersions(vers.items || []);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  }

  async function applyTemplate(tKey: string) {
    const t = templates.find((x) => x.key === tKey);
    if (!t) return;
    pushUndo();
    setKey(t.key);
    setName(t.name);
    setFields((t.schema?.fields as FormField[]) || []);
    setLayout(t.layout || defaultLayout((t.schema?.fields as FormField[]) || []));
    setMessage(`Loaded template: ${t.name}`);
  }

  const previewWidth =
    previewMode === "mobile" ? "max-w-sm" : previewMode === "tablet" ? "max-w-md" : previewMode === "print" ? "max-w-3xl" : "max-w-2xl";

  return (
    <BuilderShell
      title="Form Builder"
      subtitle="Enterprise visual designer — layout, fields, validation, formulas, preview, versioning"
      status={selected ? `${selected.status || "draft"} · v${selected.current_version || 1}` : undefined}
      toolbar={
        <>
          <BuilderButton disabled={busy} onClick={() => void handleSaveHeader()}>
            Save
          </BuilderButton>
          <BuilderButton disabled={busy || !selectedId} onClick={() => void handlePublish()}>
            Publish
          </BuilderButton>
          <BuilderButton
            variant="ghost"
            onClick={() => {
              if (!undoStack.length) return;
              const prev = undoStack[undoStack.length - 1];
              setUndoStack((s) => s.slice(0, -1));
              setFields(prev.fields);
              setLayout(prev.layout);
            }}
          >
            Undo
          </BuilderButton>
          <BuilderButton variant="ghost" onClick={() => downloadJson(`${key || "form"}.json`, { key, name, schema: { fields }, layout })}>
            Export JSON
          </BuilderButton>
          <label className="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm">
            Import
            <input
              type="file"
              accept=".json,.yaml,.yml,.csv"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  if (file.name.endsWith(".csv")) {
                    const text = await file.text();
                    const lines = text.trim().split(/\r?\n/);
                    const imported: FormField[] = lines.slice(1).map((line) => {
                      const [internalName, displayLabel, fieldType] = line.split(",");
                      return {
                        internalName: slugify(internalName || "field"),
                        displayLabel: displayLabel || internalName,
                        fieldType: (fieldType || "single_line_text").trim(),
                      };
                    });
                    pushUndo();
                    setFields(imported);
                    setLayout(defaultLayout(imported));
                  } else {
                    const data = (await parseImportFile(file)) as {
                      key?: string;
                      name?: string;
                      schema?: { fields?: FormField[] };
                      layout?: LayoutNode;
                      fields?: FormField[];
                    };
                    pushUndo();
                    if (data.key) setKey(data.key);
                    if (data.name) setName(data.name);
                    const f = data.schema?.fields || data.fields || [];
                    setFields(f);
                    setLayout(data.layout || defaultLayout(f));
                  }
                  setMessage("Imported");
                } catch (err) {
                  setMessage(err instanceof Error ? err.message : "Import failed");
                }
              }}
            />
          </label>
        </>
      }
      sidebar={
        <>
          <div className="rounded-lg border border-slate-200 bg-white p-2">
            <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Forms</p>
            <ul className="max-h-40 space-y-1 overflow-auto text-sm">
              {forms.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    className={`w-full rounded px-2 py-1 text-left ${selectedId === f.id ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`}
                    onClick={() => {
                      setSelectedId(f.id);
                      setKey(f.key);
                      setName(f.name);
                    }}
                  >
                    {f.name}
                  </button>
                </li>
              ))}
            </ul>
            <BuilderButton
              variant="ghost"
              onClick={() => {
                setSelectedId(null);
                setKey("");
                setName("");
                setFields([]);
                setLayout(defaultLayout([]));
              }}
            >
              + New
            </BuilderButton>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-2">
            <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Templates</p>
            <ul className="space-y-1 text-sm">
              {templates.map((t) => (
                <li key={t.key}>
                  <button type="button" className="w-full rounded px-2 py-1 text-left hover:bg-slate-100" onClick={() => applyTemplate(t.key)}>
                    {t.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-2">
            <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Field library</p>
            {FIELD_GROUPS.map((g) => (
              <div key={g.label} className="mb-2">
                <p className="text-[11px] font-medium text-slate-500">{g.label}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {g.types
                    .filter((t) => !catalog.length || catalog.includes(t))
                    .map((t) => (
                      <button
                        key={t}
                        type="button"
                        draggable
                        onDragStart={() => setDragType(t)}
                        onDragEnd={() => setDragType(null)}
                        onClick={() => addField(t)}
                        className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] hover:border-slate-400"
                      >
                        {t.replace(/_/g, " ")}
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
          {versions.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-600">
              Published versions: {versions.map((v) => `v${v.version}`).join(", ")}
            </div>
          )}
        </>
      }
    >
      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <label className="text-sm">
          Key
          <input className="mt-1 w-full rounded border px-2 py-1.5" value={key} onChange={(e) => setKey(e.target.value)} placeholder="incident_intake" />
        </label>
        <label className="text-sm">
          Name
          <input className="mt-1 w-full rounded border px-2 py-1.5" value={name} onChange={(e) => setName(e.target.value)} placeholder="Incident Intake" />
        </label>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <span className="text-xs font-medium text-slate-500 self-center">Layout</span>
        {([1, 2, 3, 4] as const).map((c) => (
          <BuilderButton key={c} variant={columnMode === c ? "primary" : "ghost"} onClick={() => applyColumnLayout(c)}>
            {c} col
          </BuilderButton>
        ))}
        <BuilderButton
          variant="ghost"
          onClick={() => {
            pushUndo();
            setLayout({
              type: "root",
              children: [
                {
                  type: "wizard",
                  key: "wiz",
                  children: [
                    { type: "wizard_step", title: "Step 1", children: fields.slice(0, Math.ceil(fields.length / 2)).map((f) => ({ type: "field", fieldKey: f.internalName })) },
                    { type: "wizard_step", title: "Step 2", children: fields.slice(Math.ceil(fields.length / 2)).map((f) => ({ type: "field", fieldKey: f.internalName })) },
                  ],
                },
              ],
            });
          }}
        >
          Wizard
        </BuilderButton>
        <BuilderButton
          variant="ghost"
          onClick={() => {
            pushUndo();
            setLayout({
              type: "root",
              children: [
                {
                  type: "tabs",
                  children: [
                    { type: "tab", title: "Details", children: fields.map((f) => ({ type: "field", fieldKey: f.internalName })) },
                    { type: "tab", title: "Advanced", children: [] },
                  ],
                },
              ],
            });
          }}
        >
          Tabs
        </BuilderButton>
        <BuilderButton
          variant="ghost"
          onClick={() => {
            pushUndo();
            setLayout({
              type: "root",
              children: [
                {
                  type: "accordion",
                  children: [
                    { type: "accordion_item", title: "Primary", collapsible: true, children: fields.map((f) => ({ type: "field", fieldKey: f.internalName })) },
                  ],
                },
              ],
            });
          }}
        >
          Accordion
        </BuilderButton>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <div
          className="min-h-[320px] rounded-xl border border-slate-200 bg-white p-4"
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (dragType) addField(dragType);
            setDragType(null);
          }}
        >
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Canvas</p>
          {!fields.length ? (
            <EmptyBuilderState title="Drop or click fields from the library" hint="Build layouts with columns, tabs, wizard steps, and accordions." />
          ) : (
            <ul className="space-y-2">
              {fields.map((f) => (
                <li
                  key={f.internalName}
                  className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 ${
                    selectedField === f.internalName ? "border-slate-900 bg-slate-50" : "border-slate-200"
                  }`}
                  onClick={() => setSelectedField(f.internalName)}
                >
                  <div>
                    <p className="text-sm font-medium">{f.displayLabel}</p>
                    <p className="text-xs text-slate-500">
                      {f.internalName} · {f.fieldType}
                      {f.required ? " · required" : ""}
                    </p>
                  </div>
                  <button type="button" className="text-xs text-red-600" onClick={() => removeField(f.internalName)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Properties</p>
          {!activeField ? (
            <p className="text-sm text-slate-500">Select a field</p>
          ) : (
            <div className="space-y-2 text-sm">
              <label className="block">
                Label
                <input
                  className="mt-1 w-full rounded border px-2 py-1"
                  value={activeField.displayLabel}
                  onChange={(e) => updateField(activeField.internalName, { displayLabel: e.target.value })}
                />
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!activeField.required}
                  onChange={(e) => updateField(activeField.internalName, { required: e.target.checked })}
                />
                Required
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!activeField.readOnly}
                  onChange={(e) => updateField(activeField.internalName, { readOnly: e.target.checked })}
                />
                Read only
              </label>
              <label className="block">
                Regex
                <input
                  className="mt-1 w-full rounded border px-2 py-1 font-mono text-xs"
                  value={activeField.regex || ""}
                  onChange={(e) => updateField(activeField.internalName, { regex: e.target.value || undefined })}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label>
                  Min len
                  <input
                    type="number"
                    className="mt-1 w-full rounded border px-2 py-1"
                    value={activeField.minLength ?? ""}
                    onChange={(e) =>
                      updateField(activeField.internalName, {
                        minLength: e.target.value === "" ? undefined : Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Max len
                  <input
                    type="number"
                    className="mt-1 w-full rounded border px-2 py-1"
                    value={activeField.maxLength ?? ""}
                    onChange={(e) =>
                      updateField(activeField.internalName, {
                        maxLength: e.target.value === "" ? undefined : Number(e.target.value),
                      })
                    }
                  />
                </label>
              </div>
              {activeField.options && (
                <label className="block">
                  Options (comma)
                  <input
                    className="mt-1 w-full rounded border px-2 py-1"
                    value={activeField.options.join(", ")}
                    onChange={(e) =>
                      updateField(activeField.internalName, {
                        options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                      })
                    }
                  />
                </label>
              )}
              {(activeField.fieldType === "formula" || activeField.fieldType === "computed") && (
                <label className="block">
                  Formula
                  <textarea
                    className="mt-1 w-full rounded border px-2 py-1 font-mono text-xs"
                    rows={3}
                    value={activeField.formula || ""}
                    onChange={(e) => updateField(activeField.internalName, { formula: e.target.value })}
                  />
                  <BuilderButton
                    variant="ghost"
                    onClick={async () => {
                      try {
                        const r = (await evaluatePlatformFormula(activeField.formula || "1+1", previewData)) as {
                          value?: unknown;
                        };
                        setMessage(`Formula => ${String(r.value)}`);
                      } catch (e) {
                        setMessage(e instanceof Error ? e.message : "Formula error");
                      }
                    }}
                  >
                    Test formula
                  </BuilderButton>
                </label>
              )}
              <label className="block">
                Visible when field
                <input
                  className="mt-1 w-full rounded border px-2 py-1"
                  placeholder="priority"
                  value={activeField.visibility?.field || ""}
                  onChange={(e) =>
                    updateField(activeField.internalName, {
                      visibility: e.target.value
                        ? { field: e.target.value, equals: activeField.visibility?.equals || "" }
                        : undefined,
                    })
                  }
                />
              </label>
              <label className="block">
                equals
                <input
                  className="mt-1 w-full rounded border px-2 py-1"
                  value={activeField.visibility?.equals || ""}
                  onChange={(e) =>
                    updateField(activeField.internalName, {
                      visibility: activeField.visibility?.field
                        ? { field: activeField.visibility.field, equals: e.target.value }
                        : undefined,
                    })
                  }
                />
              </label>
            </div>
          )}
        </div>
      </div>

      <div className={`mt-6 rounded-xl border border-slate-200 p-4 ${darkPreview ? "bg-slate-900 text-slate-100" : "bg-white"}`}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Preview</p>
          {(["desktop", "tablet", "mobile", "print"] as const).map((m) => (
            <BuilderButton key={m} variant={previewMode === m ? "primary" : "ghost"} onClick={() => setPreviewMode(m)}>
              {m}
            </BuilderButton>
          ))}
          <BuilderButton variant="ghost" onClick={() => setDarkPreview((d) => !d)}>
            {darkPreview ? "Light" : "Dark"}
          </BuilderButton>
        </div>
        <div className={`mx-auto ${previewWidth}`}>
          <MetadataFormRenderer
            schema={{ fields }}
            layout={layout}
            value={previewData}
            onChange={setPreviewData}
          />
        </div>
      </div>

      {message ? <p className="mt-3 text-sm text-amber-800">{message}</p> : null}
    </BuilderShell>
  );
}
