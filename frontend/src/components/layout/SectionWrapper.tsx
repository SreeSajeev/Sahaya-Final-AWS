import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Section block matching sahaya-operations-suite elevated wrapper.
 * Optional title; content in rounded-2xl card-style container.
 */
interface SectionWrapperProps {
  title?: string;
  children: ReactNode;
  className?: string;
  /** If true, wrap content in elevated card (gradient bg, border, shadow) */
  elevated?: boolean;
}

export function SectionWrapper({
  title,
  children,
  className,
  elevated = true,
}: SectionWrapperProps) {
  return (
    <section className={cn('py-8', className)}>
      <div className="w-full md:mx-auto md:max-w-7xl px-3 md:px-6">
        {title && (
          <h2 className="mb-4 text-xl font-bold tracking-tight text-foreground md:text-2xl">
            {title}
          </h2>
        )}
        {elevated ? (
          <div className="rounded-xl border border-border bg-card p-3 shadow-card md:rounded-2xl md:p-5">
            {children}
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
