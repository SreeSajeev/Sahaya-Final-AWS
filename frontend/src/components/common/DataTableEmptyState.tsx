import { cn } from "@/lib/utils";

import { typography } from "./typography";

export const DEFAULT_TABLE_LOADING_LABEL = "Loading…";

export interface DataTableEmptyStateProps {
  title?: string;
  description?: string;
  filterEmpty?: boolean;
  filteredTitle?: string;
  filteredDescription?: string;
}

/** Standard empty state for `DataTableShell`. */
export function DataTableEmptyState({
  title = "No records found",
  description = "There is nothing to display yet.",
  filterEmpty = false,
  filteredTitle = "No records match your filters",
  filteredDescription = "Try adjusting your search or filter criteria.",
}: DataTableEmptyStateProps) {
  const copy = filterEmpty
    ? { title: filteredTitle, description: filteredDescription }
    : { title, description };

  return (
    <div className="flex h-48 flex-col items-center justify-center p-8 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-muted">
        <span className={typography.sectionTitle} aria-hidden>
          —
        </span>
      </div>
      <h3 className={typography.sectionTitle}>{copy.title}</h3>
      <p className={cn(typography.body, "mt-2 max-w-sm text-muted-foreground")}>{copy.description}</p>
    </div>
  );
}
