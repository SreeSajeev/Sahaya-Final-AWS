import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createPlatformRuntimeTicket,
  fetchPlatformRuntimeTickets,
  updatePlatformSettings,
} from "../lib/platformApi";
import { usePlatformSettings } from "../hooks/usePlatformSettings";

export default function MetadataRuntimePage() {
  const { data: settings, refetch } = usePlatformSettings();
  const mode = (settings as { mode?: string } | undefined)?.mode;
  const qc = useQueryClient();
  const tickets = useQuery({
    queryKey: ["platform-runtime-tickets"],
    queryFn: fetchPlatformRuntimeTickets,
    enabled: mode === "METADATA",
  });
  const createMut = useMutation({
    mutationFn: () =>
      createPlatformRuntimeTicket({
        source: "manual",
        data: { title: "Sample metadata ticket", priority: "MEDIUM" },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["platform-runtime-tickets"] }),
  });

  if (mode !== "METADATA") {
    return (
      <p className="text-sm text-slate-600">
        Runtime tickets live only in METADATA mode (`platform_tickets`). Legacy `tickets` table is never used
        here.
      </p>
    );
  }

  const items = ((tickets.data as { items?: unknown[] } | undefined)?.items || []) as Array<{
    id: string;
    ticket_number: string;
    status_key: string;
  }>;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Metadata Runtime</h2>
      <p className="text-sm text-slate-600">
        Industry-agnostic tickets. No vehicles, complaint IDs, or FE tokens — only metadata fields.
      </p>
      <button
        type="button"
        className="rounded bg-slate-900 px-3 py-2 text-sm text-white"
        onClick={() => createMut.mutate()}
      >
        Create sample ticket
      </button>
      <ul className="space-y-2 text-sm">
        {items.map((t) => (
          <li key={t.id} className="rounded border bg-white px-3 py-2">
            {t.ticket_number} · {t.status_key}
          </li>
        ))}
      </ul>
      <button type="button" className="text-xs text-slate-500 underline" onClick={() => refetch()}>
        Refresh settings
      </button>
    </div>
  );
}

export function MetadataSettingsPage() {
  const { data, refetch, isFetching } = usePlatformSettings();
  const mode = (data as { mode?: string } | undefined)?.mode ?? "LEGACY";
  const mut = useMutation({
    mutationFn: (next: string) => updatePlatformSettings({ mode: next }),
    onSuccess: () => refetch(),
  });

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Platform Settings</h2>
      <p className="text-sm text-slate-600">
        Default is LEGACY. Only SUPER_ADMIN may enable METADATA (enforced by API).
      </p>
      <p className="text-sm">
        Current: <strong>{mode}</strong> {isFetching ? "(refreshing…)" : ""}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded border px-3 py-2 text-sm"
          onClick={() => mut.mutate("LEGACY")}
        >
          Set LEGACY
        </button>
        <button
          type="button"
          className="rounded bg-emerald-700 px-3 py-2 text-sm text-white"
          onClick={() => mut.mutate("METADATA")}
        >
          Request METADATA
        </button>
      </div>
      {mut.isError && (
        <p className="text-sm text-red-600">{(mut.error as Error)?.message || "Update failed"}</p>
      )}
    </div>
  );
}
