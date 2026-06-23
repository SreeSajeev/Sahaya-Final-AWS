import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { typography } from "./typography";

export interface PageHeaderProps {
  /** Primary page heading — rendered as the sole h1 */
  title?: string;
  /** Custom title node (replaces `title` h1 when set) */
  titleSlot?: ReactNode;
  /** Optional supporting line below the title */
  description?: string;
  /** Optional decorative icon inside the standard primary gradient box */
  icon?: LucideIcon;
  /** Toolbar actions (buttons, menus) aligned to the end on larger screens */
  actions?: ReactNode;
  /** Optional leading control (e.g. back button) before icon/title */
  leading?: ReactNode;
  className?: string;
}

/**
 * Standard operational page header.
 *
 * Typography: `page-title` for h1, `body` + muted for description.
 * Icon box uses the unified primary gradient (no per-page color variants).
 *
 * @example
 * ```tsx
 * import { Plus, Users } from "lucide-react";
 * import { Button } from "@/components/ui/button";
 * import { PageHeader } from "@/components/common/PageHeader";
 *
 * <PageHeader
 *   title="Users"
 *   description="Manage users in your tenant"
 *   icon={Users}
 *   actions={
 *     <Button size="sm">
 *       <Plus className="h-4 w-4" aria-hidden />
 *       Add User
 *     </Button>
 *   }
 * />
 * ```
 *
 * @example
 * ```tsx
 * // Title only (no icon, no actions)
 * <PageHeader title="All Tickets" description="View and manage service tickets" />
 * ```
 */
export function PageHeader({
  title,
  titleSlot,
  description,
  icon: Icon,
  actions,
  leading,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex w-full min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        {leading}
        {Icon ? (
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80"
            aria-hidden
          >
            <Icon className="h-5 w-5 text-primary-foreground" />
          </div>
        ) : null}

        <div className="min-w-0 flex-1">
          {titleSlot ? (
            <div className="break-words">{titleSlot}</div>
          ) : (
            <h1 className={cn(typography.pageTitle, "text-foreground break-words")}>{title}</h1>
          )}
          {description ? (
            <p className={cn(typography.body, "mt-0.5 text-muted-foreground break-words")}>
              {description}
            </p>
          ) : null}
        </div>
      </div>

      {actions ? (
        <div
          className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end"
          role="toolbar"
          aria-label={`${title} actions`}
        >
          {actions}
        </div>
      ) : null}
    </header>
  );
}
