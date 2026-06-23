import { TicketStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import { 
  Circle, 
  AlertTriangle, 
  UserCheck, 
  Truck, 
  MapPin, 
  CheckCircle2, 
  RotateCcw,
  Clock,
  XCircle
} from 'lucide-react';

interface StatusBadgeProps {
  status: TicketStatus;
  className?: string;
  showIcon?: boolean;
}

const statusConfig: Record<TicketStatus, { 
  label: string; 
  className: string; 
  icon: typeof Circle;
}> = {
  OPEN: { 
    label: 'Open', 
    className: 'status-open',
    icon: Circle
  },
  NEEDS_REVIEW: { 
    label: 'Needs Review', 
    className: 'status-needs-review',
    icon: AlertTriangle
  },
  ASSIGNED: { 
    label: 'Assigned', 
    className: 'status-assigned',
    icon: UserCheck
  },
  EN_ROUTE: { 
    label: 'En Route', 
    className: 'status-en-route',
    icon: Truck
  },
  ON_SITE: { 
    label: 'On Site', 
    className: 'status-on-site',
    icon: MapPin
  },
  RESOLVED_PENDING_VERIFICATION: { 
    label: 'Pending Verify', 
    className: 'status-pending',
    icon: Clock
  },
  RESOLVED: { 
    label: 'Resolved', 
    className: 'status-resolved',
    icon: CheckCircle2
  },
  REOPENED: { 
    label: 'Reopened', 
    className: 'status-reopened',
    icon: RotateCcw
  },
  FE_ATTEMPT_FAILED: { 
    label: 'Attempt Failed', 
    className: 'status-fe-attempt-failed',
    icon: AlertTriangle
  },
  REJECTED: { 
    label: 'Rejected', 
    className: 'status-rejected',
    icon: XCircle
  },
};

export function StatusBadge({ status, className, showIcon = true }: StatusBadgeProps) {
  const config = statusConfig[status] || { 
    label: status, 
    className: 'status-open',
    icon: Circle
  };
  
  const Icon = config.icon;
  
  return (
    <span className={cn('status-badge', config.className, className)}>
      {showIcon && <Icon className="h-3 w-3" />}
      {config.label}
    </span>
  );
}
