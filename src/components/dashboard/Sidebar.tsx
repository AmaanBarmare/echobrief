import { Link, useLocation } from 'react-router-dom';
import {
  Mic, Calendar, CheckSquare, Users, Target, MessageSquare, Settings, ChevronLeft, Menu, Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo, LogoMark } from '@/components/ui/Logo';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';

interface SidebarProps {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  /** Mobile drawer state — owned by DashboardLayout, opened from the header. */
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

export const navItems = [
  { icon: Mic, label: 'Meetings', path: '/dashboard' },
  { icon: Calendar, label: 'Calendar', path: '/calendar' },
  { icon: CheckSquare, label: 'Action items', path: '/action-items' },
  { icon: Users, label: 'Contacts', path: '/contacts' },
  { icon: Target, label: 'Coaching', path: '/coaching' },
  { icon: MessageSquare, label: 'Ask', path: '/chat' },
  { icon: Building2, label: 'Workspace', path: '/workspace' },
  { icon: Settings, label: 'Settings', path: '/settings' },
];

export function isNavItemActive(itemPath: string, pathname: string) {
  // Meeting detail lives under /meeting/:id but belongs to the Meetings tab.
  if (itemPath === '/dashboard') {
    return pathname === '/dashboard' || pathname.startsWith('/meeting');
  }
  return pathname === itemPath;
}

function NavList({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const location = useLocation();
  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 px-2 py-2">
      {navItems.map((item) => {
        const active = isNavItemActive(item.path, location.pathname);
        return (
          <Link
            key={item.path}
            to={item.path}
            onClick={onNavigate}
            data-active={active}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'nav-item flex items-center rounded-md no-underline',
              // 44px rows on touch, tighter on pointer devices.
              collapsed ? 'justify-center py-2.5 md:py-2' : 'gap-2.5 px-2.5 py-3 md:py-2',
            )}
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.75} />
            {!collapsed && <span className="text-[14px] font-medium">{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar({ collapsed, onCollapsedChange, mobileOpen, onMobileOpenChange }: SidebarProps) {
  return (
    <>
      {/* Desktop rail — hidden below md, where the drawer takes over. */}
      <aside
        className={cn(
          'fixed bottom-0 left-0 top-0 z-40 hidden flex-col pl-safe transition-[width] duration-200 md:flex',
          collapsed ? 'w-[60px]' : 'w-[240px]',
        )}
        style={{ background: 'var(--paper)', borderRight: '1px solid var(--rule)' }}
      >
        <div
          className={cn(
            'flex h-14 items-center',
            collapsed ? 'justify-center px-2' : 'justify-between px-4',
          )}
        >
          {!collapsed ? (
            <>
              <Logo size="md" linkTo="/dashboard" />
              <button
                type="button"
                onClick={() => onCollapsedChange(true)}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
                className="surface-hover inline-flex h-8 w-8 items-center justify-center rounded-md"
                style={{ color: 'var(--ink-soft)' }}
              >
                <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </>
          ) : (
            <Link to="/dashboard" aria-label="EchoBrief home">
              <LogoMark size="md" />
            </Link>
          )}
        </div>

        {collapsed && (
          <div className="px-2 pt-1">
            <button
              type="button"
              onClick={() => onCollapsedChange(false)}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className="surface-hover flex h-9 w-full items-center justify-center rounded-md"
              style={{ color: 'var(--ink-soft)' }}
            >
              <Menu className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        )}

        <NavList collapsed={collapsed} />
      </aside>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent
          side="left"
          className="w-[270px] max-w-[85vw] p-0 pl-safe md:hidden"
          style={{ background: 'var(--paper)' }}
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Links to every section of EchoBrief.</SheetDescription>
          <div className="flex h-14 items-center px-4">
            <Logo size="md" linkTo="/dashboard" />
          </div>
          <NavList collapsed={false} onNavigate={() => onMobileOpenChange(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
