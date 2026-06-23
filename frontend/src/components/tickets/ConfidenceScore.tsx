import React from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface ConfidenceScoreProps {
  score?: number | null;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showProgress?: boolean;
}

export function ConfidenceScore({
  score,
  showLabel = true,
  size = 'md',
  showProgress = false,
}: ConfidenceScoreProps) {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  const numericScore = Number(score);

  const getConfidenceMeta = (value: number) => {
    if (value >= 95) return { 
      label: 'High', 
      color: 'confidence-high',
      bgColor: 'bg-success/15',
      icon: CheckCircle2,
      progressColor: 'bg-success'
    };
    if (value >= 80) return { 
      label: 'Medium', 
      color: 'confidence-medium',
      bgColor: 'bg-warning/15',
      icon: AlertCircle,
      progressColor: 'bg-warning'
    };
    return { 
      label: 'Low', 
      color: 'confidence-low',
      bgColor: 'bg-destructive/15',
      icon: XCircle,
      progressColor: 'bg-destructive'
    };
  };

  const { label, color, bgColor, icon: Icon, progressColor } = getConfidenceMeta(numericScore);

  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-lg',
  };

  if (size === 'lg' && showProgress) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn('flex h-8 w-8 items-center justify-center rounded-full', bgColor)}>
              <Icon className={cn('h-4 w-4', color)} />
            </div>
            <div>
              <span className={cn('text-2xl font-bold tabular-nums', color)}>
                {numericScore.toFixed(0)}%
              </span>
              {showLabel && (
                <p className="text-xs text-muted-foreground">{label} Confidence</p>
              )}
            </div>
          </div>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div 
            className={cn('h-full rounded-full transition-all duration-500', progressColor)}
            style={{ width: `${numericScore}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-1.5', sizeClasses[size])}>
      <span className={cn(
        'flex h-5 w-5 items-center justify-center rounded-full',
        size === 'sm' && 'h-4 w-4',
        bgColor
      )}>
        <Icon className={cn(
          'h-3 w-3',
          size === 'sm' && 'h-2.5 w-2.5',
          color
        )} />
      </span>
      <span className={cn('font-semibold tabular-nums', color)}>
        {numericScore.toFixed(0)}%
      </span>
      {showLabel && size !== 'sm' && (
        <span className="text-muted-foreground">
          ({label})
        </span>
      )}
    </div>
  );
}
