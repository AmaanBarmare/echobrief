import { Link } from 'react-router-dom';
import { Mic } from 'lucide-react';

export default function Recordings() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center"
      style={{ background: 'var(--paper)' }}
    >
      <Mic className="mb-5 h-10 w-10" strokeWidth={1.5} style={{ color: 'var(--ink-faint)' }} />
      <h1 className="text-[22px] font-semibold" style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}>
        Recordings live on the dashboard
      </h1>
      <p className="mt-2 max-w-md text-[14.5px]" style={{ color: 'var(--ink-mid)', lineHeight: 1.6 }}>
        Your meetings and recordings are all on the dashboard. Browse, search,
        and open any session from there.
      </p>
      <Link
        to="/dashboard"
        className="mt-8 inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-[14px] font-semibold text-white no-underline transition-opacity hover:opacity-90"
        style={{ background: 'var(--ember)' }}
      >
        Go to meetings
      </Link>
    </div>
  );
}
