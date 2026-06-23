import { ReactNode } from 'react';
import { MobileSidebarWrapper } from './MobileSidebarWrapper';

/**
 * New app layout matching sahaya-operations-suite structure.
 * Sidebar + main. Each page composes HeroSection, SectionWrapper, etc. with their own max-w-7xl px-6.
 * Routing, auth, and role guards are unchanged — presentation only.
 */
interface AppLayoutNewProps {
  children: ReactNode;
}

export function AppLayoutNew({ children }: AppLayoutNewProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <MobileSidebarWrapper />
      <main className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden scrollbar-thin bg-background pt-14 px-0 md:pt-0">
        {children}
      </main>
    </div>
  );
}
