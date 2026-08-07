import { useEffect, useState } from "react";
import { AppLayoutNew } from "@/components/layout/AppLayoutNew";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listResolutionLocations, createResolutionLocation, updateResolutionLocation, type ResolutionLocation } from "@/lib/resolutionLocationsApi";
import { fetchJson } from "@/lib/backendDataApi";

export default function ResolutionLocations() {
  const [rows, setRows] = useState<ResolutionLocation[]>([]); const [name, setName] = useState(""); const [code, setCode] = useState("");
  const load = () => listResolutionLocations().then(setRows);
  const importCsv = async (file: File) => {
    const [header, ...lines] = (await file.text()).trim().split(/\r?\n/);
    const keys = header.split(",").map((v) => v.trim());
    const rows = lines.filter(Boolean).map((line) => Object.fromEntries(line.split(",").map((v, i) => [keys[i], v.trim().replace(/^"|"$/g, "")])));
    await fetchJson("/data/resolution-locations/import", { method: "POST", body: { rows } });
    load();
  };
  useEffect(() => { load(); }, []);
  return <AppLayoutNew><main className="p-6 space-y-5">
    <h1 className="text-2xl font-semibold">Resolution Locations</h1>
    <div className="flex gap-2"><Input placeholder="Location name" value={name} onChange={(e) => setName(e.target.value)} />
      <Input placeholder="Code (optional)" value={code} onChange={(e) => setCode(e.target.value)} />
      <Button onClick={async () => { if (!name.trim()) return; await createResolutionLocation({ name, code }); setName(""); setCode(""); load(); }}>Add</Button>
      <Button variant="outline" onClick={() => window.open("/data/resolution-locations/export", "_blank")}>Export CSV</Button></div>
    <Input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
    <table className="w-full text-sm"><thead><tr className="text-left border-b"><th>Name</th><th>Code</th><th>Status</th><th /></tr></thead><tbody>
      {rows.map((row) => <tr key={row.id} className="border-b"><td>{row.name}</td><td>{row.code}</td><td>{row.is_active ? "Active" : "Inactive"}</td><td><Button variant="ghost" size="sm" onClick={async () => { await updateResolutionLocation(row.id, { is_active: !row.is_active }); load(); }}>{row.is_active ? "Deactivate" : "Activate"}</Button></td></tr>)}
    </tbody></table>
  </main></AppLayoutNew>;
}
