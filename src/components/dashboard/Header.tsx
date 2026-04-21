import { useState, useEffect, useRef } from 'react';
import { Search, LogOut, User, Settings as SettingsIcon } from 'lucide-react';
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
        className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 px-6 md:px-8"
        style={{
          borderBottom: '1px solid var(--rule)',
          background: 'color-mix(in oklch, var(--paper) 90%, transparent)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      >
        {/* Search */}
        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-2.5 rounded-md px-3 py-1.5 transition-colors"
          style={{
            border: '1px solid var(--rule)',
            background: 'var(--paper-card)',
            color: 'var(--ink-soft)',
            minWidth: 280,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'color-mix(in oklch, var(--ink) 18%, transparent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--rule)';
          }}
        >
          <Search className="h-[14px] w-[14px]" strokeWidth={1.75} />
          <span className="flex-1 text-left text-[13px]">Search meetings…</span>
          <span
            className="rounded px-1.5 py-0.5 text-[11px] font-mono"
            style={{
              background: 'color-mix(in oklch, var(--ink) 6%, transparent)',
              color: 'var(--ink-soft)',
            }}
          >
            ⌘K
          </span>
        </button>

        <div className="flex items-center gap-2">
          <ThemeToggle />

          <div ref={profileRef} className="relative">
            <button
              onClick={() => setProfileMenuOpen((p) => !p)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-semibold text-white transition-transform"
              style={{
                background: 'var(--ember)',
                boxShadow: profileMenuOpen ? '0 0 0 3px color-mix(in oklch, var(--ember) 25%, transparent)' : 'none',
              }}
            >
              {userInitial}
            </button>

            {profileMenuOpen && (
              <div
                className="absolute right-0 top-11 z-[1000] w-[240px] overflow-hidden rounded-lg animate-in"
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
                    onClick={item.action}
                    className="flex w-full items-center gap-2.5 border-0 bg-transparent px-4 py-2.5 text-left text-[13.5px] transition-colors"
                    style={{ color: 'var(--ink-mid)' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'color-mix(in oklch, var(--ink) 5%, transparent)';
                      e.currentTarget.style.color = 'var(--ink)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'var(--ink-mid)';
                    }}
                  >
                    {item.icon} {item.label}
                  </button>
                ))}

                <div style={{ height: 1, background: 'var(--rule-soft)' }} />

                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2.5 border-0 bg-transparent px-4 py-2.5 text-left text-[13.5px] transition-colors"
                  style={{ color: 'oklch(58% 0.2 28)' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'color-mix(in oklch, oklch(58% 0.2 28) 8%, transparent)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
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
