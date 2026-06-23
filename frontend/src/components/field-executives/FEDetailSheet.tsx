import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FieldExecutive } from '@/lib/types';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fetchJson } from '@/lib/backendDataApi';
import { useAuth } from '@/hooks/useAuth';
import { useTenantTerminology } from '@/hooks/useTenantTerminology';
import { toast } from '@/hooks/use-toast';
import { z } from 'zod';
import { 
  MapPin, 
  Phone, 
  Mail,
  Calendar, 
  Ticket, 
  Clock, 
  TrendingUp,
  CheckCircle2,
  Wrench,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { formatIST } from '@/lib/dateUtils';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface FEDetailSheetProps {
  executive: FieldExecutive | null;
  stats?: {
    active_tickets: number;
    resolved_this_week: number;
    avg_resolution_time_hours: number;
    sla_compliance_rate: number;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When true, user may edit FE email in this sheet (subject to org scope). */
  canEdit?: boolean;
}

export function FEDetailSheet({ 
  executive, 
  stats,
  open, 
  onOpenChange,
  canEdit = false,
}: FEDetailSheetProps) {
  const queryClient = useQueryClient();
  const { userProfile, organisationId } = useAuth();
  const terminology = useTenantTerminology(executive?.organisation_id ?? organisationId);
  const isSuperAdmin = userProfile?.role === 'SUPER_ADMIN';

  const [emailDraft, setEmailDraft] = useState('');
  useEffect(() => {
    if (executive) setEmailDraft(executive.email ?? '');
  }, [executive?.id, executive?.email]);

  const canEditEmail =
    Boolean(
      executive &&
        canEdit &&
        (isSuperAdmin ||
          (organisationId != null &&
            organisationId !== '' &&
            (executive.organisation_id ?? null) === organisationId))
    );

  const saveEmailMutation = useMutation({
    mutationFn: async () => {
      if (!executive) throw new Error('No executive');
      if (!canEditEmail) throw new Error(`You cannot edit this ${terminology.fieldExecutiveLabel.toLowerCase()}.`);
      const trimmed = emailDraft.trim();
      const emailVal = trimmed === '' ? null : trimmed;
      if (emailVal) {
        const parsed = z.string().email().max(255).safeParse(emailVal);
        if (!parsed.success) throw new Error('Invalid email address');
      }
      await fetchJson(`/field-executives/${encodeURIComponent(executive.id)}`, {
        method: 'PATCH',
        body: { email: emailVal },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['field-executives'] });
      queryClient.invalidateQueries({ queryKey: ['field-executives-with-stats'] });
      toast({ title: 'Email saved' });
    },
    onError: (err: Error) => {
      toast({ title: 'Could not save email', description: err.message, variant: 'destructive' });
    },
  });

  if (!executive) return null;

  const skills = executive.skills as { categories?: string[]; certifications?: string[] } | null;
  const skillsList = skills?.categories || [];
  const certifications = skills?.certifications || [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[500px] sm:max-w-[500px] p-0">
        <SheetHeader className="px-6 py-4 border-b bg-muted/30">
          <div className="flex items-start gap-4">
            <div className={cn(
              'flex h-14 w-14 items-center justify-center rounded-xl text-xl font-bold text-white',
              executive.active 
                ? 'bg-gradient-to-br from-primary to-primary/80' 
                : 'bg-muted-foreground'
            )}>
              {executive.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <SheetTitle className="text-xl">{executive.name}</SheetTitle>
                <Badge 
                  variant={executive.active ? 'default' : 'secondary'}
                  className={cn(
                    'text-xs',
                    executive.active && 'bg-green-500/10 text-green-600 border-green-200'
                  )}
                >
                  {executive.active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{terminology.fieldExecutiveLabel}</p>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-120px)]">
          <div className="px-6 py-4 space-y-6">
            {/* Contact Information */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Contact Information
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1 sm:col-span-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" />
                    Email
                  </div>
                  {canEditEmail ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                      <div className="flex-1 space-y-1">
                        <Label htmlFor="fe-detail-email" className="sr-only">
                          Email
                        </Label>
                        <Input
                          id="fe-detail-email"
                          type="email"
                          value={emailDraft}
                          onChange={(e) => setEmailDraft(e.target.value)}
                          placeholder="name@company.com"
                          className="font-mono text-sm"
                          autoComplete="email"
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        disabled={
                          saveEmailMutation.isPending ||
                          (emailDraft.trim() === (executive.email ?? '').trim())
                        }
                        onClick={() => saveEmailMutation.mutate()}
                      >
                        {saveEmailMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Save'
                        )}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm font-medium font-mono break-all">
                      {executive.email?.trim() ? executive.email : '—'}
                    </p>
                  )}
                </div>
                {executive.phone && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Phone className="h-3.5 w-3.5" />
                      Phone
                    </div>
                    <p className="text-sm font-medium font-mono">{executive.phone}</p>
                  </div>
                )}
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    Base Location
                  </div>
                  <p className="text-sm font-medium">{executive.base_location || 'Not set'}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    Joined
                  </div>
                  <p className="text-sm font-medium">
                    {executive.created_at 
                      ? formatIST(executive.created_at, 'MMM d, yyyy')
                      : '—'
                    }
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Skills & Certifications */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Skills & Certifications
              </h3>
              
              {skillsList.length > 0 ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Device Categories</p>
                    <div className="flex flex-wrap gap-2">
                      {skillsList.map((skill) => (
                        <Badge key={skill} variant="secondary" className="text-sm">
                          <Wrench className="h-3 w-3 mr-1.5" />
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  
                  {certifications.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Certifications</p>
                      <div className="flex flex-wrap gap-2">
                        {certifications.map((cert) => (
                          <Badge key={cert} variant="outline" className="text-sm">
                            <CheckCircle2 className="h-3 w-3 mr-1.5 text-green-600" />
                            {cert}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No skills configured</p>
              )}
            </div>

            <Separator />

            {/* Performance Metrics */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Performance Metrics
              </h3>
              
              {stats ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-muted/50 border">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                        <Ticket className="h-3.5 w-3.5" />
                        Active Tickets
                      </div>
                      <p className="text-2xl font-bold">{stats.active_tickets}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50 border">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Resolved (7 days)
                      </div>
                      <p className="text-2xl font-bold">{stats.resolved_this_week}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50 border">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                        <Clock className="h-3.5 w-3.5" />
                        Avg. Resolution
                      </div>
                      <p className="text-2xl font-bold">
                        {stats.avg_resolution_time_hours > 0 
                          ? `${stats.avg_resolution_time_hours}h` 
                          : '—'
                        }
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50 border">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                        <TrendingUp className="h-3.5 w-3.5" />
                        SLA Compliance
                      </div>
                      <p className={cn(
                        'text-2xl font-bold',
                        stats.sla_compliance_rate >= 90 && 'text-green-600',
                        stats.sla_compliance_rate >= 70 && stats.sla_compliance_rate < 90 && 'text-amber-600',
                        stats.sla_compliance_rate < 70 && 'text-red-600'
                      )}>
                        {stats.sla_compliance_rate}%
                      </p>
                    </div>
                  </div>

                  {/* SLA Compliance Bar */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Overall SLA Compliance</span>
                      <span className="font-medium">{stats.sla_compliance_rate}%</span>
                    </div>
                    <Progress 
                      value={stats.sla_compliance_rate} 
                      className="h-2"
                    />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No performance data available</p>
              )}
            </div>

            <Separator />

            {/* Workload Warning */}
            {stats && stats.active_tickets > 4 && (
              <Alert className="bg-amber-50 border-amber-200">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-sm text-amber-800">
                  This FE has a <strong>high workload</strong> with {stats.active_tickets} active tickets. 
                  Consider assigning new tickets to other available FEs.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}