import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { dataTableHeadClassName, typography } from "@/components/common";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ComplaintPoint } from "@/lib/complaintPointsApi";
import { Copy, Pencil, QrCode, RefreshCw, Ban } from "lucide-react";
import { cn } from "@/lib/utils";

function formatCreatedAt(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

type ComplaintPointTableProps = {
  points: ComplaintPoint[];
  isLoading: boolean;
  isSuperAdmin: boolean;
  orgNameById: Map<string, string>;
  onEdit: (point: ComplaintPoint) => void;
  onDisable: (point: ComplaintPoint) => void;
  onRegenerateToken: (point: ComplaintPoint) => void;
  onCopyUrl: (url: string) => void;
  onViewQr: (point: ComplaintPoint) => void;
};

export function ComplaintPointTable({
  points,
  isLoading,
  isSuperAdmin,
  orgNameById,
  onEdit,
  onDisable,
  onRegenerateToken,
  onCopyUrl,
  onViewQr,
}: ComplaintPointTableProps) {
  if (isLoading || points.length === 0) {
    return null;
  }

  return (
    <TooltipProvider>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={dataTableHeadClassName}>Name</TableHead>
            <TableHead className={dataTableHeadClassName}>Location</TableHead>
            <TableHead className={dataTableHeadClassName}>Sub Location</TableHead>
            {isSuperAdmin ? <TableHead className={dataTableHeadClassName}>Tenant</TableHead> : null}
            <TableHead className={dataTableHeadClassName}>Status</TableHead>
            <TableHead className={dataTableHeadClassName}>Public URL</TableHead>
            <TableHead className={dataTableHeadClassName}>Created</TableHead>
            <TableHead className={cn(dataTableHeadClassName, "text-right")}>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {points.map((p) => {
            const publicUrl = p.public_url ?? "";
            const isDisabled = p.status === "disabled";
            return (
              <TableRow
                key={p.id}
                className={cn(isDisabled && "bg-muted/30 opacity-60")}
              >
                <TableCell className={cn(typography.body, "font-medium")}>{p.name}</TableCell>
                <TableCell className={typography.body}>{p.building ?? "—"}</TableCell>
                <TableCell className={typography.body}>{p.floor ?? "—"}</TableCell>
                {isSuperAdmin ? (
                  <TableCell className={typography.body}>
                    {orgNameById.get(p.organisation_id) ?? p.organisation_id}
                  </TableCell>
                ) : null}
                <TableCell>
                  <Badge variant={isDisabled ? "secondary" : "default"}>
                    {p.status}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[200px]">
                  {publicUrl ? (
                    <div className="flex items-center gap-2">
                      <span className={cn(typography.meta, "truncate font-mono")} title={publicUrl}>
                        {publicUrl}
                      </span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            onClick={() => onCopyUrl(publicUrl)}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Copy public URL</TooltipContent>
                      </Tooltip>
                    </div>
                  ) : (
                    <span className={typography.meta}>—</span>
                  )}
                </TableCell>
                <TableCell className={cn(typography.meta, "whitespace-nowrap")}>
                  {formatCreatedAt(p.created_at)}
                </TableCell>
                <TableCell className="text-right">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={() => onEdit(p)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Edit</TooltipContent>
                  </Tooltip>
                  {publicUrl ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onCopyUrl(publicUrl)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Copy URL</TooltipContent>
                    </Tooltip>
                  ) : null}
                  {publicUrl ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onViewQr(p)}
                        >
                          <QrCode className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>View QR</TooltipContent>
                    </Tooltip>
                  ) : null}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onRegenerateToken(p)}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Regenerate token</TooltipContent>
                  </Tooltip>
                  {p.status === "active" ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDisable(p)}
                        >
                          <Ban className="h-4 w-4 text-destructive" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Deactivate</TooltipContent>
                    </Tooltip>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TooltipProvider>
  );
}
