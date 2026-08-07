import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DataTableEmptyState,
  DataTableShell,
  dataTableHeadClassName,
  DEFAULT_TABLE_LOADING_LABEL,
} from "@/components/common";
import { fetchJson } from "@/lib/backendDataApi";
import { parseCsvText, csvRowsToObjects } from "@/lib/csvParse";
import { useToast } from "@/hooks/use-toast";
import { Download, FileUp, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { typography } from "@/components/common";
import ExcelJS from "exceljs";

export type ClientVehicle = {
  id: string;
  organisation_id: string;
  client_id: string;
  vehicle_number: string;
  vehicle_type: string | null;
  vehicle_name: string | null;
  registration_number: string | null;
  description: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

type VehicleForm = {
  vehicle_number: string;
  vehicle_name: string;
  vehicle_type: string;
  registration_number: string;
  description: string;
};

const EMPTY_FORM: VehicleForm = {
  vehicle_number: "",
  vehicle_name: "",
  vehicle_type: "",
  registration_number: "",
  description: "",
};

function downloadTextFile(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function parseVehicleUploadFile(file: File): Promise<Record<string, string>[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buf = await file.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const sheet = wb.worksheets[0];
    if (!sheet) throw new Error("Excel file has no worksheets");
    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cells = (row.values as unknown[]).slice(1).map((v) => (v == null ? "" : String(v).trim()));
      if (cells.some((c) => c)) rows.push(cells);
    });
    if (rows.length < 2) return [];
    const header = rows[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
    return rows.slice(1).map((cells) => {
      /** @type {Record<string, string>} */
      const obj: Record<string, string> = {};
      header.forEach((h, i) => {
        obj[h] = String(cells[i] ?? "").trim();
      });
      return obj;
    });
  }
  const text = await file.text();
  const grid = parseCsvText(text);
  const parsed = csvRowsToObjects(
    grid,
    ["vehicle_number", "vehicle_type", "vehicle_name", "registration_number", "description"],
    {
      columnAliases: {
        vehicle_number: ["Vehicle Number", "vehicle number", "vehicle_no"],
        vehicle_type: ["Vehicle Type", "type"],
        vehicle_name: ["Vehicle Name", "name"],
        registration_number: ["Registration Number", "registration", "reg_no"],
        description: ["Description", "desc"],
      },
    }
  );
  if (parsed.error) throw new Error(parsed.error);
  return parsed.rows;
}

type Props = {
  clientId: string;
  clientName: string;
  canWrite: boolean;
};

export function ClientVehiclesPanel({ clientId, clientName, canWrite }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ClientVehicle | null>(null);
  const [form, setForm] = useState<VehicleForm>(EMPTY_FORM);
  const [importBusy, setImportBusy] = useState(false);

  const queryKey = useMemo(() => ["client-vehicles", clientId, search] as const, [clientId, search]);

  const {
    data,
    isLoading,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      const q = params.toString();
      return await fetchJson<{ items: ClientVehicle[]; total: number; active: number }>(
        `/data/clients/${encodeURIComponent(clientId)}/vehicles${q ? `?${q}` : ""}`
      );
    },
  });

  const vehicles = data?.items ?? [];
  const total = data?.total ?? vehicles.length;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        vehicle_number: form.vehicle_number.trim().toUpperCase(),
        vehicle_name: form.vehicle_name.trim() || null,
        vehicle_type: form.vehicle_type.trim() || null,
        registration_number: form.registration_number.trim() || null,
        description: form.description.trim() || null,
      };
      if (editing) {
        return fetchJson<ClientVehicle>(
          `/data/clients/${encodeURIComponent(clientId)}/vehicles/${encodeURIComponent(editing.id)}`,
          { method: "PATCH", body }
        );
      }
      return fetchJson<ClientVehicle>(`/data/clients/${encodeURIComponent(clientId)}/vehicles`, {
        method: "POST",
        body,
      });
    },
    onSuccess: () => {
      toast({ title: editing ? "Vehicle updated" : "Vehicle added" });
      setDialogOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      queryClient.invalidateQueries({ queryKey: ["client-vehicles", clientId] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Could not save vehicle", description: err.message });
    },
  });

  const patchStatus = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      return fetchJson<ClientVehicle>(
        `/data/clients/${encodeURIComponent(clientId)}/vehicles/${encodeURIComponent(id)}`,
        { method: "PATCH", body: { is_active } }
      );
    },
    onSuccess: (_d, vars) => {
      toast({ title: vars.is_active ? "Vehicle reactivated" : "Vehicle deactivated" });
      queryClient.invalidateQueries({ queryKey: ["client-vehicles", clientId] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Update failed", description: err.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return fetchJson<{ success: boolean }>(
        `/data/clients/${encodeURIComponent(clientId)}/vehicles/${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
    },
    onSuccess: () => {
      toast({ title: "Vehicle deleted" });
      queryClient.invalidateQueries({ queryKey: ["client-vehicles", clientId] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Delete failed", description: err.message });
    },
  });

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (v: ClientVehicle) => {
    setEditing(v);
    setForm({
      vehicle_number: v.vehicle_number ?? "",
      vehicle_name: v.vehicle_name ?? "",
      vehicle_type: v.vehicle_type ?? "",
      registration_number: v.registration_number ?? "",
      description: v.description ?? "",
    });
    setDialogOpen(true);
  };

  const handleExport = async () => {
    try {
      const tokenRes = await fetch(
        `/data/clients/${encodeURIComponent(clientId)}/vehicles/export`,
        { credentials: "include" }
      );
      if (!tokenRes.ok) {
        const err = await tokenRes.json().catch(() => ({}));
        throw new Error(err?.error || "Export failed");
      }
      const text = await tokenRes.text();
      downloadTextFile(`vehicles-${clientName || clientId}.csv`, text);
      toast({ title: "Vehicles exported" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Export failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  const handleDownloadTemplate = () => {
    downloadTextFile(
      "vehicle-import-template.csv",
      "Vehicle Number,Vehicle Type,Vehicle Name,Registration Number,Description\n"
    );
  };

  const handleImportFile = async (file: File) => {
    setImportBusy(true);
    try {
      const rows = await parseVehicleUploadFile(file);
      if (rows.length === 0) {
        toast({ variant: "destructive", title: "No data rows found in file" });
        return;
      }
      const result = await fetchJson<{
        summary: { imported: number; skipped_duplicates: number; invalid: number };
        error_csv: string | null;
      }>(`/data/clients/${encodeURIComponent(clientId)}/vehicles/import`, {
        method: "POST",
        body: { rows },
      });
      const s = result.summary;
      toast({
        title: "Import complete",
        description: `Imported: ${s.imported}. Skipped duplicates: ${s.skipped_duplicates}. Invalid rows: ${s.invalid}.`,
      });
      if (result.error_csv) {
        downloadTextFile(`vehicle-import-errors.csv`, result.error_csv);
      }
      queryClient.invalidateQueries({ queryKey: ["client-vehicles", clientId] });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Import failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setImportBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Vehicles</h2>
          <p className="text-sm text-muted-foreground">
            Total vehicles: <span className="font-medium text-foreground">{total}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {canWrite ? (
            <>
              <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                <Download className="mr-2 h-4 w-4" />
                Download Template
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" />
                Export Vehicles
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={importBusy}
                onClick={() => fileRef.current?.click()}
              >
                <FileUp className="mr-2 h-4 w-4" />
                {importBusy ? "Importing…" : "Bulk Upload"}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleImportFile(f);
                }}
              />
              <Button size="sm" onClick={openAdd}>
                <Plus className="mr-2 h-4 w-4" />
                Add Vehicle
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="max-w-sm">
        <Label htmlFor="vehicle-search">Search</Label>
        <Input
          id="vehicle-search"
          className="mt-1"
          placeholder="Number, name, type, registration…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <DataTableShell
        aria-label="Client vehicles"
        loading={isLoading}
        loadingLabel={DEFAULT_TABLE_LOADING_LABEL}
        emptyState={
          !isLoading && vehicles.length === 0 ? (
            <DataTableEmptyState
              title="No vehicles yet"
              description="Add vehicles manually or bulk upload a CSV/Excel file."
            />
          ) : undefined
        }
      >
        {!isLoading && vehicles.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={dataTableHeadClassName}>Vehicle Number</TableHead>
                  <TableHead className={dataTableHeadClassName}>Vehicle Name</TableHead>
                  <TableHead className={dataTableHeadClassName}>Vehicle Type</TableHead>
                  <TableHead className={dataTableHeadClassName}>Registration</TableHead>
                  <TableHead className={dataTableHeadClassName}>Status</TableHead>
                  {canWrite ? <TableHead className={dataTableHeadClassName}>Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehicles.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className={cn(typography.body, "font-mono text-xs")}>
                      {v.vehicle_number}
                    </TableCell>
                    <TableCell className={typography.body}>{v.vehicle_name?.trim() || "—"}</TableCell>
                    <TableCell className={typography.meta}>{v.vehicle_type?.trim() || "—"}</TableCell>
                    <TableCell className={typography.meta}>
                      {v.registration_number?.trim() || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={v.is_active ? "default" : "secondary"}>
                        {v.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    {canWrite ? (
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(v)}>
                            <Pencil className="h-3.5 w-3.5" />
                            <span className="sr-only">Edit</span>
                          </Button>
                          {v.is_active ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => patchStatus.mutate({ id: v.id, is_active: false })}
                            >
                              Deactivate
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => patchStatus.mutate({ id: v.id, is_active: true })}
                            >
                              Reactivate
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => {
                              if (window.confirm(`Delete vehicle ${v.vehicle_number}?`)) {
                                deleteMutation.mutate(v.id);
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </DataTableShell>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Vehicle" : "Add Vehicle"}</DialogTitle>
            <DialogDescription>
              Vehicle numbers are unique per client and stored in uppercase.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label htmlFor="veh-number">Vehicle Number *</Label>
              <Input
                id="veh-number"
                className="font-mono"
                value={form.vehicle_number}
                onChange={(e) =>
                  setForm((f) => ({ ...f, vehicle_number: e.target.value.toUpperCase() }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="veh-name">Vehicle Name</Label>
              <Input
                id="veh-name"
                value={form.vehicle_name}
                onChange={(e) => setForm((f) => ({ ...f, vehicle_name: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="veh-type">Vehicle Type</Label>
              <Input
                id="veh-type"
                value={form.vehicle_type}
                onChange={(e) => setForm((f) => ({ ...f, vehicle_type: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="veh-reg">Registration Number</Label>
              <Input
                id="veh-reg"
                value={form.registration_number}
                onChange={(e) => setForm((f) => ({ ...f, registration_number: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="veh-desc">Description</Label>
              <Textarea
                id="veh-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saveMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !form.vehicle_number.trim()}
            >
              {saveMutation.isPending ? "Saving…" : editing ? "Save changes" : "Add Vehicle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
