import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Mic, Calendar, CheckSquare, Settings, ChevronLeft, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo, LogoMark } from '@/components/ui/Logo';

interface SidebarProps {
  onCollapsedChange?: (collapsed: boolean) => void;
}

const navItems = [
  { icon: Mic, label: 'Meetings', path: '/dashboard' },
  { icon: Calendar, label: 'Calendar', path: '/calendar' },
  { icon: CheckSquare, label: 'Action items', path: '/action-items' },
  { icon: Settings, label: 'Settings', path: '/settings' },
];

export function Sidebar({ onCollapsedChange }: SidebarProps) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sidebar-collapsed') === 'true';
    }
    return false;
  });

  const handleCollapsedChange = (newCollapsed: boolean) => {
    setCollapsed(newCollapsed);
    localStorage.setItem('sidebar-collapsed', String(newCollapsed));
    onCollapsedChange?.(newCollapsed);
    window.dispatchEvent(new Event('storage'));
  };

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 bottom-0 z-40 flex flex-col transition-all duration-200',
        collapsed ? 'w-[60px]' : 'w-[240px]',
      )}
      style={{
        background: 'var(--paper)',
        borderRight: '1px solid var(--rule)',
      }}
    >
      {/* Logo row */}
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
              onClick={() => handleCollapsedChange(true)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors"
              style={{ color: 'var(--ink-soft)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in oklch, var(--ink) 6%, transparent)'; e.currentTarget.style.color = 'var(--ink)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ink-soft)'; }}
              title="Collapse"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </>
        ) : (
          <Link to="/dashboard">
            <LogoMark size="md" />
          </Link>
        )}
      </div>

      {collapsed && (
        <div className="px-2 pt-1">
          <button
            onClick={() => handleCollapsedChange(false)}
            className="flex h-9 w-full items-center justify-center rounded-md transition-colors"
            style={{ color: 'var(--ink-soft)' }}
            title="Expand"
          >
            <Menu className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      )}

      {/* Nav */}
      <nav className={cn('flex flex-1 flex-col gap-0.5 py-2', collapsed ? 'px-2' : 'px-2')}>
        {navItems.map((item) => {
          const isActive =
            item.path === '/dashboard'
              ? location.pathname === '/dashboard' || location.pathname.startsWith('/meeting')
              : location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex items-center rounded-md transition-colors no-underline',
                collapsed ? 'justify-center py-2' : 'gap-2.5 px-2.5 py-2',
              )}
              style={{
                background: isActive ? 'color-mix(in oklch, var(--ember) 10%, transparent)' : 'transparent',
                color: isActive ? 'var(--ember-deep)' : 'var(--ink-mid)',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'color-mix(in oklch, var(--ink) 5%, transparent)';
                  e.currentTarget.style.color = 'var(--ink)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = 'var(--ink-mid)';
                }
              }}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="h-[16px] w-[16px] flex-shrink-0" strokeWidth={1.75} />
              {!collapsed && (
                <span
                  className="text-[14px]"
                  style={{ fontWeight: isActive ? 600 : 500 }}
                >
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
