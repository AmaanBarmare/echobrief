import { Link } from 'react-router-dom';
import { Mic } from 'lucide-react';

/**
 * Standalone route used for debugging / legacy links.
 * Meetings and recordings are managed from the dashboard.
 */
export default function Recordings() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-16 text-center">
      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-600 dark:text-orange-400">
        <Mic className="h-7 w-7" strokeWidth={1.75} />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground" style={{ fontFamily: 'Outfit, sans-serif' }}>
        Recordings
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
        Your meetings and recordings live on the dashboard. Open Meetings to browse, search, and open any session.
      </p>
      <Link
        to="/dashboard"
        className="mt-8 inline-flex items-center rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-orange-500/20 transition-opacity hover:opacity-[0.97]"
      >
        Go to Meetings
      </Link>
    </div>
  );
}
