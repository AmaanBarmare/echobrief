import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Home, 
  Mic,
  Calendar, 
  CheckSquare, 
  Settings, 
  LogOut,
  ChevronLeft,
  Menu,
  Search
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import echoBriefLogo from '@/assets/echobrief-logo-light.svg';

interface SidebarProps {
  onCollapsedChange?: (collapsed: boolean) => void;
}

const navItems = [
  { icon: Home, label: 'Home', path: '/dashboard' },
  { icon: Mic, label: 'Recordings', path: '/recordings' },
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

  return (
    <aside 
      className={cn(
        "fixed left-0 top-0 bottom-0 bg-[#0C0A09] border-r border-[#1C1917] flex flex-col transition-all duration-200 z-50",
        collapsed ? "w-14" : "w-[220px]"
      )}
    >
      {/* Header with Logo */}
      <div className={cn(
        "h-16 flex items-center border-b border-[#1C1917] px-4",
        collapsed ? "justify-center" : "justify-between"
      )}>
        {!collapsed && (
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-orange-500 to-amber-600 flex items-center justify-center">
              <span className="text-white font-bold">E</span>
            </div>
            <span className="text-lg font-bold text-[#FAFAF9]">EchoBrief</span>
          </Link>
        )}
        {collapsed && (
          <Link to="/dashboard">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-orange-500 to-amber-600 flex items-center justify-center">
              <span className="text-white font-bold">E</span>
            </div>
          </Link>
        )}
        {!collapsed && (
          <button
            onClick={() => handleCollapsedChange(!collapsed)}
            className="p-1 rounded-md hover:bg-[#1C1917] text-[#A8A29E] hover:text-white transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive 
                  ? "bg-[#1C1917] text-[#FAFAF9]" 
                  : "text-[#A8A29E] hover:bg-[#1C1917] hover:text-[#FAFAF9]",
                collapsed && "justify-center px-0"
              )}
            >
              <item.icon className="w-4 h-4" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User Section */}
      <div className={cn(
        "p-4 border-t border-[#1C1917]",
        collapsed && "flex flex-col items-center"
      )}>
        {!collapsed && (
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-orange-500 to-amber-600 flex items-center justify-center text-white font-bold text-sm">
              {user?.email?.[0].toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-medium text-[#FAFAF9] truncate">{user?.email?.split('@')[0]}</p>
            </div>
          </div>
        )}
        <button
          onClick={signOut}
          className={cn(
            "flex items-center gap-3 w-full px-3 py-2 text-sm text-[#A8A29E] hover:text-[#FAFAF9] hover:bg-[#1C1917] rounded-lg transition-colors",
            collapsed && "justify-center px-0"
          )}
        >
          <LogOut className="w-4 h-4" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
