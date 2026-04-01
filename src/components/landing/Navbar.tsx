import { Link } from 'react-router-dom';
import { Logo } from '@/components/ui/Logo';

export function Navbar() {
  return (
    <nav
      className="sticky top-0 z-50"
      style={{
        padding: '18px 0',
        borderBottom: '1px solid #292524',
        background: 'rgba(12,10,9,0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
    >
      <div className="mx-auto max-w-[1100px] px-6">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Logo size="lg" linkTo="/" />

          {/* Nav links — hidden on mobile */}
          <div className="hidden md:flex items-center gap-7">
            {['Features', 'Languages', 'Pricing', 'Docs'].map((label) => (
              <a
                key={label}
                href={`#${label.toLowerCase()}`}
                style={{ fontSize: '14px', color: '#A8A29E', textDecoration: 'none', transition: 'color 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#FAFAF9')}
                onMouseLeave={e => (e.currentTarget.style.color = '#A8A29E')}
              >
                {label}
              </a>
            ))}
            <Link
              to="/auth"
              className="inline-flex items-center no-underline font-semibold transition-all duration-200"
              style={{
                padding: '8px 18px',
                fontSize: '13px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #F97316, #F59E0B)',
                color: '#fff',
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 500,
                boxShadow: '0 2px 12px rgba(249,115,22,0.25)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(249,115,22,0.4)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.boxShadow = '0 2px 12px rgba(249,115,22,0.25)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              Get started free
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
