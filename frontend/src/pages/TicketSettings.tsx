import { useState, useEffect, useRef } from "react";
import { AppLayoutNew } from "@/components/layout/AppLayoutNew";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader, typography } from "@/components/common";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useOrganisationsTable } from "@/hooks/useOrganisationsTable";
import { useToast } from "@/hooks/use-toast";
import { Sliders, Clock, ListOrdered, Plus, X, RefreshCw, Type } from "lucide-react";
import { fetchJson } from "@/lib/backendDataApi";
import { isTenantConfigurationEnabled } from "@/lib/tenantConfigurationFeature";
import { fetchOrganisationById } from "@/lib/tenantTicketsSupabase";
import {
  getOrgTicketConfigKey,
  DEFAULT_FIELD_EXECUTIVE_LABEL,
  DEFAULT_TICKET_PREFIX_DISPLAY,
  type OrgTicketConfig,
} from "@/lib/orgTicketConfig";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type { OrgTicketConfig };

const TICKET_PREFIX_PATTERN = /^[A-Za-z0-9-]+$/;

const defaultConfig: OrgTicketConfig = {
  categories: [],
  issueTypes: [],
  resolutionCategories: [],
  sla: {
    assignmentHours: 4,
    onsiteHours: 24,
    resolutionHours: 48,
  },
  ticketPrefixDisplay: DEFAULT_TICKET_PREFIX_DISPLAY,
  fieldExecutiveLabel: DEFAULT_FIELD_EXECUTIVE_LABEL,
};

function normalizeLoadedConfig(raw: Record<string, unknown> | null | undefined): OrgTicketConfig {
  const v = raw && typeof raw === "object" ? raw : {};
  return {
    categories: Array.isArray(v.categories) ? (v.categories as string[]) : [],
    issueTypes: Array.isArray(v.issueTypes) ? (v.issueTypes as string[]) : [],
    resolutionCategories: Array.isArray(v.resolutionCategories)
      ? (v.resolutionCategories as string[])
      : [],
    sla: {
      assignmentHours:
        typeof (v.sla as OrgTicketConfig["sla"] | undefined)?.assignmentHours === "number"
          ? (v.sla as OrgTicketConfig["sla"]).assignmentHours
          : defaultConfig.sla.assignmentHours,
      onsiteHours:
        typeof (v.sla as OrgTicketConfig["sla"] | undefined)?.onsiteHours === "number"
          ? (v.sla as OrgTicketConfig["sla"]).onsiteHours
          : defaultConfig.sla.onsiteHours,
      resolutionHours:
        typeof (v.sla as OrgTicketConfig["sla"] | undefined)?.resolutionHours === "number"
          ? (v.sla as OrgTicketConfig["sla"]).resolutionHours
          : defaultConfig.sla.resolutionHours,
    },
    ticketPrefixDisplay:
      typeof v.ticketPrefixDisplay === "string" && v.ticketPrefixDisplay.trim()
        ? v.ticketPrefixDisplay.trim()
        : DEFAULT_TICKET_PREFIX_DISPLAY,
    fieldExecutiveLabel:
      typeof v.fieldExecutiveLabel === "string" && v.fieldExecutiveLabel.trim()
        ? v.fieldExecutiveLabel.trim()
        : DEFAULT_FIELD_EXECUTIVE_LABEL,
  };
}

/** Merge editor state into last server JSON so unknown keys are never dropped. */
function buildSavePayload(
  local: OrgTicketConfig,
  serverRaw: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...serverRaw,
    categories: local.categories,
    issueTypes: local.issueTypes,
    resolutionCategories: local.resolutionCategories ?? [],
    sla: local.sla,
    ...(isTenantConfigurationEnabled()
      ? {
          ticketPrefixDisplay: local.ticketPrefixDisplay?.trim() || DEFAULT_TICKET_PREFIX_DISPLAY,
          fieldExecutiveLabel: local.fieldExecutiveLabel?.trim() || DEFAULT_FIELD_EXECUTIVE_LABEL,
        }
      : {}),
  };
}

function validateTerminology(config: OrgTicketConfig): string | null {
  const prefix = config.ticketPrefixDisplay?.trim() || "";
  if (prefix && (prefix.length > 20 || !TICKET_PREFIX_PATTERN.test(prefix))) {
    return "Ticket prefix must be 1–20 characters (letters, numbers, hyphens only).";
  }
  const label = config.fieldExecutiveLabel?.trim() || "";
  if (label.length > 80) {
    return "Field executive label must be 80 characters or fewer.";
  }
  return null;
}

export default function TicketSettings() {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const organisationId = userProfile?.organisation_id ?? null;
  const isAdmin = userProfile?.role === "ADMIN";
  const isSuperAdmin = userProfile?.role === "SUPER_ADMIN";
  const terminologyEnabled = isTenantConfigurationEnabled();

  const [superAdminOrgId, setSuperAdminOrgId] = useState<string>("");
  const [localConfig, setLocalConfig] = useState<OrgTicketConfig>(defaultConfig);
  const [newCategory, setNewCategory] = useState("");
  const [newIssueType, setNewIssueType] = useState("");
  const [newResolutionCategory, setNewResolutionCategory] = useState("");
  const serverValueRef = useRef<Record<string, unknown>>({});
  const [reviewFieldLabel, setReviewFieldLabel] = useState("");
  const [reviewFieldHelperText, setReviewFieldHelperText] = useState("");

  const { data: organisations = [] } = useOrganisationsTable();
  const effectiveOrgId = isSuperAdmin ? (superAdminOrgId || null) : organisationId;
  const configKey = effectiveOrgId ? getOrgTicketConfigKey(effectiveOrgId) : null;
  const readOnly = isSuperAdmin;

  const { data: orgRow } = useQuery({
    queryKey: ["ticket-settings-org", effectiveOrgId],
    enabled: Boolean(effectiveOrgId),
    queryFn: async () => {
      return await fetchOrganisationById(effectiveOrgId!);
    },
  });

  useEffect(() => {
    if (!orgRow) return;
    const label = String((orgRow as { review_field_label?: string | null }).review_field_label ?? "").trim();
    const helper = String((orgRow as { review_field_helper_text?: string | null }).review_field_helper_text ?? "").trim();
    setReviewFieldLabel(label);
    setReviewFieldHelperText(helper);
  }, [orgRow?.id]);

  const { data: configRow, isLoading } = useQuery({
    queryKey: ["configurations", configKey],
    enabled: Boolean(configKey),
    queryFn: async () => {
      return await fetchJson<{ key: string; value: Record<string, unknown> | null } | null>(
        `/data/configurations/${encodeURIComponent(configKey!)}`
      );
    },
  });

  useEffect(() => {
    if (configRow?.value && typeof configRow.value === "object") {
      const raw = configRow.value as Record<string, unknown>;
      serverValueRef.current = { ...raw };
      setLocalConfig(normalizeLoadedConfig(raw));
    } else if (!configKey || !isLoading) {
      serverValueRef.current = {};
      setLocalConfig(defaultConfig);
    }
  }, [configKey, configRow, isLoading]);

  const upsertMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (!configKey) throw new Error("No tenant");
      await fetchJson<{ ok: true }>(`/data/configurations/${encodeURIComponent(configKey)}`, {
        method: "PUT",
        body: { value: payload },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["configurations", configKey] });
      toast({ title: "Saved", description: "Ticket settings updated." });
    },
    onError: (err) => {
      toast({ title: "Failed to save", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    },
  });

  const handleSave = () => {
    if (terminologyEnabled) {
      const err = validateTerminology(localConfig);
      if (err) {
        toast({ title: "Validation error", description: err, variant: "destructive" });
        return;
      }
    }
    upsertMutation.mutate(buildSavePayload(localConfig, serverValueRef.current));
  };

  const saveReviewFieldMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveOrgId) throw new Error("No tenant");
      const label = reviewFieldLabel.trim();
      const helper = reviewFieldHelperText.trim();
      await fetchJson(`/data/organisations/${encodeURIComponent(effectiveOrgId)}`, {
        method: "PATCH",
        body: {
          review_field_label: label !== "" ? label : null,
          review_field_helper_text: helper !== "" ? helper : null,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-settings-org", effectiveOrgId] });
      toast({ title: "Saved", description: "Review & close notes settings updated." });
    },
    onError: (err) => {
      toast({
        title: "Failed to save",
        description: err instanceof Error ? err.message : "Error",
        variant: "destructive",
      });
    },
  });

  const addCategory = () => {
    const t = newCategory.trim();
    if (!t) return;
    if (localConfig.categories.includes(t)) {
      setNewCategory("");
      return;
    }
    setLocalConfig((c) => ({ ...c, categories: [...c.categories, t].sort() }));
    setNewCategory("");
  };

  const removeCategory = (item: string) => {
    setLocalConfig((c) => ({ ...c, categories: c.categories.filter((x) => x !== item) }));
  };

  const addIssueType = () => {
    const t = newIssueType.trim();
    if (!t) return;
    if (localConfig.issueTypes.includes(t)) {
      setNewIssueType("");
      return;
    }
    setLocalConfig((c) => ({ ...c, issueTypes: [...c.issueTypes, t].sort() }));
    setNewIssueType("");
  };

  const removeIssueType = (item: string) => {
    setLocalConfig((c) => ({ ...c, issueTypes: c.issueTypes.filter((x) => x !== item) }));
  };

  const addResolutionCategory = () => {
    const t = newResolutionCategory.trim();
    if (!t) return;
    const list = localConfig.resolutionCategories ?? [];
    if (list.includes(t)) {
      setNewResolutionCategory("");
      return;
    }
    setLocalConfig((c) => ({
      ...c,
      resolutionCategories: [...(c.resolutionCategories ?? []), t].sort(),
    }));
    setNewResolutionCategory("");
  };

  const removeResolutionCategory = (item: string) => {
    setLocalConfig((c) => ({
      ...c,
      resolutionCategories: (c.resolutionCategories ?? []).filter((x) => x !== item),
    }));
  };

  if (!isSuperAdmin && !organisationId) {
    return (
      <AppLayoutNew>
        <PageContainer>
          <p className="text-muted-foreground">Tenant context required.</p>
        </PageContainer>
      </AppLayoutNew>
    );
  }

  if (!isSuperAdmin && !isAdmin) {
    return (
      <AppLayoutNew>
        <PageContainer>
          <p className="text-muted-foreground">Tenant Admin access required to configure ticket settings.</p>
        </PageContainer>
      </AppLayoutNew>
    );
  }

  const pageSubtitle = readOnly
    ? "View ticket configuration for a tenant (read-only)"
    : terminologyEnabled
      ? "Categories, issue types, terminology, and SLA hours for your tenant"
      : "Categories, issue types, and SLA hours for your tenant";

  return (
    <AppLayoutNew>
      <PageContainer>
        <div className="space-y-6">
          <PageHeader
            title="Ticket Settings"
            description={pageSubtitle}
            icon={Sliders}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                {isSuperAdmin && (
                  <Select value={superAdminOrgId || "none"} onValueChange={(v) => setSuperAdminOrgId(v === "none" ? "" : v)}>
                    <SelectTrigger className="w-[220px]">
                      <SelectValue placeholder="Select tenant" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select tenant</SelectItem>
                      {(organisations as { id: string; name: string; slug?: string }[]).map((org) => (
                        <SelectItem key={org.id} value={org.id}>
                          {org.name} {org.slug ? `(${org.slug})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {!readOnly && (
                  <Button onClick={handleSave} disabled={upsertMutation.isPending}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${upsertMutation.isPending ? "animate-spin" : ""}`} />
                    {upsertMutation.isPending ? "Saving…" : "Save"}
                  </Button>
                )}
              </div>
            }
          />

          {!effectiveOrgId ? (
            isSuperAdmin ? (
              <p className={typography.body}>Select a tenant to view its ticket configuration.</p>
            ) : (
              <p className={typography.body}>Loading…</p>
            )
          ) : isLoading ? (
            <p className={typography.body}>Loading…</p>
          ) : (
            <div className="space-y-6">
              {terminologyEnabled && (
                <Card>
                  <CardHeader>
                    <CardTitle className={`flex items-center gap-2 ${typography.sectionTitle}`}>
                      <Type className="h-5 w-5" />
                      Terminology
                    </CardTitle>
                    <CardDescription className={typography.body}>
                      {readOnly
                        ? "Display labels for this tenant (stored for future UI use)."
                        : "Customise how your tenant is labelled in Sahaya. Does not change ticket workflows or generated ticket numbers."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="fe-label">Field executive label</Label>
                      <Input
                        id="fe-label"
                        readOnly={readOnly}
                        disabled={readOnly}
                        value={localConfig.fieldExecutiveLabel ?? DEFAULT_FIELD_EXECUTIVE_LABEL}
                        onChange={(e) =>
                          setLocalConfig((c) => ({ ...c, fieldExecutiveLabel: e.target.value }))
                        }
                        placeholder={DEFAULT_FIELD_EXECUTIVE_LABEL}
                        maxLength={80}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ticket-prefix-display">Ticket prefix (display)</Label>
                      <Input
                        id="ticket-prefix-display"
                        readOnly={readOnly}
                        disabled={readOnly}
                        value={localConfig.ticketPrefixDisplay ?? DEFAULT_TICKET_PREFIX_DISPLAY}
                        onChange={(e) =>
                          setLocalConfig((c) => ({ ...c, ticketPrefixDisplay: e.target.value }))
                        }
                        placeholder={DEFAULT_TICKET_PREFIX_DISPLAY}
                        maxLength={20}
                      />
                      <p className="text-xs text-muted-foreground">
                        Display hint only. Ticket numbers are assigned by the server (TKT/PKQ before cutover; PKQS/PKQE/PKQC after).
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className={typography.sectionTitle}>Review &amp; Close Notes Configuration</CardTitle>
                  <CardDescription className={typography.body}>
                    Configure the label and helper text shown on the Verify &amp; Close dialog for this tenant.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="review-field-label">Review Field Label</Label>
                    <Input
                      id="review-field-label"
                      readOnly={readOnly}
                      disabled={readOnly}
                      value={reviewFieldLabel}
                      onChange={(e) => setReviewFieldLabel(e.target.value)}
                      placeholder="Review Notes"
                      maxLength={120}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="review-field-helper">Review Field Helper Text</Label>
                    <Input
                      id="review-field-helper"
                      readOnly={readOnly}
                      disabled={readOnly}
                      value={reviewFieldHelperText}
                      onChange={(e) => setReviewFieldHelperText(e.target.value)}
                      placeholder="Add review notes before closing this ticket."
                      maxLength={240}
                    />
                  </div>
                  {!readOnly && (
                    <div className="sm:col-span-2">
                      <Button
                        type="button"
                        onClick={() => saveReviewFieldMutation.mutate()}
                        disabled={saveReviewFieldMutation.isPending || !effectiveOrgId}
                      >
                        <RefreshCw className={`h-4 w-4 mr-2 ${saveReviewFieldMutation.isPending ? "animate-spin" : ""}`} />
                        {saveReviewFieldMutation.isPending ? "Saving…" : "Save review field"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className={`flex items-center gap-2 ${typography.sectionTitle}`}>
                    <ListOrdered className="h-5 w-5" />
                    Categories & Issue Types
                  </CardTitle>
                  <CardDescription className={typography.body}>
                    {readOnly ? "Categories and issue types for this tenant." : "Add or remove categories and issue types for tickets in your tenant."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label>Categories</Label>
                    <div className="flex flex-wrap gap-2">
                      {localConfig.categories.map((item) => (
                        <Badge key={item} variant="secondary" className="gap-1">
                          {item}
                          {!readOnly && (
                            <button type="button" onClick={() => removeCategory(item)} className="ml-1 rounded hover:bg-muted" aria-label={`Remove ${item}`}>
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </Badge>
                      ))}
                    </div>
                    {!readOnly && (
                      <div className="flex gap-2">
                        <Input
                          value={newCategory}
                          onChange={(e) => setNewCategory(e.target.value)}
                          placeholder="New category"
                          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCategory())}
                        />
                        <Button type="button" variant="outline" size="sm" onClick={addCategory}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Issue Types</Label>
                    <div className="flex flex-wrap gap-2">
                      {localConfig.issueTypes.map((item) => (
                        <Badge key={item} variant="secondary" className="gap-1">
                          {item}
                          {!readOnly && (
                            <button type="button" onClick={() => removeIssueType(item)} className="ml-1 rounded hover:bg-muted" aria-label={`Remove ${item}`}>
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </Badge>
                      ))}
                    </div>
                    {!readOnly && (
                      <div className="flex gap-2">
                        <Input
                          value={newIssueType}
                          onChange={(e) => setNewIssueType(e.target.value)}
                          placeholder="New issue type"
                          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addIssueType())}
                        />
                        <Button type="button" variant="outline" size="sm" onClick={addIssueType}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Resolution Categories</Label>
                    <p className="text-xs text-muted-foreground">
                      Used in the Verify &amp; Close dialog. Removing a category disables it for new closures; existing tickets are unchanged.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(localConfig.resolutionCategories ?? []).map((item) => (
                        <Badge key={item} variant="secondary" className="gap-1">
                          {item}
                          {!readOnly && (
                            <button
                              type="button"
                              onClick={() => removeResolutionCategory(item)}
                              className="ml-1 rounded hover:bg-muted"
                              aria-label={`Remove ${item}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </Badge>
                      ))}
                    </div>
                    {!readOnly && (
                      <div className="flex gap-2">
                        <Input
                          value={newResolutionCategory}
                          onChange={(e) => setNewResolutionCategory(e.target.value)}
                          placeholder="New resolution category"
                          onKeyDown={(e) =>
                            e.key === "Enter" && (e.preventDefault(), addResolutionCategory())
                          }
                        />
                        <Button type="button" variant="outline" size="sm" onClick={addResolutionCategory}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className={`flex items-center gap-2 ${typography.sectionTitle}`}>
                    <Clock className="h-5 w-5" />
                    SLA Settings
                  </CardTitle>
                  <CardDescription className={typography.body}>
                    {readOnly ? "SLA targets (hours) for this tenant." : "Configure SLA targets (hours) for assignment, on-site, and resolution."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="sla-assignment">Assignment (hours)</Label>
                    <Input
                      id="sla-assignment"
                      type="number"
                      min={1}
                      readOnly={readOnly}
                      disabled={readOnly}
                      value={localConfig.sla.assignmentHours}
                      onChange={(e) =>
                        setLocalConfig((c) => ({
                          ...c,
                          sla: { ...c.sla, assignmentHours: Math.max(0, parseInt(e.target.value, 10) || 0) },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sla-onsite">On-site (hours)</Label>
                    <Input
                      id="sla-onsite"
                      type="number"
                      min={1}
                      readOnly={readOnly}
                      disabled={readOnly}
                      value={localConfig.sla.onsiteHours}
                      onChange={(e) =>
                        setLocalConfig((c) => ({
                          ...c,
                          sla: { ...c.sla, onsiteHours: Math.max(0, parseInt(e.target.value, 10) || 0) },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sla-resolution">Resolution (hours)</Label>
                    <Input
                      id="sla-resolution"
                      type="number"
                      min={1}
                      readOnly={readOnly}
                      disabled={readOnly}
                      value={localConfig.sla.resolutionHours}
                      onChange={(e) =>
                        setLocalConfig((c) => ({
                          ...c,
                          sla: { ...c.sla, resolutionHours: Math.max(0, parseInt(e.target.value, 10) || 0) },
                        }))
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </PageContainer>
    </AppLayoutNew>
  );
}
