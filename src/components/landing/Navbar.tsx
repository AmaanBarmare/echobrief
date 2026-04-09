import { Link } from 'react-router-dom';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { cn } from '@/lib/utils';

const links = [
  { label: 'Features', href: '#features' },
  { label: 'Stack', href: '#integrations' },
  { label: 'Languages', href: '#languages' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Docs', href: '/docs' },
] as const;

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 px-4 pt-4 pb-2 md:px-8">
      <nav
        className={cn(
          'mx-auto flex max-w-[1200px] items-center justify-between gap-4 rounded-2xl border border-border/70 bg-background/75 px-4 py-3 shadow-sm backdrop-blur-xl',
          'supports-[backdrop-filter]:bg-background/65',
          'transition-shadow duration-300 hover:shadow-md hover:shadow-orange-500/5',
        )}
      >
        <Logo size="lg" linkTo="/" />

        <div className="flex flex-1 items-center justify-end gap-2 md:gap-4">
          <div className="hidden items-center gap-4 md:flex md:gap-5 lg:gap-6">
            {links.map(({ label, href }) =>
              href.startsWith('#') ? (
                <a
                  key={label}
                  href={href}
                  className="text-sm font-medium text-muted-foreground no-underline transition-colors hover:text-foreground"
                  style={{ fontFamily: "'DM Sans', sans-serif" }}
                >
                  {label}
                </a>
              ) : (
                <Link
                  key={label}
                  to={href}
                  className="text-sm font-medium text-muted-foreground no-underline transition-colors hover:text-foreground"
                  style={{ fontFamily: "'DM Sans', sans-serif" }}
                >
                  {label}
                </Link>
              ),
            )}
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle variant="navbar" />
            <Link
              to="/auth"
              className={cn(
                'inline-flex items-center justify-center rounded-xl px-4 py-2 text-[13px] font-semibold text-white no-underline transition-all duration-200',
                'bg-gradient-to-br from-orange-500 to-amber-500 shadow-md shadow-orange-500/25',
                'hover:-translate-y-0.5 hover:shadow-lg hover:shadow-orange-500/35',
                'sm:px-5',
              )}
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>
    </header>
  );
}
