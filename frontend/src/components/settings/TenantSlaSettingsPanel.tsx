import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchJson } from "@/lib/backendDataApi";
import { useToast } from "@/hooks/use-toast";
import {
  DEFAULT_ESCALATION_LEVELS,
  RESPONSE_PRESETS_MINUTES,
  RESOLUTION_PRESETS_MINUTES,
  formatMinutesAsHoursLabel,
  type TenantSlaConfig,
} from "@/lib/tenantSla";
import { typography } from "@/components/common";
import { Plus, RefreshCw, Trash2 } from "lucide-react";

const WEEKDAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

type Props = {
  organisationId: string | null;
  readOnly?: boolean;
};

export function TenantSlaSettingsPanel({ organisationId, readOnly = false }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [local, setLocal] = useState<TenantSlaConfig | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["tenant-sla", organisationId],
    enabled: Boolean(organisationId),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (organisationId) params.set("organisationId", organisationId);
      return fetchJson<TenantSlaConfig>(`/data/tenant-sla?${params.toString()}`);
    },
  });

  useEffect(() => {
    if (data) {
      setLocal({
        ...data,
        escalation_levels:
          Array.isArray(data.escalation_levels) && data.escalation_levels.length > 0
            ? data.escalation_levels
            : [...DEFAULT_ESCALATION_LEVELS],
        working_days: Array.isArray(data.working_days) ? data.working_days : [1, 2, 3, 4, 5],
      });
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!local || !organisationId) throw new Error("Missing SLA configuration");
      return fetchJson<TenantSlaConfig>("/data/tenant-sla", {
        method: "PUT",
        body: {
          organisation_id: organisationId,
          response_minutes: local.response_minutes,
          resolution_minutes: local.resolution_minutes,
          escalation_levels: local.escalation_levels,
          business_hours_enabled: local.business_hours_enabled,
          start_time: local.start_time,
          end_time: local.end_time,
          working_days: local.working_days,
        },
      });
    },
    onSuccess: (saved) => {
      toast({ title: "SLA configuration saved" });
      setLocal(saved);
      queryClient.invalidateQueries({ queryKey: ["tenant-sla", organisationId] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Could not save SLA", description: err.message });
    },
  });

  if (!organisationId) {
    return <p className="text-sm text-muted-foreground">Select an organisation to configure SLA.</p>;
  }

  if (isLoading || !local) {
    return <p className="text-sm text-muted-foreground">Loading SLA configuration…</p>;
  }

  const responsePresets = local.presets?.response_minutes ?? RESPONSE_PRESETS_MINUTES;
  const resolutionPresets = local.presets?.resolution_minutes ?? RESOLUTION_PRESETS_MINUTES;

  return (
    <Card>
      <CardHeader>
        <CardTitle className={typography.sectionTitle}>SLA Configuration</CardTitle>
        <CardDescription className={typography.body}>
          Response and resolution targets are snapshotted onto each new ticket. Changing these values
          does not alter historical tickets. Business hours are stored for future use; current
          calculations use elapsed wall-clock time (24×7).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Response SLA</Label>
            <Select
              disabled={readOnly}
              value={String(local.response_minutes)}
              onValueChange={(v) => setLocal((c) => (c ? { ...c, response_minutes: Number(v) } : c))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {responsePresets.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {formatMinutesAsHoursLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Stored as {local.response_minutes} minutes.</p>
          </div>
          <div className="space-y-2">
            <Label>Resolution SLA</Label>
            <Select
              disabled={readOnly}
              value={String(local.resolution_minutes)}
              onValueChange={(v) =>
                setLocal((c) => (c ? { ...c, resolution_minutes: Number(v) } : c))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {resolutionPresets.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {formatMinutesAsHoursLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Stored as {local.resolution_minutes} minutes.</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Label>Escalation levels</Label>
            {!readOnly && local.escalation_levels.length < 5 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setLocal((c) => {
                    if (!c) return c;
                    const nextPercent =
                      (c.escalation_levels[c.escalation_levels.length - 1]?.percent ?? 100) + 25;
                    return {
                      ...c,
                      escalation_levels: [
                        ...c.escalation_levels,
                        { level: c.escalation_levels.length + 1, percent: nextPercent },
                      ],
                    };
                  })
                }
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add level
              </Button>
            ) : null}
          </div>
          <div className="space-y-2">
            {local.escalation_levels.map((lvl, idx) => (
              <div key={lvl.level} className="flex flex-wrap items-center gap-2">
                <span className="w-16 text-sm font-medium">Level {idx + 1}</span>
                <span className="text-sm text-muted-foreground">After</span>
                <Input
                  type="number"
                  className="w-24"
                  min={1}
                  max={500}
                  disabled={readOnly}
                  value={lvl.percent}
                  onChange={(e) => {
                    const percent = Number(e.target.value);
                    setLocal((c) => {
                      if (!c) return c;
                      const escalation_levels = c.escalation_levels.map((x, i) =>
                        i === idx ? { ...x, percent } : x
                      );
                      return { ...c, escalation_levels };
                    });
                  }}
                />
                <span className="text-sm text-muted-foreground">%</span>
                {!readOnly && local.escalation_levels.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setLocal((c) => {
                        if (!c) return c;
                        return {
                          ...c,
                          escalation_levels: c.escalation_levels
                            .filter((_, i) => i !== idx)
                            .map((x, i) => ({ level: i + 1, percent: x.percent })),
                        };
                      })
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3 rounded-md border p-4">
          <Label>Business hours</Label>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                disabled={readOnly}
                checked={!local.business_hours_enabled}
                onChange={() => setLocal((c) => (c ? { ...c, business_hours_enabled: false } : c))}
              />
              24×7
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                disabled={readOnly}
                checked={local.business_hours_enabled}
                onChange={() => setLocal((c) => (c ? { ...c, business_hours_enabled: true } : c))}
              />
              Business Hours
            </label>
          </div>
          {local.business_hours_enabled ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="sla-start">Start time</Label>
                <Input
                  id="sla-start"
                  type="time"
                  disabled={readOnly}
                  value={local.start_time || "09:00"}
                  onChange={(e) => setLocal((c) => (c ? { ...c, start_time: e.target.value } : c))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sla-end">End time</Label>
                <Input
                  id="sla-end"
                  type="time"
                  disabled={readOnly}
                  value={local.end_time || "18:00"}
                  onChange={(e) => setLocal((c) => (c ? { ...c, end_time: e.target.value } : c))}
                />
              </div>
              <div className="sm:col-span-2 space-y-2">
                <Label>Working days</Label>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((d) => {
                    const on = local.working_days.includes(d.value);
                    return (
                      <button
                        key={d.value}
                        type="button"
                        disabled={readOnly}
                        className={`rounded border px-2 py-1 text-xs ${on ? "bg-primary text-primary-foreground" : "bg-background"}`}
                        onClick={() =>
                          setLocal((c) => {
                            if (!c) return c;
                            const set = new Set(c.working_days);
                            if (set.has(d.value)) set.delete(d.value);
                            else set.add(d.value);
                            return { ...c, working_days: [...set].sort() };
                          })
                        }
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {!readOnly ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Reload
            </Button>
            <Button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving…" : "Save SLA configuration"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
