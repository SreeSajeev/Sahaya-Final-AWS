import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { typography } from "./typography";

export type MetricCardVariant =
  | "default"
  | "primary"
  | "accent"
  | "success"
  | "warning"
  | "danger";

export type MetricCardSize = "sm" | "md";

export type MetricCardLayout = "stacked" | "horizontal";

export interface MetricCardTrend {
  value: number;
  positive: boolean;
}

export interface MetricCardProps {
  /** KPI label — rendered with meta typography */
  label: string;
  value: string | number;
  description?: string;
  icon?: LucideIcon;
  /** Optional icon slot when a custom node is needed instead of LucideIcon */
  iconSlot?: ReactNode;
  variant?: MetricCardVariant;
  trend?: MetricCardTrend;
  /** `sm` (24px) for summary rows; `md` (30px) for dashboard hero metrics */
  size?: MetricCardSize;
  /** `stacked` = label above value; `horizontal` = icon left, value above label */
  layout?: MetricCardLayout;
  /** Enables hover lift via `.card-interactive` */
  interactive?: boolean;
  className?: string;
}

const variantStyles: Record<MetricCardVariant, string> = {
  default: "border-border bg-card hover:shadow-md",
  primary: "stat-card-primary border-0 text-white",
  accent: "stat-card-accent border-0 text-white",
  success: "border-success/20 bg-success/8 hover:bg-success/12",
  warning: "border-warning/20 bg-warning/8 hover:bg-warning/12",
  danger: "border-destructive/20 bg-destructive/8 hover:bg-destructive/12",
};

const iconVariantStyles: Record<MetricCardVariant, string> = {
  default: "bg-primary/10 text-primary",
  primary: "bg-white/20 text-white",
  accent: "bg-white/20 text-white",
  success: "bg-success/20 text-success",
  warning: "bg-warning/20 text-warning",
  danger: "bg-destructive/20 text-destructive",
};

const sizeValueClasses: Record<MetricCardSize, string> = {
  sm: typography.kpiValue,
  md: typography.kpiValueLg,
};

function MetricCardIcon({
  resolvedIcon,
  variant,
}: {
  resolvedIcon: ReactNode;
  variant: MetricCardVariant;
}) {
  return (
    <div
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
        iconVariantStyles[variant],
      )}
      aria-hidden
    >
      {resolvedIcon}
    </div>
  );
}

function MetricCardTrendBadge({ trend }: { trend: MetricCardTrend }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold",
        trend.positive ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive",
      )}
      aria-label={`Trend ${trend.positive ? "up" : "down"} ${Math.abs(trend.value)} percent`}
    >
      {trend.positive ? (
        <TrendingUp className="h-3 w-3" aria-hidden />
      ) : (
        <TrendingDown className="h-3 w-3" aria-hidden />
      )}
      {Math.abs(trend.value)}%
    </span>
  );
}

/**
 * Standard KPI / metric card for dashboards and list summaries.
 *
 * Typography: meta label, `kpi-value` for the number, meta for description.
 * Reuses existing `.stat-card-primary` / `.stat-card-accent` CSS for gradient variants.
 *
 * @example
 * ```tsx
 * import { Users } from "lucide-react";
 * import { MetricCard } from "@/components/common/MetricCard";
 *
 * <MetricCard
 *   label="Active users"
 *   value={42}
 *   description="Currently signed in"
 *   icon={Users}
 *   variant="default"
 * />
 * ```
 *
 * @example
 * ```tsx
 * // Horizontal layout (Users page style)
 * <MetricCard label="Total Users" value={128} icon={Users} layout="horizontal" />
 * ```
 *
 * @example
 * ```tsx
 * // Large dashboard hero metric with hover lift
 * <MetricCard
 *   label="Open tickets"
 *   value={128}
 *   variant="accent"
 *   size="md"
 *   interactive
 *   trend={{ value: 12, positive: false }}
 * />
 * ```
 */
export function MetricCard({
  label,
  value,
  description,
  icon: Icon,
  iconSlot,
  variant = "default",
  trend,
  size = "sm",
  layout = "stacked",
  interactive = false,
  className,
}: MetricCardProps) {
  const isGradient = variant === "primary" || variant === "accent";
  const resolvedIcon = iconSlot ?? (Icon ? <Icon className="h-5 w-5" aria-hidden /> : null);

  const valueClassName = cn(
    sizeValueClasses[size],
    "break-words",
    isGradient ? "text-white" : "text-foreground",
  );

  const labelClassName = cn(
    typography.meta,
    "uppercase tracking-wide",
    isGradient ? "text-white/80" : undefined,
  );

  const descriptionClassName = cn(
    typography.meta,
    "mt-1.5 font-normal",
    isGradient ? "text-white/60" : undefined,
  );

  return (
    <Card
      className={cn(
        "w-full min-w-0 border shadow-sm transition-all duration-200",
        interactive && "card-interactive",
        variantStyles[variant],
        className,
      )}
    >
      <CardContent className="p-4 md:p-6">
        {layout === "horizontal" ? (
          <div className="flex items-center gap-4">
            {resolvedIcon ? (
              <MetricCardIcon resolvedIcon={resolvedIcon} variant={variant} />
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <p className={valueClassName} aria-label={`${label}: ${value}`}>
                  {value}
                </p>
                {trend ? <MetricCardTrendBadge trend={trend} /> : null}
              </div>
              <p className={cn(typography.meta, isGradient ? "text-white/80" : undefined)}>
                {label}
              </p>
              {description ? <p className={descriptionClassName}>{description}</p> : null}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className={labelClassName}>{label}</p>

              <div className="mt-1 flex flex-wrap items-baseline gap-2">
                <p className={valueClassName} aria-label={`${label}: ${value}`}>
                  {value}
                </p>
                {trend ? <MetricCardTrendBadge trend={trend} /> : null}
              </div>

              {description ? <p className={descriptionClassName}>{description}</p> : null}
            </div>

            {resolvedIcon ? (
              <MetricCardIcon resolvedIcon={resolvedIcon} variant={variant} />
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export interface StatGridProps {
  children: ReactNode;
  /** Column count on large screens — defaults to 4 */
  columns?: 2 | 3 | 4;
  className?: string;
}

const columnClasses: Record<NonNullable<StatGridProps["columns"]>, string> = {
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
};

/**
 * Responsive grid wrapper for MetricCard rows.
 *
 * @example
 * ```tsx
 * <StatGrid>
 *   <MetricCard label="Total" value={10} />
 *   <MetricCard label="Open" value={3} variant="warning" />
 *   <MetricCard label="Resolved" value={7} variant="success" />
 *   <MetricCard label="SLA" value="98%" />
 * </StatGrid>
 * ```
 */
export function StatGrid({ children, columns = 4, className }: StatGridProps) {
  return (
    <div
      className={cn(
        "grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6",
        columnClasses[columns],
        className,
      )}
      role="list"
      aria-label="Key metrics"
    >
      {children}
    </div>
  );
}
