import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { typography } from "./typography";

export interface DataTableShellProps {
  children: ReactNode;
  className?: string;
  /** Accessible label for the table region */
  "aria-label"?: string;
  /** Reduces perceived padding on small screens when true */
  dense?: boolean;
  /** When true, the shell allows horizontal scrolling (e.g. wide ticket tables). */
  scrollable?: boolean;
  /** Shown when the dataset is empty — replaces children */
  emptyState?: ReactNode;
  /** When true, shows a loading status region instead of children */
  loading?: boolean;
  loadingLabel?: string;
}

const defaultLoadingState = (label: string) => (
  <div
    className={cn(typography.body, "py-12 text-center text-muted-foreground")}
    role="status"
    aria-live="polite"
    aria-busy="true"
  >
    {label}
  </div>
);

/**
 * Standard bordered wrapper for operational data tables.
 *
 * Wrap shadcn `Table` (or domain tables like TicketsTable) inside this shell.
 * Does not render table markup — only the card-like container and empty/loading states.
 *
 * @example
 * ```tsx
 * import { DataTableShell } from "@/components/common/DataTableShell";
 * import { TicketsTable } from "@/components/tickets/TicketsTable";
 *
 * <DataTableShell aria-label="Tickets" emptyState={tickets.length === 0 ? undefined : null}>
 *   <TicketsTable tickets={tickets} loading={loading} />
 * </DataTableShell>
 * ```
 *
 * @example
 * ```tsx
 * // Explicit empty state
 * <DataTableShell
 *   aria-label="Users"
 *   emptyState={<p className="py-12 text-center text-sm text-muted-foreground">No users match your filters.</p>}
 * >
 *   {rows.length > 0 ? <UsersTable rows={rows} /> : null}
 * </DataTableShell>
 * ```
 */
export function DataTableShell({
  children,
  className,
  "aria-label": ariaLabel = "Data table",
  dense = false,
  scrollable = false,
  emptyState,
  loading = false,
  loadingLabel = "Loading…",
}: DataTableShellProps) {
  let content: ReactNode = children;

  if (loading) {
    content = defaultLoadingState(loadingLabel);
  } else if (emptyState !== undefined) {
    content = emptyState;
  }

  return (
    <section
      className={cn(
        "w-full min-w-0 rounded-xl border border-border bg-card shadow-sm",
        scrollable ? "overflow-x-auto overflow-y-visible" : "overflow-hidden",
        dense && "text-sm",
        className,
      )}
      aria-label={ariaLabel}
    >
      {content}
    </section>
  );
}

/**
 * Documented class overrides for shadcn TableHead when migrating domain tables.
 * Apply via className on TableHead cells for consistent operational headers.
 */
export const dataTableHeadClassName =
  "h-11 px-4 text-left align-middle font-medium uppercase tracking-wide text-muted-foreground";

/** Dense header variant */
export const dataTableHeadDenseClassName = "h-9 px-3 text-left align-middle font-medium uppercase tracking-wide text-muted-foreground";

/** Standard TableCell padding */
export const dataTableCellClassName = "p-4 align-middle";

/** Dense TableCell padding */
export const dataTableCellDenseClassName = "p-3 align-middle";
