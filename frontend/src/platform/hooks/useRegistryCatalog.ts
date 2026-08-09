/**
 * Shared registry live updates for Metadata builders.
 * Uses SSE when available; falls back to polling with Authorization.
 */
import { useEffect, useRef, useState } from "react";
import { fetchRegistryCatalog } from "../lib/platformApi";

export function useRegistryCatalog(opts?: { pollMs?: number }) {
  const [catalog, setCatalog] = useState<Record<string, unknown> | null>(null);
  const [revision, setRevision] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollMs = opts?.pollMs ?? 8000;
  const mounted = useRef(true);

  async function reload() {
    try {
      const data = (await fetchRegistryCatalog()) as { revision?: string };
      if (!mounted.current) return;
      setCatalog(data);
      setRevision(data?.revision || null);
      setError(null);
    } catch (e) {
      if (!mounted.current) return;
      setError(e instanceof Error ? e.message : "registry load failed");
    }
  }

  useEffect(() => {
    mounted.current = true;
    void reload();
    const t = window.setInterval(() => void reload(), pollMs);
    return () => {
      mounted.current = false;
      window.clearInterval(t);
    };
  }, [pollMs]);

  return { catalog, revision, error, reload };
}
