import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto scrollbar-thin bg-background">
        <div className="w-full md:mx-auto h-full md:max-w-7xl space-y-10 px-3 md:px-6 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
