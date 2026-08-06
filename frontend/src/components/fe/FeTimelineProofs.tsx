/**
 * Renders proof thumbnails for a timeline comment.
 * Prefer inline base64/URL sources; fall back to short-lived presigned S3 URLs.
 */

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/backendDataApi";
import { ProofAttachmentGallery } from "@/components/tickets/ProofAttachmentGallery";
import { ProofImageViewerOverlay } from "@/components/tickets/ProofImageViewerOverlay";

type Props = {
  ticketId: string;
  commentId: string | null;
  inlineSources: string[];
  storagePathCount: number;
};

export function FeTimelineProofs({
  ticketId,
  commentId,
  inlineSources,
  storagePathCount,
}: Props) {
  const [signed, setSigned] = useState<string[]>([]);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerSources, setViewerSources] = useState<string[] | null>(null);

  useEffect(() => {
    if (inlineSources.length > 0 || !commentId || storagePathCount <= 0) {
      setSigned([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const urls: string[] = [];
      for (let i = 0; i < storagePathCount; i += 1) {
        try {
          const res = await fetchJson<{ url?: string }>(
            `/data/tickets/${encodeURIComponent(ticketId)}/comments/${encodeURIComponent(commentId)}/proofs/${i}/url`
          );
          if (res?.url) urls.push(res.url);
        } catch {
          // Historical / unavailable proof — skip quietly.
        }
      }
      if (!cancelled) setSigned(urls);
    })();
    return () => {
      cancelled = true;
    };
  }, [ticketId, commentId, inlineSources.length, storagePathCount]);

  const sources = inlineSources.length > 0 ? inlineSources : signed;
  if (!sources.length) return null;

  return (
    <>
      <ProofAttachmentGallery
        sources={sources}
        imgClassName="max-h-40 rounded border object-contain"
        onOpenAtIndex={(index) => {
          setViewerSources(sources);
          setViewerIndex(index);
          setViewerOpen(true);
        }}
      />
      <ProofImageViewerOverlay
        open={viewerOpen && !!viewerSources?.length}
        sources={viewerSources ?? undefined}
        initialIndex={viewerIndex}
        onClose={() => {
          setViewerOpen(false);
          setTimeout(() => setViewerSources(null), 0);
        }}
      />
    </>
  );
}
