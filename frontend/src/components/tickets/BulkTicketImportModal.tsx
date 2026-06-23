import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { fetchJson } from "@/lib/backendDataApi";
import { parseCsvText, csvRowsToObjects } from "@/lib/csvParse";
import { downloadBulkTicketTemplate } from "@/lib/bulkTicketTemplate";
import {
  BULK_TICKET_COMPLAINT_ID_ALIASES,
  BULK_TICKET_IMPORT_MAX_ROWS,
  BULK_TICKET_TEMPLATE_HEADERS,
} from "@/lib/bulkTicketImportFeature";
import { Download, Loader2, Upload, FileSpreadsheet, CheckCircle2 } from "lucide-react";

type ImportStep = "upload" | "preview" | "result";

export type ImportPreviewRow = {
  row: number;
  client_slug: string | null;
  vehicle_number: string | null;
  category: string | null;
  issue_type: string | null;
  location: string | null;
  priority: boolean | string | null;
  complaint_id: string | null;
  description: string | null;
  status: string;
  error: string | null;
  errors?: string[];
};

type ImportPreviewResponse = {
  validRows: ImportPreviewRow[];
  invalidRows: ImportPreviewRow[];
  summary: { total: number; valid: number; invalid: number };
};

type ImportConfirmResultRow = {
  row: number;
  ticket_number: string | null;
  status: string;
  error: string | null;
};

type ImportConfirmResponse = {
  summary: { total: number; created: number; failed: number };
  results: ImportConfirmResultRow[];
};

interface BulkTicketImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BulkTicketImportModal({ open, onOpenChange }: BulkTicketImportModalProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<ImportStep>("upload");
  const [parseError, setParseError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [confirmResult, setConfirmResult] = useState<ImportConfirmResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const resetState = useCallback(() => {
    setStep("upload");
    setParseError(null);
    setPreview(null);
    setConfirmResult(null);
    setBusy(false);
    setFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  useEffect(() => {
    if (!open) resetState();
  }, [open, resetState]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParseError(null);
    setPreview(null);
    setConfirmResult(null);
    setFileName(file.name);

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setParseError("Please upload a .csv file");
      return;
    }

    setBusy(true);
    try {
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsText(file);
      });

      const matrix = parseCsvText(text);
      const { rows, error } = csvRowsToObjects(matrix, BULK_TICKET_TEMPLATE_HEADERS, {
        columnAliases: { complaint_id: BULK_TICKET_COMPLAINT_ID_ALIASES },
      });
      if (error) {
        setParseError(error);
        return;
      }
      if (rows.length > BULK_TICKET_IMPORT_MAX_ROWS) {
        setParseError(
          `CSV has ${rows.length} data rows. Maximum allowed is ${BULK_TICKET_IMPORT_MAX_ROWS}. Split the file and try again.`
        );
        return;
      }

      const apiRows = rows.map((r) => ({
        row: Number(r.row) || 0,
        client_slug: r.client_slug,
        vehicle_number: r.vehicle_number,
        category: r.category,
        issue_type: r.issue_type,
        location: r.location,
        priority: r.priority,
        complaint_id: r.complaint_id,
        description: r.description,
      }));

      const result = await fetchJson<ImportPreviewResponse>("/tickets/import/preview", {
        method: "POST",
        body: { rows: apiRows },
      });

      setPreview(result);
      setStep("preview");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to parse or preview CSV";
      setParseError(msg);
      toast({ variant: "destructive", title: "Import preview failed", description: msg });
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!preview?.validRows?.length) {
      toast({
        variant: "destructive",
        title: "No valid rows",
        description: "Fix invalid rows or upload a corrected CSV.",
      });
      return;
    }

    setBusy(true);
    try {
      const result = await fetchJson<ImportConfirmResponse>("/tickets/import/confirm", {
        method: "POST",
        body: { rows: preview.validRows },
      });

      setConfirmResult(result);
      setStep("result");

      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["tenant-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["organisations-stats"] });

      const { created, failed } = result.summary;
      toast({
        title: "Import complete",
        description: `Created ${created} ticket(s)${failed > 0 ? `; ${failed} failed` : ""}.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import failed";
      toast({ variant: "destructive", title: "Import failed", description: msg });
    } finally {
      setBusy(false);
    }
  };

  const previewRows = [
    ...(preview?.validRows ?? []),
    ...(preview?.invalidRows ?? []),
  ].sort((a, b) => Number(a.row) - Number(b.row));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Bulk Ticket Upload
          </DialogTitle>
          <DialogDescription>
            Upload a CSV (max {BULK_TICKET_IMPORT_MAX_ROWS} rows). Tickets are created with the same
            rules as manual creation.
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4 py-2">
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => downloadBulkTicketTemplate()}
              >
                <Download className="h-4 w-4" />
                Download CSV Template
              </Button>
              <Button
                type="button"
                className="gap-2"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Upload CSV
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
            {fileName && (
              <p className="text-sm text-muted-foreground">
                Selected: <span className="font-medium">{fileName}</span>
              </p>
            )}
            {parseError && (
              <Alert variant="destructive">
                <AlertDescription>{parseError}</AlertDescription>
              </Alert>
            )}
            <p className="text-xs text-muted-foreground">
              Required columns: {BULK_TICKET_TEMPLATE_HEADERS.join(", ")}. At least one of category
              or issue_type per row. Priority: true/false, 1/0, or yes/no.
            </p>
          </div>
        )}

        {step === "preview" && preview && (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="secondary">Total: {preview.summary.total}</Badge>
              <Badge className="bg-emerald-600 hover:bg-emerald-600">Valid: {preview.summary.valid}</Badge>
              {preview.summary.invalid > 0 && (
                <Badge variant="destructive">Invalid: {preview.summary.invalid}</Badge>
              )}
            </div>
            <ScrollArea className="h-[min(50vh,400px)] rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Row</TableHead>
                    <TableHead>Client Short Name</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Issue Type</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Complaint ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row) => (
                    <TableRow key={row.row}>
                      <TableCell>{row.row}</TableCell>
                      <TableCell className="max-w-[100px] truncate">{row.client_slug ?? "—"}</TableCell>
                      <TableCell className="max-w-[90px] truncate">{row.vehicle_number ?? "—"}</TableCell>
                      <TableCell className="max-w-[90px] truncate">{row.category ?? "—"}</TableCell>
                      <TableCell className="max-w-[90px] truncate">{row.issue_type ?? "—"}</TableCell>
                      <TableCell className="max-w-[80px] truncate">{row.location ?? "—"}</TableCell>
                      <TableCell>{String(row.priority ?? "—")}</TableCell>
                      <TableCell className="max-w-[120px] truncate font-mono text-xs">
                        {row.complaint_id ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.status === "valid" ? "default" : "destructive"}>
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] text-xs text-destructive">
                        {row.error ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        )}

        {step === "result" && confirmResult && (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Imported successfully</span>
            </div>
            <p className="text-sm">
              Created: <strong>{confirmResult.summary.created}</strong> tickets · Failed:{" "}
              <strong>{confirmResult.summary.failed}</strong> rows
            </p>
            <ScrollArea className="h-[min(50vh,400px)] rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Ticket Number</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...confirmResult.results]
                    .sort((a, b) => a.row - b.row)
                    .map((r) => (
                      <TableRow key={r.row}>
                        <TableCell>{r.row}</TableCell>
                        <TableCell>{r.ticket_number ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={r.status === "created" ? "default" : "destructive"}>
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-destructive">{r.error ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        )}

        <DialogFooter>
          {step === "upload" && (
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
          {step === "preview" && (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  resetState();
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={busy || !preview || preview.summary.valid === 0}
                onClick={handleConfirmImport}
              >
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Continue Import
              </Button>
            </>
          )}
          {step === "result" && (
            <Button type="button" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
