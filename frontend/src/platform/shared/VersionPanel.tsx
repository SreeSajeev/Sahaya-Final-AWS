import { useEffect, useState } from "react";
import {
  listArtifactVersions,
  rollbackArtifact,
  cloneArtifact,
  compareArtifactVersions,
  fetchPublishedArtifact,
} from "../lib/platformApi";
import { BuilderButton } from "./BuilderShell";

type Props = {
  artifactType: string;
  artifactKey: string;
  onLoadSnapshot?: (snapshot: unknown, version: number) => void;
};

export function VersionPanel({ artifactType, artifactKey, onLoadSnapshot }: Props) {
  const [versions, setVersions] = useState<{ version: number; status?: string; published_at?: string }[]>([]);
  const [message, setMessage] = useState("");
  const [left, setLeft] = useState(1);
  const [right, setRight] = useState(1);
  const [diff, setDiff] = useState<{ changed?: number } | null>(null);

  async function refresh() {
    if (!artifactKey) return;
    try {
      const res = (await listArtifactVersions(artifactType, artifactKey)) as {
        items?: { version: number; status?: string; published_at?: string }[];
      };
      setVersions(res.items || []);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to load versions");
    }
  }

  useEffect(() => {
    void refresh();
  }, [artifactType, artifactKey]);

  if (!artifactKey) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-medium text-slate-800">Versions</p>
        <BuilderButton variant="ghost" onClick={() => void refresh()}>
          Refresh
        </BuilderButton>
      </div>
      <ul className="max-h-40 space-y-1 overflow-auto">
        {versions.map((v) => (
          <li key={v.version} className="flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-slate-50">
            <span>
              v{v.version} <span className="text-xs text-slate-500">{v.status}</span>
            </span>
            <button
              type="button"
              className="text-xs text-blue-700 hover:underline"
              onClick={async () => {
                const pub = (await fetchPublishedArtifact(artifactType, artifactKey, v.version)) as {
                  snapshot_json?: unknown;
                };
                onLoadSnapshot?.(pub.snapshot_json ?? pub, v.version);
              }}
            >
              Load
            </button>
          </li>
        ))}
        {!versions.length && <li className="text-slate-500">No published versions yet</li>}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <BuilderButton
          variant="ghost"
          onClick={async () => {
            const latest = versions[0]?.version;
            if (!latest || latest < 2) return setMessage("Need prior version to rollback");
            await rollbackArtifact(artifactType, artifactKey, latest - 1);
            setMessage(`Rolled back toward v${latest - 1}`);
            await refresh();
          }}
        >
          Rollback
        </BuilderButton>
        <BuilderButton
          variant="ghost"
          onClick={async () => {
            const nk = `${artifactKey}_clone_${Date.now().toString(36)}`;
            await cloneArtifact(artifactType, artifactKey, nk);
            setMessage(`Cloned to ${nk}`);
          }}
        >
          Clone
        </BuilderButton>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-xs">
          Left
          <input
            type="number"
            className="mt-1 w-full rounded border px-2 py-1"
            value={left}
            onChange={(e) => setLeft(Number(e.target.value))}
          />
        </label>
        <label className="text-xs">
          Right
          <input
            type="number"
            className="mt-1 w-full rounded border px-2 py-1"
            value={right}
            onChange={(e) => setRight(Number(e.target.value))}
          />
        </label>
      </div>
      <BuilderButton
        variant="ghost"
        onClick={async () => {
          const res = (await compareArtifactVersions(artifactType, artifactKey, left, right)) as {
            changed?: number;
          };
          setDiff(res);
        }}
      >
        Compare
      </BuilderButton>
      {diff ? <p className="mt-1 text-xs text-slate-600">{diff.changed ?? 0} changed lines</p> : null}
      {message ? <p className="mt-2 text-xs text-amber-700">{message}</p> : null}
    </div>
  );
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseImportFile(file: File): Promise<unknown> {
  return file.text().then((text) => {
    if (file.name.endsWith(".yaml") || file.name.endsWith(".yml")) {
      // Minimal YAML: only support JSON-compatible subset via JSON.parse after stripping comments is unsafe.
      // Accept YAML that is actually JSON, or simple key: value via JSON.
      try {
        return JSON.parse(text);
      } catch {
        throw new Error("YAML import supports JSON-compatible documents in Phase 1");
      }
    }
    return JSON.parse(text);
  });
}
