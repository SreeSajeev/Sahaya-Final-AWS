import { useEffect, useState } from "react";
import MetadataFormRenderer from "../renderer/MetadataFormRenderer";
import { usePlatformSettings } from "../hooks/usePlatformSettings";
import {
  createPlatformRuntimeTicket,
  fetchRegistryCatalog,
  fetchPlatformForms,
  fetchFormVersions,
} from "../lib/platformApi";
import { useMutation } from "@tanstack/react-query";

/**
 * Runtime create — uses PUBLISHED form versions only (never client schema).
 */
export default function MetadataTicketCreatePage() {
  const { data: settings } = usePlatformSettings();
  const mode = (settings as { mode?: string } | undefined)?.mode;
  const [forms, setForms] = useState<{ id: string; key: string; name: string }[]>([]);
  const [formId, setFormId] = useState("");
  const [formVersionId, setFormVersionId] = useState("");
  const [schema, setSchema] = useState<{ fields: unknown[] } | null>(null);
  const [layout, setLayout] = useState<unknown>(null);
  const [value, setValue] = useState<Record<string, unknown>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    void fetchPlatformForms().then((r) => {
      const items = ((r as { items?: { id: string; key: string; name: string }[] }).items || []).filter(
        (f) => f
      );
      setForms(items);
      if (items[0]) setFormId(items[0].id);
    });
  }, []);

  useEffect(() => {
    if (!formId) return;
    void fetchFormVersions(formId).then((r) => {
      const items = (r as { items?: { id: string; version: number; schema_json?: unknown; layout_json?: unknown }[] })
        .items || [];
      const latest = items[0];
      if (!latest) {
        setSchema(null);
        setFormVersionId("");
        setError("No published form version — publish a form first");
        return;
      }
      setFormVersionId(latest.id);
      setSchema((latest.schema_json as { fields: unknown[] }) || null);
      setLayout(latest.layout_json || null);
      setError("");
    });
  }, [formId]);

  // Live registry: poll catalog (EventSource cannot send Bearer JWT)
  useEffect(() => {
    const id = window.setInterval(() => {
      void fetchRegistryCatalog().catch(() => undefined);
    }, 15000);
    return () => window.clearInterval(id);
  }, []);

  const create = useMutation({
    mutationFn: () =>
      createPlatformRuntimeTicket({
        source: "portal",
        data: value,
        formVersionId,
      }),
    onError: (e: Error) => setError(e.message),
  });

  if (mode !== "METADATA") {
    return <p className="text-sm text-slate-600">Runtime ticket create is METADATA-only.</p>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Create metadata ticket</h2>
      <p className="text-xs text-slate-500">Uses immutable published form version only — browser cannot supply schema.</p>
      <label className="block text-sm">
        Published form
        <select className="mt-1 w-full rounded border px-2 py-1.5" value={formId} onChange={(e) => setFormId(e.target.value)}>
          {forms.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} ({f.key})
            </option>
          ))}
        </select>
      </label>
      {schema ? (
        <MetadataFormRenderer
          schema={schema as { fields: never[] }}
          layout={layout as never}
          value={value}
          onChange={setValue}
        />
      ) : (
        <p className="text-sm text-amber-700">{error || "Select a published form"}</p>
      )}
      <button
        type="button"
        disabled={!formVersionId || create.isPending}
        className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        onClick={() => create.mutate()}
      >
        {create.isPending ? "Creating…" : "Create ticket"}
      </button>
      {create.isSuccess ? (
        <pre className="rounded bg-slate-50 p-2 text-xs">{JSON.stringify(create.data, null, 2)}</pre>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
