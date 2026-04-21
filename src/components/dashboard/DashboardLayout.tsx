import { ReactNode, useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { PageTransition } from './PageTransition';
import { cn } from '@/lib/utils';

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sidebar-collapsed') === 'true';
    }
    return false;
  });

  return (
    <div
      className="relative min-h-screen text-foreground"
      style={{ background: 'var(--paper)' }}
    >
      <Sidebar onCollapsedChange={setSidebarCollapsed} />
      <div
        className={cn(
          'min-h-screen transition-all duration-200',
          sidebarCollapsed ? 'ml-[60px]' : 'ml-[240px]',
        )}
      >
        <Header />
        <main>
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
