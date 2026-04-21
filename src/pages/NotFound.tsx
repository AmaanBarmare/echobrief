import { useLocation, Link } from 'react-router-dom';
import { useEffect } from 'react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Home } from 'lucide-react';

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error('404: route not found →', location.pathname);
  }, [location.pathname]);

  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center px-6"
      style={{ background: 'var(--paper)' }}
    >
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md text-center">
        <p className="text-[72px] font-semibold leading-none" style={{ color: 'var(--ember-deep)', letterSpacing: '-0.03em' }}>
          404
        </p>
        <h1 className="mt-6 text-[22px] font-semibold" style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}>
          Page not found
        </h1>
        <p className="mt-2 text-[14.5px]" style={{ color: 'var(--ink-mid)', lineHeight: 1.6 }}>
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          to="/"
          className="mt-8 inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-[14px] font-semibold text-white no-underline transition-opacity hover:opacity-90"
          style={{ background: 'var(--ember)' }}
        >
          <Home className="h-4 w-4" strokeWidth={2} />
          Back to home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
