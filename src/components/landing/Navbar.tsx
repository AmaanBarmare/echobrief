import { Link } from 'react-router-dom';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import { signupPath } from '@/lib/signupLink';

const links = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Languages', href: '#languages' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Docs', href: '/docs' },
] as const;

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className="sticky top-0 z-50 transition-colors duration-200"
      style={{
        background: scrolled
          ? 'color-mix(in oklch, var(--paper) 88%, transparent)'
          : 'transparent',
        backdropFilter: scrolled ? 'blur(12px) saturate(1.05)' : undefined,
        WebkitBackdropFilter: scrolled ? 'blur(12px) saturate(1.05)' : undefined,
        borderBottom: scrolled ? '1px solid var(--rule)' : '1px solid transparent',
      }}
    >
      <nav className="mx-auto flex max-w-[1200px] items-center gap-8 px-6 py-4 md:px-8">
        <Logo size="md" linkTo="/" />

        <div className="hidden flex-1 items-center justify-center gap-1 md:flex">
          {links.map(({ label, href }) => {
            const cls = 'surface-hover rounded-md px-3 py-1.5 text-[14px] font-medium no-underline';
            const style = { color: 'var(--ink-mid)' };
            return href.startsWith('#') ? (
              <a key={label} href={href} className={cls} style={style}>
                {label}
              </a>
            ) : (
              <Link key={label} to={href} className={cls} style={style}>
                {label}
              </Link>
            );
          })}
        </div>

        <div className="flex flex-1 items-center justify-end gap-2 md:flex-none">
          <ThemeToggle variant="navbar" />
          <Link
            to="/auth"
            className="hidden rounded-md px-3.5 py-1.5 text-[14px] font-medium no-underline transition-colors sm:inline-flex"
            style={{ color: 'var(--ink)' }}
          >
            Sign in
          </Link>
          <Link
            to={signupPath()}
            className="hidden items-center rounded-md px-4 py-2 text-[14px] font-semibold text-white no-underline transition-opacity hover:opacity-90 sm:inline-flex"
            style={{ background: 'var(--ember)' }}
          >
            Get started
          </Link>

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="surface-hover -mr-2 inline-flex h-11 w-11 items-center justify-center rounded-md md:hidden"
            style={{ color: 'var(--ink-mid)' }}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {mobileOpen && (
        <div className="md:hidden" style={{ borderTop: '1px solid var(--rule)', background: 'var(--paper)' }}>
          <div className="mx-auto flex max-w-[1200px] flex-col gap-1 px-6 py-4">
            {links.map(({ label, href }) => {
              const cls = 'block rounded-md px-3 py-2.5 text-[15px] font-medium no-underline';
              const style = { color: 'var(--ink)' };
              return href.startsWith('#') ? (
                <a key={label} href={href} onClick={() => setMobileOpen(false)} className={cls} style={style}>
                  {label}
                </a>
              ) : (
                <Link key={label} to={href} onClick={() => setMobileOpen(false)} className={cls} style={style}>
                  {label}
                </Link>
              );
            })}
            <div className="mt-2 flex gap-2">
              <Link
                to="/auth"
                onClick={() => setMobileOpen(false)}
                className="flex-1 rounded-md px-4 py-2.5 text-center text-[14px] font-medium no-underline"
                style={{ color: 'var(--ink)', border: '1px solid var(--rule)' }}
              >
                Sign in
              </Link>
              <Link
                to={signupPath()}
                onClick={() => setMobileOpen(false)}
                className="flex-1 rounded-md px-4 py-2.5 text-center text-[14px] font-semibold text-white no-underline"
                style={{ background: 'var(--ember)' }}
              >
                Get started
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
