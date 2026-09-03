import { useState, useEffect, useRef } from 'react';
import { Search, LogOut, User, Settings as SettingsIcon, Menu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { displayNameFromUserMetadata } from '@/lib/userDisplayName';
import { GlobalSearch } from './GlobalSearch';
import { ThemeToggle } from '@/components/ThemeToggle';

interface HeaderProps {
  /** Opens the mobile nav drawer. Only rendered below `md`. */
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const displayName = displayNameFromUserMetadata(user);
  const userInitial = (displayName?.[0] || user?.email?.[0])?.toUpperCase() || '?';
  const userName = displayName || user?.email?.split('@')[0] || 'User';

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileMenuOpen(false);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setProfileMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

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

  const handleSignOut = () => {
    setProfileMenuOpen(false);
    signOut();
  };

  return (
    <>
      <header
        className="pt-safe px-safe sticky top-0 z-30 flex h-14 items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6 md:px-8"
        style={{
          borderBottom: '1px solid var(--rule)',
          background: 'color-mix(in oklch, var(--paper) 90%, transparent)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {/* Drawer trigger — the rail is hidden below md, so this is the only
              way to reach navigation on a phone. */}
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="Open navigation menu"
            className="surface-hover -ml-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md md:hidden"
            style={{ color: 'var(--ink-mid)' }}
          >
            <Menu className="h-5 w-5" strokeWidth={1.75} />
          </button>

          {/* Search: icon-only on phones, full affordance from sm up. The old
              `minWidth: 280` forced horizontal scroll inside a 150px column. */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search meetings"
            className="rule-hover inline-flex h-11 w-11 items-center justify-center rounded-md sm:hidden"
            style={{
              border: '1px solid var(--rule)',
              background: 'var(--paper-card)',
              color: 'var(--ink-soft)',
            }}
          >
            <Search className="h-4 w-4" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="rule-hover hidden min-w-0 flex-1 items-center gap-2.5 rounded-md px-3 py-1.5 sm:flex sm:max-w-[320px]"
            style={{
              border: '1px solid var(--rule)',
              background: 'var(--paper-card)',
              color: 'var(--ink-soft)',
            }}
          >
            <Search className="h-[14px] w-[14px] shrink-0" strokeWidth={1.75} />
            <span className="flex-1 truncate text-left text-[13px]">Search meetings…</span>
            <span
              className="hidden shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] lg:inline"
              style={{
                background: 'color-mix(in oklch, var(--ink) 6%, transparent)',
                color: 'var(--ink-soft)',
              }}
            >
              ⌘K
            </span>
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <ThemeToggle />

          <div ref={profileRef} className="relative">
            <button
              type="button"
              onClick={() => setProfileMenuOpen((p) => !p)}
              aria-label="Account menu"
              aria-haspopup="menu"
              aria-expanded={profileMenuOpen}
              className="relative flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-semibold text-white transition-transform active:scale-95 before:absolute before:left-1/2 before:top-1/2 before:h-11 before:w-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] md:before:hidden"
              style={{
                background: 'var(--ember)',
                boxShadow: profileMenuOpen ? '0 0 0 3px color-mix(in oklch, var(--ember) 25%, transparent)' : 'none',
              }}
            >
              {userInitial}
            </button>

            {profileMenuOpen && (
              <div
                role="menu"
                className="animate-in absolute right-0 top-11 z-[1000] w-[240px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg"
                style={{
                  background: 'var(--paper-card)',
                  border: '1px solid var(--rule)',
                  boxShadow: 'var(--shadow-paper-lg)',
                }}
              >
                <div className="px-4 py-3.5" style={{ borderBottom: '1px solid var(--rule-soft)' }}>
                  <p className="truncate text-[14px] font-semibold" style={{ color: 'var(--ink)' }}>
                    {userName}
                  </p>
                  <p className="mt-0.5 truncate text-[12px]" style={{ color: 'var(--ink-soft)' }}>
                    {user?.email}
                  </p>
                </div>

                {[
                  { icon: <User size={14} strokeWidth={1.75} />, label: 'Profile', action: () => { navigate('/settings'); setProfileMenuOpen(false); } },
                  { icon: <SettingsIcon size={14} strokeWidth={1.75} />, label: 'Settings', action: () => { navigate('/settings'); setProfileMenuOpen(false); } },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    role="menuitem"
                    onClick={item.action}
                    className="surface-hover flex w-full items-center gap-2.5 border-0 bg-transparent px-4 py-3 text-left text-[13.5px] md:py-2.5"
                    style={{ color: 'var(--ink-mid)' }}
                  >
                    {item.icon} {item.label}
                  </button>
                ))}

                <div style={{ height: 1, background: 'var(--rule-soft)' }} />

                <button
                  type="button"
                  role="menuitem"
                  onClick={handleSignOut}
                  className="danger-hover flex w-full items-center gap-2.5 border-0 bg-transparent px-4 py-3 text-left text-[13.5px] md:py-2.5"
                  style={{ color: 'hsl(var(--destructive))' }}
                >
                  <LogOut size={14} strokeWidth={1.75} /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
