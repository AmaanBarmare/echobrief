import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarX2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Deliberately dismiss-less banner shown while profiles.google_needs_reconnect
 * is true (the backend sets it when the stored Google refresh token stops
 * working). It disappears on its own once the user reconnects — auto-join is
 * silently broken until then, so the user must not be able to hide it.
 * Rendered on Dashboard and Calendar; the query is shared via the cache.
 */
export function GoogleReconnectBanner() {
  const { user } = useAuth();

  const { data: needsReconnect = false } = useQuery({
    queryKey: ['google-needs-reconnect', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('google_needs_reconnect')
        .eq('user_id', user!.id)
        .maybeSingle();
      return data?.google_needs_reconnect === true;
    },
  });

  if (!needsReconnect) return null;

  return (
    <div
      role="alert"
      className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md px-4 py-3"
      style={{
        border: '1px solid color-mix(in oklch, hsl(var(--warning)) 35%, transparent)',
        background: 'color-mix(in oklch, hsl(var(--warning)) 8%, transparent)',
      }}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <CalendarX2
          className="h-4 w-4 shrink-0"
          strokeWidth={1.75}
          style={{ color: 'hsl(var(--warning))' }}
        />
        <p className="text-[13.5px]" style={{ color: 'var(--ink)' }}>
          Google Calendar disconnected — reconnect to keep auto-join working
        </p>
      </div>
      <Link
        to="/settings?tab=integrations"
        className="shrink-0 rounded-md px-3 py-1.5 text-[13px] font-medium no-underline transition-colors"
        style={{
          border: '1px solid var(--rule)',
          background: 'var(--paper-card)',
          color: 'var(--ink)',
        }}
      >
        Reconnect
      </Link>
    </div>
  );
}
