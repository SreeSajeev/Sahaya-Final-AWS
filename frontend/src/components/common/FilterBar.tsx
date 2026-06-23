import { Search } from "lucide-react";
import type { ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface FilterBarSearchConfig {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Required for screen readers */
  "aria-label": string;
  id?: string;
}

export interface FilterBarProps {
  /** Optional search field on the leading edge */
  search?: FilterBarSearchConfig;
  /** Select triggers, date inputs, and other primary filters */
  children?: ReactNode;
  /** Secondary row — date ranges, sort controls (TicketsList pattern) */
  secondary?: ReactNode;
  /** Pin filters below the app header while scrolling (AuditLogs pattern) */
  sticky?: boolean;
  className?: string;
  /** Accessible name for the filter region */
  "aria-label"?: string;
}

/**
 * Standard filter / search toolbar for list pages.
 *
 * Layout: primary row (search + filters), optional muted secondary strip.
 * Does not own filter state — pages pass controlled values via `search` and `children`.
 *
 * @example
 * ```tsx
 * import { FilterBar } from "@/components/common/FilterBar";
 * import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
 *
 * <FilterBar
 *   aria-label="Ticket filters"
 *   search={{
 *     value: searchInput,
 *     onChange: setSearchInput,
 *     placeholder: "Search tickets…",
 *     "aria-label": "Search tickets",
 *   }}
 * >
 *   <Select value={status} onValueChange={setStatus}>
 *     <SelectTrigger className="w-[160px]" aria-label="Filter by status">
 *       <SelectValue placeholder="Status" />
 *     </SelectTrigger>
 *     <SelectContent>
 *       <SelectItem value="all">All</SelectItem>
 *     </SelectContent>
 *   </Select>
 * </FilterBar>
 * ```
 *
 * @example
 * ```tsx
 * // With date/sort secondary strip
 * <FilterBar
 *   search={{ value: q, onChange: setQ, "aria-label": "Search users" }}
 *   secondary={
 *     <div className="flex flex-wrap items-center gap-3">
 *       <input type="date" aria-label="From date" />
 *       <input type="date" aria-label="To date" />
 *     </div>
 *   }
 * />
 * ```
 */
export function FilterBar({
  search,
  children,
  secondary,
  sticky = false,
  className,
  "aria-label": ariaLabel = "Filters",
}: FilterBarProps) {
  const searchId = search?.id ?? "filter-bar-search";

  return (
    <div
      className={cn(
        "w-full min-w-0 space-y-3",
        sticky &&
          "sticky top-0 z-20 rounded-lg border border-border bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        className,
      )}
      role="search"
      aria-label={ariaLabel}
    >
      <div className="flex flex-wrap items-center gap-4">
        {search ? (
          <div className="relative min-w-[200px] max-w-sm flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id={searchId}
              type="search"
              value={search.value}
              onChange={(event) => search.onChange(event.target.value)}
              placeholder={search.placeholder}
              className="pl-9"
              aria-label={search["aria-label"]}
            />
          </div>
        ) : null}

        {children}
      </div>

      {secondary ? (
        <div
          className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-muted/20 p-4"
          role="group"
          aria-label={`${ariaLabel} advanced`}
        >
          {secondary}
        </div>
      ) : null}
    </div>
  );
}

/** Standard width for filter Select triggers — use on SelectTrigger className */
export const FILTER_SELECT_WIDTH = "w-[160px]" as const;

/** Wider select for long option labels (e.g. ticket status) */
export const FILTER_SELECT_WIDTH_WIDE = "w-[180px]" as const;
