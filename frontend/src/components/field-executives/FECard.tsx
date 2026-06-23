import { FieldExecutiveWithStats } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  MapPin, 
  Phone, 
  Ticket, 
  Clock, 
  CheckCircle2,
  Wrench,
  Pencil,
  Mail,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FECardProps {
  executive: FieldExecutiveWithStats;
  onClick?: (fe: FieldExecutiveWithStats) => void;
  onEdit?: (fe: FieldExecutiveWithStats) => void;
  canEdit?: boolean;
}

/** Optional `skills.resource_kind` — defaults to own when unset (backward compatible). */
function getResourceKind(skills: unknown): 'own' | 'outsourced' {
  const k = String((skills as { resource_kind?: string } | null)?.resource_kind ?? '').toLowerCase().trim();
  return k === 'outsourced' ? 'outsourced' : 'own';
}

export function FECard({ executive, onClick, onEdit, canEdit }: FECardProps) {
  const skills = executive.skills as { categories?: string[]; resource_kind?: string } | null;
  const skillsList = skills?.categories || [];
  const resourceKind = getResourceKind(executive.skills);

  const getWorkloadLabel = (activeTickets: number) => {
    if (activeTickets === 0) return 'Available';
    if (activeTickets <= 2) return 'Low';
    if (activeTickets <= 4) return 'Moderate';
    return 'High';
  };

  return (
    <Card 
      className={cn(
        'card-interactive cursor-pointer overflow-hidden',
        !executive.active && 'opacity-60'
      )}
      onClick={() => onClick?.(executive)}
    >
      <CardHeader className="pb-3">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className={cn(
                'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white',
                executive.active
                  ? 'bg-gradient-to-br from-primary to-primary/80'
                  : 'bg-muted-foreground'
              )}
            >
              {executive.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="line-clamp-2 break-words text-base leading-snug">
                {executive.name}
              </CardTitle>
              <div className="mt-1 flex min-w-0 items-start gap-1.5 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="line-clamp-2 break-words">
                  {executive.base_location || 'No location set'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                'shrink-0 text-[10px]',
                resourceKind === 'outsourced'
                  ? 'border-amber-400 text-amber-800 bg-amber-50'
                  : 'border-slate-300 text-slate-700'
              )}
            >
              {resourceKind === 'outsourced' ? 'Outsourced' : 'Own resource'}
            </Badge>
            {canEdit && onEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(executive);
                }}
                aria-label="Edit field executive"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            <Badge
              variant={executive.active ? 'default' : 'secondary'}
              className={cn(
                'shrink-0 text-xs',
                executive.active && 'bg-green-500/10 text-green-600 border-green-200'
              )}
            >
              {executive.active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {executive.email && (
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <Mail className="h-4 w-4 mt-0.5 shrink-0" />
            <span className="break-all">{executive.email}</span>
          </div>
        )}
        {executive.phone && (
          <div className="flex min-w-0 items-start gap-2 text-sm text-muted-foreground">
            <Phone className="h-4 w-4 shrink-0" />
            <span className="min-w-0 break-all font-mono">{executive.phone}</span>
          </div>
        )}

        {skillsList.length > 0 && (
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {skillsList.slice(0, 3).map((skill) => (
              <Badge key={skill} variant="outline" className="max-w-full text-xs">
                <Wrench className="mr-1 h-3 w-3 shrink-0" />
                <span className="truncate">{skill}</span>
              </Badge>
            ))}
            {skillsList.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{skillsList.length - 3} more
              </Badge>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 pt-2 border-t">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Ticket className="h-3.5 w-3.5" />
              Active Tickets
            </div>
            <span className="text-lg font-bold">
              {executive.active_tickets}
            </span>
            <Badge variant="outline" className="text-[10px]">
              {getWorkloadLabel(executive.active_tickets)}
            </Badge>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Resolved (7d)
            </div>
            <span className="text-lg font-bold">
              {executive.resolved_this_week}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">SLA Compliance</span>
            <span className="font-semibold">
              {executive.sla_compliance_rate}%
            </span>
          </div>
          <Progress value={executive.sla_compliance_rate} className="h-1.5" />
        </div>

        <div className="flex items-center justify-between text-sm pt-2 border-t">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Avg. Resolution
          </div>
          <span className="font-medium">
            {executive.avg_resolution_time_hours > 0
              ? `${executive.avg_resolution_time_hours}h`
              : '—'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export function FECardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-start gap-3">
          <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-6 w-16" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-1.5 w-full" />
      </CardContent>
    </Card>
  );
}
