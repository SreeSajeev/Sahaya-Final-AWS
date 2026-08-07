import { useEffect, useMemo, useState } from "react";
import { AppLayoutNew } from "@/components/layout/AppLayoutNew";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  listResolutionLocations,
  createResolutionLocation,
  updateResolutionLocation,
  downloadResolutionLocationsCsv,
  type ResolutionLocation,
} from "@/lib/resolutionLocationsApi";
import { fetchJson } from "@/lib/backendDataApi";
import { useToast } from "@/hooks/use-toast";

export default function ResolutionLocations() {
  const { toast } = useToast();
  const [rows, setRows] = useState<ResolutionLocation[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async (q = search) => {
    setRows(await listResolutionLocations(false, q));
  };

  const importCsv = async (file: File) => {
    const text = (await file.text()).trim();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) {
      toast({ title: "Import failed", description: "CSV needs a header and at least one row.", variant: "destructive" });
      return;
    }
    const keys = lines[0].split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const parsedRows = lines.slice(1).map((line) => {
      const cells = line.match(/("([^"]|"")*"|[^,]*)/g)?.map((v) => v.replace(/^"|"$/g, "").replace(/""/g, '"').trim()) ?? [];
      return Object.fromEntries(keys.map((key, i) => [key, cells[i] ?? ""]));
    });
    await fetchJson("/data/resolution-locations/import", { method: "POST", body: { rows: parsedRows } });
    await load();
    toast({ title: "Import complete" });
  };

  useEffect(() => {
    void load("");
  }, []);

  const filteredHint = useMemo(() => {
    if (!search.trim()) return `${rows.length} location(s)`;
    return `${rows.length} match(es) for “${search.trim()}”`;
  }, [rows.length, search]);

  return (
    <AppLayoutNew>
      <main className="p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-semibold">Resolution Locations</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Master list of attended locations used on Verify &amp; Close. Snapshots preserve names on historical tickets.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 items-end">
          <Input
            className="max-w-xs"
            placeholder="Search name or code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void load(search);
            }}
          />
          <Button type="button" variant="secondary" onClick={() => void load(search)}>
            Search
          </Button>
          <Button type="button" variant="ghost" onClick={() => { setSearch(""); void load(""); }}>
            Clear
          </Button>
          <span className="text-xs text-muted-foreground self-center">{filteredHint}</span>
        </div>

        <div className="flex flex-wrap gap-2">
          <Input className="max-w-xs" placeholder="Location name *" value={name} onChange={(e) => setName(e.target.value)} />
          <Input className="max-w-[10rem]" placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} />
          <Input className="max-w-sm" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
          <Button
            disabled={busy || !name.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await createResolutionLocation({ name, code, description });
                setName("");
                setCode("");
                setDescription("");
                await load(search);
              } finally {
                setBusy(false);
              }
            }}
          >
            Add
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={async () => {
              try {
                await downloadResolutionLocationsCsv();
                toast({ title: "CSV downloaded" });
              } catch (err) {
                toast({
                  title: "Export failed",
                  description: err instanceof Error ? err.message : "Could not export",
                  variant: "destructive",
                });
              }
            }}
          >
            Export CSV
          </Button>
        </div>

        <Input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => e.target.files?.[0] && void importCsv(e.target.files[0])}
        />

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2">Name</th>
              <th>Code</th>
              <th>Description</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b align-top">
                <td className="py-2 pr-2">
                  {editingId === row.id ? (
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                  ) : (
                    row.name
                  )}
                </td>
                <td className="pr-2">
                  {editingId === row.id ? (
                    <Input value={editCode} onChange={(e) => setEditCode(e.target.value)} />
                  ) : (
                    row.code || "—"
                  )}
                </td>
                <td className="pr-2 text-muted-foreground">{row.description || "—"}</td>
                <td>{row.is_active ? "Active" : "Inactive"}</td>
                <td className="space-x-1 whitespace-nowrap">
                  {editingId === row.id ? (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          await updateResolutionLocation(row.id, {
                            name: editName,
                            code: editCode || null,
                          });
                          setEditingId(null);
                          await load(search);
                        }}
                      >
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(row.id);
                          setEditName(row.name);
                          setEditCode(row.code ?? "");
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          await updateResolutionLocation(row.id, { is_active: !row.is_active });
                          await load(search);
                        }}
                      >
                        {row.is_active ? "Deactivate" : "Activate"}
                      </Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-muted-foreground">
                  No resolution locations yet. Add at least one so Verify &amp; Close can require attended location.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </main>
    </AppLayoutNew>
  );
}
