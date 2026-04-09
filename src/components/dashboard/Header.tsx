import { useState, useEffect, useRef } from 'react';
import { Search, LogOut, User, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { displayNameFromUserMetadata } from '@/lib/userDisplayName';
import { GlobalSearch } from './GlobalSearch';
import { ThemeToggle } from '@/components/ThemeToggle';

export function Header() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const displayName = displayNameFromUserMetadata(user);
  const userInitial =
    (displayName?.[0] || user?.email?.[0])?.toUpperCase() || '?';
  const userName = displayName || user?.email?.split('@')[0] || 'User';

  // Close profile menu on outside click or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    };

    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setProfileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscapeKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, []);

  const handleSignOut = () => {
    setProfileMenuOpen(false);
    signOut();
  };

  // Keyboard shortcut for search (Cmd/Ctrl + K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <header className="h-14 border-b border-border bg-background flex items-center justify-between gap-4 px-8 sticky top-0 z-40">
        {/* Search bar */}
        <div className="flex items-center flex-1 max-w-[360px]">
          <div className="relative w-full">
            <Search className="w-[15px] h-[15px] text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search meetings, people, decisions..."
              className="w-full py-2 pl-9 pr-3 rounded-[10px] border border-border bg-card text-foreground text-[13px] font-sans outline-none placeholder:text-muted-foreground focus:border-orange-500/40 focus:ring-1 focus:ring-orange-500/20 transition-all"
              onFocus={() => setSearchOpen(true)}
              readOnly
            />
          </div>
        </div>

        {/* Right side: theme + profile */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {/* Profile Dropdown */}
          <div ref={profileRef} style={{ position: 'relative' }}>
            {/* Avatar button */}
            <button
              onClick={() => setProfileMenuOpen(prev => !prev)}
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #F97316, #F59E0B)',
                border: profileMenuOpen ? '2px solid #F97316' : '2px solid transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 700,
                color: '#fff',
                cursor: 'pointer',
                transition: 'all 0.15s',
                boxShadow: profileMenuOpen ? '0 0 0 3px rgba(249,115,22,0.2)' : 'none',
              }}
            >
              {userInitial}
            </button>

            {/* Dropdown menu */}
            {profileMenuOpen && (
              <div
                className="absolute right-0 top-11 z-[1000] w-[220px] overflow-hidden rounded-[14px] border border-border bg-popover text-popover-foreground shadow-xl animate-in fade-in-0 zoom-in-95"
              >
                <div className="border-b border-border px-4 pb-3 pt-4">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-500 text-sm font-bold text-white">
                      {userInitial}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold" style={{ fontFamily: 'Outfit, sans-serif', fontSize: 14 }}>
                        {userName}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">{user?.email}</div>
                    </div>
                  </div>
                </div>

                {[
                  { icon: <User size={14} />, label: 'Profile', action: () => { navigate('/settings'); setProfileMenuOpen(false); } },
                  { icon: <Settings size={14} />, label: 'Settings', action: () => { navigate('/settings'); setProfileMenuOpen(false); } },
                ].map((item, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={item.action}
                    className="flex w-full items-center gap-2.5 border-0 bg-transparent px-4 py-[11px] text-left text-[13px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    {item.icon} {item.label}
                  </button>
                ))}

                <div className="my-1 h-px bg-border" />

                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2.5 border-0 bg-transparent px-4 py-[11px] text-left text-[13px] text-destructive transition-colors hover:bg-destructive/10"
                >
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Global Search Modal */}
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
