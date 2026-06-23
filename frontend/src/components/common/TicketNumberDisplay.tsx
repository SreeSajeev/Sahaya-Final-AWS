import { cn } from "@/lib/utils";
import { useTenantTerminology } from "@/hooks/useTenantTerminology";
import { typography } from "./typography";

export type TicketNumberDisplayVariant = "default" | "compact" | "prominent";

type TicketNumberDisplayProps = {
  ticketNumber: string | null | undefined;
  /** Tenant that owns the ticket; falls back to layout user org when omitted. */
  organisationId?: string | null;
  /** Typography scale — prefer over free-form `numberClassName`. */
  variant?: TicketNumberDisplayVariant;
  className?: string;
  /** @deprecated Prefer `variant`. Escape hatch for one-off overrides. */
  prefixClassName?: string;
  /** @deprecated Prefer `variant`. Escape hatch for one-off overrides. */
  numberClassName?: string;
};

const prefixBadgeBase =
  "shrink-0 rounded border border-border bg-muted/50 px-1.5 py-0.5 uppercase tracking-wide";

const variantStyles: Record<
  TicketNumberDisplayVariant,
  { number: string; numberWithPrefix: string; prefix: string }
> = {
  default: {
    number: cn(typography.body, "font-mono"),
    numberWithPrefix: cn(typography.body, "font-mono font-semibold truncate"),
    prefix: cn(typography.meta, "font-semibold"),
  },
  compact: {
    number: cn(typography.meta, "font-mono"),
    numberWithPrefix: cn(typography.meta, "font-mono font-semibold truncate"),
    prefix: cn(typography.meta, "font-semibold"),
  },
  prominent: {
    number: cn(typography.pageTitle, "font-mono"),
    numberWithPrefix: cn(typography.pageTitle, "font-mono truncate"),
    prefix: cn(typography.meta, "font-semibold"),
  },
};

/**
 * Renders stored ticket_number unchanged. When tenant terminology is enabled,
 * shows configured ticketPrefixDisplay as a muted label beside the number.
 */
export function TicketNumberDisplay({
  ticketNumber,
  organisationId,
  variant = "default",
  className,
  prefixClassName,
  numberClassName,
}: TicketNumberDisplayProps) {
  const { showTicketPrefix, ticketPrefixDisplay } = useTenantTerminology(organisationId);
  const num = ticketNumber?.trim() || "—";
  const styles = variantStyles[variant];

  if (!showTicketPrefix) {
    return (
      <span className={cn(styles.number, numberClassName, className)}>{num}</span>
    );
  }

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <span className={cn(prefixBadgeBase, styles.prefix, prefixClassName)}>
        {ticketPrefixDisplay}
      </span>
      <span className={cn(styles.numberWithPrefix, numberClassName)}>{num}</span>
    </span>
  );
}
