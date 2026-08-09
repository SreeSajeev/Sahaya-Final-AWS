import { evaluateCondition } from "./condition";
import type { ReactNode } from "react";

export type FieldDef = {
  internalName: string;
  displayLabel?: string;
  fieldType: string;
  required?: boolean;
  readOnly?: boolean;
  options?: string[];
  visibility?: { field: string; equals?: string; and?: unknown[]; or?: unknown[] };
  conditionalVisibility?: { field: string; equals?: string };
  formula?: string;
  placeholder?: string;
};

type LayoutNode = {
  type: string;
  title?: string;
  fieldKey?: string;
  columns?: number;
  children?: LayoutNode[];
};

type Props = {
  schema: { fields: FieldDef[] };
  layout?: LayoutNode | null;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  readOnly?: boolean;
};

function FieldControl({
  field,
  value,
  onChange,
  readOnly,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
  readOnly?: boolean;
}) {
  const disabled = readOnly || field.readOnly;
  const common = "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100";
  const type = field.fieldType;
  const opts = field.options || [];

  if (["section", "divider", "tab", "group", "accordion"].includes(type)) {
    return <h3 className="text-sm font-semibold text-slate-800">{field.displayLabel || field.internalName}</h3>;
  }
  if (type === "hidden") return null;
  if (type === "paragraph" || type === "rich_text" || type === "markdown" || type === "multi_line_text") {
    return (
      <textarea
        className={common}
        rows={4}
        disabled={disabled}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  if (type === "dropdown" || type === "dynamic_lookup") {
    return (
      <select className={common} disabled={disabled} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        {opts.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (type === "radio") {
    return (
      <div className="mt-1 space-y-1">
        {opts.map((o) => (
          <label key={o} className="flex items-center gap-2 text-sm">
            <input type="radio" disabled={disabled} checked={value === o} onChange={() => onChange(o)} />
            {o}
          </label>
        ))}
      </div>
    );
  }
  if (type === "multi_select" || type === "tags") {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    return (
      <select
        multiple
        className={common}
        disabled={disabled}
        value={arr}
        onChange={(e) => onChange(Array.from(e.target.selectedOptions).map((o) => o.value))}
      >
        {opts.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (type === "checkbox" || type === "toggle") {
    return (
      <input
        type="checkbox"
        className="mt-2 h-4 w-4"
        disabled={disabled}
        checked={Boolean(value)}
        onChange={(e) => onChange(e.target.checked)}
      />
    );
  }
  if (type === "rating") {
    const n = Number(value || 0);
    return (
      <div className="mt-1 flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            disabled={disabled}
            className={`h-8 w-8 rounded ${i <= n ? "bg-amber-400" : "bg-slate-200"}`}
            onClick={() => onChange(i)}
          >
            {i}
          </button>
        ))}
      </div>
    );
  }
  if (["file_upload", "image_upload", "pdf_upload", "document_upload", "multi_file_upload", "video_upload"].includes(type)) {
    return (
      <input
        type="file"
        className="mt-1 block w-full text-sm"
        disabled={disabled}
        multiple={type === "multi_file_upload"}
        accept={type === "image_upload" ? "image/*" : type === "pdf_upload" ? "application/pdf" : undefined}
        onChange={(e) => onChange(e.target.files ? Array.from(e.target.files).map((f) => f.name) : [])}
      />
    );
  }
  if (type === "signature") {
    return (
      <div className="mt-1 rounded border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-500">
        Signature pad (capture on submit)
        <input
          className={`${common} mt-2`}
          placeholder="Type full name as signature"
          disabled={disabled}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }
  if (type === "formula" || type === "computed" || type === "auto_number" || type === "uuid") {
    return <input className={common} readOnly value={String(value ?? "")} placeholder="Calculated" />;
  }
  if (type === "repeater" || type === "table") {
    const rows = Array.isArray(value) ? (value as unknown[]) : [];
    return (
      <div className="mt-1 space-y-2">
        {rows.map((row, idx) => (
          <div key={idx} className="rounded border bg-slate-50 px-2 py-1 text-xs">
            {typeof row === "object" ? JSON.stringify(row) : String(row)}
          </div>
        ))}
        <button
          type="button"
          disabled={disabled}
          className="text-xs text-blue-700"
          onClick={() => onChange([...rows, { item: "" }])}
        >
          + Add row
        </button>
      </div>
    );
  }

  const inputType =
    type === "number" || type === "integer" || type === "decimal" || type === "currency" || type === "percentage"
      ? "number"
      : type === "date"
        ? "date"
        : type === "time"
          ? "time"
          : type === "datetime"
            ? "datetime-local"
            : type === "email"
              ? "email"
              : type === "url"
                ? "url"
                : type === "phone"
                  ? "tel"
                  : "text";

  return (
    <input
      type={inputType}
      className={common}
      disabled={disabled}
      placeholder={field.placeholder || field.displayLabel}
      value={value == null ? "" : String(value)}
      onChange={(e) =>
        onChange(inputType === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)
      }
    />
  );
}

function renderLayout(
  node: LayoutNode,
  fieldMap: Map<string, FieldDef>,
  value: Record<string, unknown>,
  onChange: (next: Record<string, unknown>) => void,
  readOnly?: boolean
): ReactNode {
  if (!node) return null;
  if (node.type === "field") {
    const field = fieldMap.get(node.fieldKey || "");
    if (!field) return null;
    const visible = evaluateCondition(field.visibility || field.conditionalVisibility, value);
    if (!visible) return null;
    return (
      <label key={field.internalName} className="mb-3 block text-sm font-medium text-slate-700">
        {field.displayLabel || field.internalName}
        {field.required ? <span className="text-red-600"> *</span> : null}
        <FieldControl
          field={field}
          value={value[field.internalName]}
          readOnly={readOnly}
          onChange={(v) => onChange({ ...value, [field.internalName]: v })}
        />
      </label>
    );
  }
  if (node.type === "columns") {
    const cols = Math.min(4, Math.max(1, Number(node.columns || node.children?.length || 1)));
    return (
      <div key={`cols-${cols}-${(node.children || []).length}`} className={`grid gap-3`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {(node.children || []).map((c, i) => (
          <div key={`col-${i}`}>{renderLayout(c, fieldMap, value, onChange, readOnly)}</div>
        ))}
      </div>
    );
  }
  if (node.type === "section" || node.type === "panel" || node.type === "card" || node.type === "accordion_item" || node.type === "wizard_step" || node.type === "tab") {
    return (
      <section key={node.title || node.key || `sec-${node.type}`} className="mb-4 rounded-lg border border-slate-200 p-3">
        {node.title ? <h4 className="mb-2 text-sm font-semibold">{node.title}</h4> : null}
        {(node.children || []).map((c, i) => (
          <div key={`${node.type}-child-${i}`}>{renderLayout(c, fieldMap, value, onChange, readOnly)}</div>
        ))}
      </section>
    );
  }
  if (node.type === "root" || node.type === "tabs" || node.type === "accordion" || node.type === "wizard" || node.type === "column") {
    return (
      <>
        {(node.children || []).map((c, i) => (
          <div key={i}>{renderLayout(c, fieldMap, value, onChange, readOnly)}</div>
        ))}
      </>
    );
  }
  return (
    <>
      {(node.children || []).map((c, i) => (
        <div key={i}>{renderLayout(c, fieldMap, value, onChange, readOnly)}</div>
      ))}
    </>
  );
}

/** Runtime + builder preview renderer for METADATA forms. */
export default function MetadataFormRenderer({ schema, layout, value, onChange, readOnly }: Props) {
  const fieldMap = new Map(schema.fields.map((f) => [f.internalName, f]));

  if (layout?.children?.length) {
    return <div className="space-y-2">{renderLayout(layout, fieldMap, value, onChange, readOnly)}</div>;
  }

  return (
    <div className="space-y-3">
      {schema.fields.map((field) => {
        const visible = evaluateCondition(field.visibility || field.conditionalVisibility, value);
        if (!visible) return null;
        return (
          <label key={field.internalName} className="block text-sm font-medium text-slate-700">
            {field.displayLabel || field.internalName}
            {field.required ? <span className="text-red-600"> *</span> : null}
            <FieldControl
              field={field}
              value={value[field.internalName]}
              readOnly={readOnly}
              onChange={(v) => onChange({ ...value, [field.internalName]: v })}
            />
          </label>
        );
      })}
    </div>
  );
}
