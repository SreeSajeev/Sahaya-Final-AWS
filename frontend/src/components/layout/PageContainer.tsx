import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Standard page content container matching sahaya-operations-suite.
 * max-w-7xl mx-auto px-6 space-y-10
 */
interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

export function PageContainer({ children, className = '' }: PageContainerProps) {
  return (
    <div className={cn('w-full min-w-0 space-y-6 px-3 pt-6 md:mx-auto md:max-w-7xl md:space-y-10 md:px-6 md:pt-8', className)}>
      {children}
    </div>
  );
}
