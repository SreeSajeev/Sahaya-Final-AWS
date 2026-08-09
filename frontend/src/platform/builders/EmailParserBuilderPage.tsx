/**
 * Email Parser Builder — visual rules, live preview, AI stub, persistence.
 */
import { useEffect, useState } from "react";
import {
  previewEmailParser,
  saveEmailParser,
  publishArtifactVersion,
  listBuilderArtifacts,
  fetchRegistryCatalog,
} from "../lib/platformApi";
import { BuilderShell, BuilderButton } from "../shared/BuilderShell";
import { VersionPanel, downloadJson } from "../shared/VersionPanel";

type RegexRule = { pattern: string; targetField: string; confidence?: number; flags?: string };
type KeywordRule = { keyword: string; targetField: string; value?: string; confidence?: number };
type SenderRule = { domain?: string; equals?: string; targetField: string; value?: string };

export default function EmailParserBuilderPage() {
  const [key, setKey] = useState("default_parser");
  const [name, setName] = useState("Default email parser");
  const [regexRules, setRegexRules] = useState<RegexRule[]>([{ pattern: "Loc:\\s*(.+)", targetField: "location", confidence: 90 }]);
  const [keywordRules, setKeywordRules] = useState<KeywordRule[]>([{ keyword: "URGENT", targetField: "priority", value: "HIGH", confidence: 92 }]);
  const [senderRules, setSenderRule] = useState<SenderRule[]>([{ domain: "@example.com", targetField: "source", value: "partner" }]);
  const [mapSubjectToField, setMapSubject] = useState("title");
  const [mapBodyToField, setMapBody] = useState("description");
  const [confidenceThreshold, setThreshold] = useState(80);
  const [aiPrompt, setAiPrompt] = useState("Extract ticket fields from the email.");
  const [email, setEmail] = useState({
    from: "ops@example.com",
    subject: "URGENT issue at plant",
    body: "Loc: Bay 4\nPlease investigate pump failure.",
  });
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [registryFields, setRegistryFields] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<{ at: string; fields: unknown }[]>([]);

  const config = {
    fieldMappings: [{ targetField: mapSubjectToField }],
    regexRules,
    keywordRules,
    senderRules,
    mapSubjectToField,
    mapBodyToField,
    confidenceThreshold,
    ai: { prompt: aiPrompt },
  };

  useEffect(() => {
    void fetchRegistryCatalog()
      .then((r) => setRegistryFields(((r as { fields?: { internalName: string }[] }).fields || []).map((f) => f.internalName)))
      .catch(() => undefined);
    void listBuilderArtifacts("email-parser").catch(() => undefined);
  }, []);

  async function runPreview() {
    try {
      const res = await previewEmailParser(config, email);
      setPreview(res as Record<string, unknown>);
      setHistory((h) => [{ at: new Date().toISOString(), fields: (res as { fields?: unknown }).fields }, ...h].slice(0, 20));
      setMessage("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Preview failed");
    }
  }

  async function persist() {
    try {
      await saveEmailParser({ key, name, status: "draft", config });
      await publishArtifactVersion("email_parser", key, config);
      setMessage("Parser saved & published");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    }
  }

  return (
    <BuilderShell
      title="Email Parser Builder"
      subtitle="Visual field mapping, live preview, confidence, AI extraction stub, replay history"
      toolbar={
        <>
          <BuilderButton onClick={() => void runPreview()}>Live preview</BuilderButton>
          <BuilderButton onClick={() => void persist()}>Publish</BuilderButton>
          <BuilderButton variant="ghost" onClick={() => downloadJson(`${key}.parser.json`, config)}>
            Export
          </BuilderButton>
        </>
      }
      sidebar={
        <VersionPanel
          artifactType="email_parser"
          artifactKey={key}
          onLoadSnapshot={(snap) => {
            const c = snap as typeof config;
            if (c.regexRules) setRegexRules(c.regexRules as RegexRule[]);
            if (c.keywordRules) setKeywordRules(c.keywordRules as KeywordRule[]);
          }}
        />
      }
    >
      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        <input className="rounded border px-2 py-1.5 text-sm" value={key} onChange={(e) => setKey(e.target.value)} placeholder="key" />
        <input className="rounded border px-2 py-1.5 text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="name" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <section className="rounded-lg border bg-white p-3">
            <h3 className="text-sm font-semibold">Regex rules</h3>
            {regexRules.map((r, i) => (
              <div key={i} className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <input className="rounded border px-2 py-1 font-mono" value={r.pattern} onChange={(e) => setRegexRules((prev) => prev.map((x, j) => (j === i ? { ...x, pattern: e.target.value } : x)))} />
                <select className="rounded border px-2 py-1" value={r.targetField} onChange={(e) => setRegexRules((prev) => prev.map((x, j) => (j === i ? { ...x, targetField: e.target.value } : x)))}>
                  <option value={r.targetField}>{r.targetField}</option>
                  {registryFields.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
            ))}
            <BuilderButton variant="ghost" onClick={() => setRegexRules((p) => [...p, { pattern: "", targetField: "field", confidence: 80 }])}>+ Regex</BuilderButton>
          </section>

          <section className="rounded-lg border bg-white p-3">
            <h3 className="text-sm font-semibold">Keyword rules</h3>
            {keywordRules.map((r, i) => (
              <div key={i} className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <input className="rounded border px-2 py-1" value={r.keyword} onChange={(e) => setKeywordRules((prev) => prev.map((x, j) => (j === i ? { ...x, keyword: e.target.value } : x)))} />
                <input className="rounded border px-2 py-1" value={r.targetField} onChange={(e) => setKeywordRules((prev) => prev.map((x, j) => (j === i ? { ...x, targetField: e.target.value } : x)))} />
                <input className="rounded border px-2 py-1" value={r.value || ""} onChange={(e) => setKeywordRules((prev) => prev.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
              </div>
            ))}
            <BuilderButton variant="ghost" onClick={() => setKeywordRules((p) => [...p, { keyword: "", targetField: "field", value: "" }])}>+ Keyword</BuilderButton>
          </section>

          <section className="rounded-lg border bg-white p-3">
            <h3 className="text-sm font-semibold">Sender / subject / body</h3>
            {senderRules.map((r, i) => (
              <div key={i} className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <input className="rounded border px-2 py-1" placeholder="domain" value={r.domain || ""} onChange={(e) => setSenderRule((prev) => prev.map((x, j) => (j === i ? { ...x, domain: e.target.value } : x)))} />
                <input className="rounded border px-2 py-1" placeholder="targetField" value={r.targetField} onChange={(e) => setSenderRule((prev) => prev.map((x, j) => (j === i ? { ...x, targetField: e.target.value } : x)))} />
              </div>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <label>Subject → <input className="ml-1 rounded border px-2 py-1" value={mapSubjectToField} onChange={(e) => setMapSubject(e.target.value)} /></label>
              <label>Body → <input className="ml-1 rounded border px-2 py-1" value={mapBodyToField} onChange={(e) => setMapBody(e.target.value)} /></label>
            </div>
            <label className="mt-2 block text-xs">Confidence threshold
              <input type="number" className="ml-2 w-20 rounded border px-2 py-1" value={confidenceThreshold} onChange={(e) => setThreshold(Number(e.target.value))} />
            </label>
          </section>

          <section className="rounded-lg border bg-white p-3">
            <h3 className="text-sm font-semibold">AI extraction</h3>
            <textarea className="mt-2 w-full rounded border px-2 py-1 text-sm" rows={3} value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} />
            <p className="mt-1 text-xs text-slate-500">Prompt testing uses deterministic AI stub + confidence gate (provider-agnostic).</p>
          </section>
        </div>

        <div className="space-y-4">
          <section className="rounded-lg border bg-white p-3">
            <h3 className="text-sm font-semibold">Sample email</h3>
            <input className="mt-2 w-full rounded border px-2 py-1 text-sm" value={email.from} onChange={(e) => setEmail({ ...email, from: e.target.value })} placeholder="from" />
            <input className="mt-2 w-full rounded border px-2 py-1 text-sm" value={email.subject} onChange={(e) => setEmail({ ...email, subject: e.target.value })} placeholder="subject" />
            <textarea className="mt-2 w-full rounded border px-2 py-1 text-sm" rows={8} value={email.body} onChange={(e) => setEmail({ ...email, body: e.target.value })} />
          </section>
          <section className="rounded-lg border bg-slate-900 p-3 text-slate-100">
            <h3 className="text-sm font-semibold">Preview output</h3>
            <pre className="mt-2 max-h-64 overflow-auto text-xs">{preview ? JSON.stringify(preview, null, 2) : "Run live preview"}</pre>
          </section>
          <section className="rounded-lg border bg-white p-3">
            <h3 className="text-sm font-semibold">Replay history</h3>
            <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs text-slate-600">
              {history.map((h, i) => (
                <li key={i}>
                  <button type="button" className="hover:underline" onClick={() => setPreview({ fields: h.fields })}>
                    {h.at}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
      {message ? <p className="mt-3 text-sm text-amber-800">{message}</p> : null}
    </BuilderShell>
  );
}
