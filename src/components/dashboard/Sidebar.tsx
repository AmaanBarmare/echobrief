import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Mic, 
  Calendar, 
  CheckSquare, 
  Settings, 
  LogOut,
  ChevronLeft,
  Menu
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Logo, LogoMark } from '@/components/ui/Logo';

interface SidebarProps {
  onCollapsedChange?: (collapsed: boolean) => void;
}

const navItems = [
  { icon: Mic, label: 'Meetings', path: '/dashboard' },
  { icon: Calendar, label: 'Calendar', path: '/calendar' },
  { icon: CheckSquare, label: 'Action Items', path: '/action-items' },
  { icon: Settings, label: 'Settings', path: '/settings' },
];

export function Sidebar({ onCollapsedChange }: SidebarProps) {
  const location = useLocation();
  const { signOut, user } = useAuth();
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

  const userInitial = user?.email?.[0]?.toUpperCase() || '?';

  return (
    <aside 
      className={cn(
        "fixed left-0 top-0 bottom-0 bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-200 z-50",
        collapsed ? "w-14" : "w-[220px]"
      )}
    >
      {/* Header with Logo */}
      <div className={cn(
        "flex items-center px-3 border-b border-sidebar-border",
        collapsed ? "h-14 justify-center" : "h-14 justify-between"
      )}>
        {!collapsed && (
          <Logo size="md" linkTo="/dashboard" className="px-2" />
        )}
        {collapsed && (
          <Link to="/dashboard">
            <LogoMark size="md" />
          </Link>
        )}
        {!collapsed && (
          <button
            onClick={() => handleCollapsedChange(!collapsed)}
            className="p-1.5 rounded-md hover:bg-sidebar-accent text-muted-foreground hover:text-sidebar-foreground transition-colors"
            title="Collapse sidebar"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Expand button when collapsed */}
      {collapsed && (
        <div className="p-2">
          <button
            onClick={() => handleCollapsedChange(false)}
            className="w-full p-1.5 rounded-md hover:bg-sidebar-accent text-muted-foreground hover:text-sidebar-foreground transition-colors flex items-center justify-center"
            title="Expand sidebar"
          >
            <Menu className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5 mt-4">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-sm font-medium transition-all duration-150",
                isActive 
                  ? "text-orange-300 bg-orange-500/[0.08]" 
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary",
                collapsed && "justify-center px-0"
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User Section */}
      <div className={cn(
        "p-3 border-t border-sidebar-border",
        collapsed && "flex flex-col items-center"
      )}>
        {!collapsed && (
          <div className="flex items-center gap-2.5 px-3 py-2 mb-1">
            <div 
              className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold text-white"
              style={{ background: 'linear-gradient(135deg, #F97316, #F59E0B)' }}
            >
              {userInitial}
            </div>
            <span className="text-sm text-muted-foreground truncate flex-1">
              {user?.email?.split('@')[0]}
            </span>
          </div>
        )}
        <button
          onClick={signOut}
          className={cn(
            "flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-sm font-medium w-full transition-all duration-150",
            "text-muted-foreground hover:text-foreground hover:bg-secondary",
            collapsed && "justify-center px-0"
          )}
          title={collapsed ? "Sign out" : undefined}
        >
          <LogOut className="w-4 h-4" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
