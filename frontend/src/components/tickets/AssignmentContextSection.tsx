/**
 * Shared Assignment Context panel (manager + FE ticket detail).
 * Shows manager-uploaded assignment images with per-image remarks.
 */

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImageIcon } from "lucide-react";
import type { TicketComment } from "@/lib/types";
import { formatIST } from "@/lib/dateUtils";
import { extractProofImageSources } from "@/lib/extractProofAttachments";
import { FeTimelineProofs } from "@/components/fe/FeTimelineProofs";

export type AssignmentContextItem = {
  commentId: string;
  remark: string;
  uploadedAt: string | null;
  managerName: string | null;
  attachments: unknown;
};

function attObj(attachments: unknown): Record<string, unknown> {
  if (attachments && typeof attachments === "object" && !Array.isArray(attachments)) {
    return attachments as Record<string, unknown>;
  }
  return {};
}

export function listAssignmentContextItems(comments: TicketComment[]): AssignmentContextItem[] {
  const out: Array<AssignmentContextItem & { sortIndex: number }> = [];
  for (const c of comments ?? []) {
    const a = attObj(c.attachments);
    const meta = a.assignment_context;
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) continue;
    const m = meta as {
      deleted_at?: string | null;
      hidden_at?: string | null;
      remark?: string | null;
      uploaded_at?: string | null;
      uploaded_by_name?: string | null;
      sort_index?: number | null;
    };
    if (
      (m.deleted_at != null && String(m.deleted_at).trim() !== "") ||
      (m.hidden_at != null && String(m.hidden_at).trim() !== "")
    ) continue;
    const sortIndex = Number.isFinite(Number(m.sort_index)) ? Number(m.sort_index) : 0;
    out.push({
      commentId: c.id,
      remark: m.remark != null ? String(m.remark) : c.body != null ? String(c.body) : "",
      uploadedAt:
        m.uploaded_at != null
          ? String(m.uploaded_at)
          : c.created_at != null
            ? String(c.created_at)
            : null,
      sortIndex,
      managerName:
        m.uploaded_by_name != null && String(m.uploaded_by_name).trim() !== ""
          ? String(m.uploaded_by_name).trim()
          : null,
      attachments: c.attachments,
    });
  }
  out.sort((a, b) => {
    if (a.sortIndex !== b.sortIndex) return a.sortIndex - b.sortIndex;
    const ta = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
    const tb = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
    return ta - tb;
  });
  return out.map(({ sortIndex: _s, ...item }) => item);
}

type Props = {
  ticketId: string;
  comments: TicketComment[];
  /** When true, render as a Card; when false, only the inner list (for embedding). */
  asCard?: boolean;
  className?: string;
};

export function AssignmentContextSection({
  ticketId,
  comments,
  asCard = true,
  className,
}: Props) {
  const items = useMemo(() => listAssignmentContextItems(comments), [comments]);
  if (items.length === 0) return null;

  const body = (
    <div className="space-y-4">
      {items.map((item, idx) => {
        const sources = extractProofImageSources(item.attachments);
        const a = attObj(item.attachments);
        const pathCount = Array.isArray(a.proof_storage_paths)
          ? a.proof_storage_paths.length
          : 0;
        return (
          <div
            key={item.commentId}
            className="rounded-md border bg-background/60 p-3 space-y-2"
          >
            <p className="text-sm font-medium">Image {idx + 1}</p>
            <FeTimelineProofs
              ticketId={ticketId}
              commentId={item.commentId}
              inlineSources={sources}
              storagePathCount={pathCount}
            />
            <div>
              <p className="text-xs text-muted-foreground">Remark</p>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">
                {item.remark.trim() !== "" ? item.remark : "—"}
              </p>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {item.uploadedAt && (
                <span>Uploaded {formatIST(item.uploadedAt, "PPp")}</span>
              )}
              {item.managerName && <span>By {item.managerName}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );

  if (!asCard) return <div className={className}>{body}</div>;

  return (
    <Card className={className}>
      <CardHeader className="py-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ImageIcon className="h-4 w-4" />
          Assignment Context
        </CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
