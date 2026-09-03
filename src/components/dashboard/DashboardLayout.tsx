import { ReactNode, useCallback, useState } from 'react';
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const handleCollapsedChange = useCallback((collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
    localStorage.setItem('sidebar-collapsed', String(collapsed));
  }, []);

  return (
    <div className="relative min-h-screen text-foreground" style={{ background: 'var(--paper)' }}>
      <a href="#main-content" className="skip-to-content">
        Skip to content
      </a>

      <Sidebar
        collapsed={sidebarCollapsed}
        onCollapsedChange={handleCollapsedChange}
        mobileOpen={mobileNavOpen}
        onMobileOpenChange={setMobileNavOpen}
      />

      {/* The rail is only rendered from `md` up, so the offset must be too —
          this margin used to be unconditional, which left a 390px phone with a
          150px content column and horizontal scroll on every page. */}
      <div
        className={cn(
          'min-h-screen transition-[margin] duration-200',
          sidebarCollapsed ? 'md:ml-[60px]' : 'md:ml-[240px]',
        )}
      >
        <Header onMenuClick={() => setMobileNavOpen(true)} />
        <main id="main-content" className="pb-safe">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
