/**
 * Shared operational UI primitives (design system v1).
 *
 * @see docs/design-system-v1.md
 * @see docs/component-migration-plan.md
 */

export { PageHeader } from "./PageHeader";
export type { PageHeaderProps } from "./PageHeader";

export { MetricCard, StatGrid } from "./MetricCard";
export type {
  MetricCardProps,
  MetricCardTrend,
  MetricCardVariant,
  MetricCardSize,
  MetricCardLayout,
  StatGridProps,
} from "./MetricCard";

export {
  FilterBar,
  FILTER_SELECT_WIDTH,
  FILTER_SELECT_WIDTH_WIDE,
} from "./FilterBar";
export type { FilterBarProps, FilterBarSearchConfig } from "./FilterBar";

export {
  DataTableShell,
  dataTableCellClassName,
  dataTableCellDenseClassName,
  dataTableHeadClassName,
  dataTableHeadDenseClassName,
} from "./DataTableShell";
export type { DataTableShellProps } from "./DataTableShell";

export { typography } from "./typography";

export {
  DataTableEmptyState,
  DEFAULT_TABLE_LOADING_LABEL,
} from "./DataTableEmptyState";
export type { DataTableEmptyStateProps } from "./DataTableEmptyState";

export { TicketNumberDisplay } from "./TicketNumberDisplay";
export type { TicketNumberDisplayVariant } from "./TicketNumberDisplay";
