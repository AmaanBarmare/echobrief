import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon, RefreshCw, ChevronDown, ChevronRight, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCalendar } from '@/contexts/CalendarContext';
import { format, isToday, isTomorrow, parseISO } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { MeetingDetailModal } from '@/components/dashboard/MeetingDetailModal';
import { cn } from '@/lib/utils';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

function mapServerEventsToCalendar(raw: unknown[]): CalendarEvent[] {
  return raw
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
    .map((e) => ({
      id: String(e.id ?? ''),
      title: String(e.title ?? 'No title'),
      start_time: String(e.start_time ?? e.start ?? ''),
      end_time: String(e.end_time ?? e.end ?? ''),
      is_all_day: Boolean(e.is_all_day),
      meetingUrl: typeof e.meetingUrl === 'string' ? e.meetingUrl : undefined,
      hasMeetingLink: Boolean(e.hasMeetingLink),
      attendees: Array.isArray(e.attendees)
        ? (e.attendees as CalendarEvent['attendees'])
        : undefined,
    }))
    .filter((e) => e.id && e.start_time);
}

async function syncCalendarViaEdgeFunction(accessToken: string): Promise<{
  events: CalendarEvent[];
  error?: string;
  hint?: string;
}> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-google-calendar`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  const data = (await res.json()) as {
    error?: string;
    hint?: string;
    upcomingEvents?: unknown[];
  };
  if (!res.ok) {
    return {
      events: [],
      error: data.error || 'Calendar sync failed',
      hint: data.hint,
    };
  }
  const raw = Array.isArray(data.upcomingEvents) ? data.upcomingEvents : [];
  return { events: mapServerEventsToCalendar(raw) };
}

interface CalendarEvent {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  is_all_day: boolean;
  meetingUrl?: string;
  hasMeetingLink?: boolean;
  attendees?: Array<{ email: string; displayName?: string; responseStatus?: string; organizer?: boolean }>;
}

export default function Calendar() {
  const { user, session } = useAuth();
  const { events, setEvents, synced, setSynced, lastSyncTime, setLastSyncTime } = useCalendar();
  const { toast } = useToast();

  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ count: number; visible: boolean }>({ count: 0, visible: false });
  const [upcomingExpanded, setUpcomingExpanded] = useState(false);
  const [autoFetched, setAutoFetched] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const openModal = (event: CalendarEvent) => setSelectedEvent(event);
  const closeModal = () => setSelectedEvent(null);

  // Auto-fetch via Edge Function (OAuth tokens are not readable from the browser when RLS blocks user_oauth_tokens)
  useEffect(() => {
    if (autoFetched || events.length > 0 || !user || !session?.access_token) return;

    const autoFetch = async () => {
      try {
        const { events: ev, error } = await syncCalendarViaEdgeFunction(session.access_token);
        if (error) return;
        setEvents(ev);
        if (ev.length > 0) {
          setSynced(true);
          setLastSyncTime(new Date());
        }
      } catch (err) {
        console.error('Auto-fetch error:', err);
      } finally {
        setAutoFetched(true);
      }
    };

    void autoFetch();
  }, [user, session?.access_token, autoFetched, events.length, setEvents, setSynced, setLastSyncTime]);

  // Group events by date
  const groupedEvents = {
    today: events.filter(e => isToday(parseISO(e.start_time))).sort((a, b) => a.start_time.localeCompare(b.start_time)),
    tomorrow: events.filter(e => isTomorrow(parseISO(e.start_time))).sort((a, b) => a.start_time.localeCompare(b.start_time)),
    upcoming: events.filter(e => {
      const eventDate = parseISO(e.start_time);
      return !isToday(eventDate) && !isTomorrow(eventDate);
    }).sort((a, b) => a.start_time.localeCompare(b.start_time)),
  };

  const upcomingByDate = groupedEvents.upcoming.reduce((acc, event) => {
    const dateKey = format(parseISO(event.start_time), 'yyyy-MM-dd');
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(event);
    return acc;
  }, {} as Record<string, CalendarEvent[]>);

  const handleRecordWithBot = async (event: CalendarEvent): Promise<{ meeting_id: string }> => {
    if (!user || !event.hasMeetingLink || !event.meetingUrl) throw new Error('Missing meeting info');

    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.access_token) throw new Error('Not authenticated');

    const response = await fetch(`${SUPABASE_URL}/functions/v1/start-recall-recording`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        meeting_url: event.meetingUrl,
        user_id: user.id,
        calendar_event_id: event.id,
        title: event.title,
      }),
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to start recording');
    return { meeting_id: result.meeting_id };
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      if (!user || !session?.access_token) throw new Error('Not logged in');

      const { events: ev, error, hint } = await syncCalendarViaEdgeFunction(session.access_token);

      if (error) {
        toast({
          title: 'Calendar',
          description: hint || error,
          variant: 'destructive',
        });
        return;
      }

      setEvents(ev);
      setSynced(true);
      setLastSyncTime(new Date());

      setSyncMessage({ count: ev.length, visible: true });
      setTimeout(() => setSyncMessage((prev) => ({ ...prev, visible: false })), 3000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to sync';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const EventCard = ({ event }: { event: CalendarEvent }) => {
    const isEventToday = isToday(parseISO(event.start_time));
    const borderColor = isEventToday ? '#f97316' : 'hsl(var(--muted-foreground) / 0.35)';

    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => openModal(event)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') openModal(event);
        }}
        className="flex cursor-pointer items-center justify-between rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm transition-all hover:-translate-y-px hover:border-orange-500/35 hover:bg-secondary/60 hover:shadow-md"
        style={{ borderLeftWidth: 3, borderLeftColor: borderColor }}
      >
        <div className="min-w-0 flex-1">
          <h3 className="mb-2 font-semibold text-foreground" style={{ fontSize: 15, margin: 0, fontFamily: 'Outfit, sans-serif' }}>
            {event.title}
          </h3>
          <div className="flex flex-wrap items-center gap-3">
            <p className="m-0 text-[13px] text-muted-foreground" style={{ fontFamily: 'DM Sans, sans-serif' }}>
              {!event.is_all_day
                ? `${format(parseISO(event.start_time), 'h:mm a')} – ${format(parseISO(event.end_time), 'h:mm a')}`
                : 'All day'}
            </p>
            {!event.hasMeetingLink && (
              <p className="m-0 text-[11px] text-muted-foreground" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                No meeting link
              </p>
            )}
          </div>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
      </div>
    );
  };

  const SectionHeader = ({ label, tone = 'accent' }: { label: string; tone?: 'accent' | 'muted' }) => (
    <h2
      className={
        tone === 'accent'
          ? 'mb-4 mt-8 text-[11px] font-semibold uppercase tracking-[0.12em] text-orange-600 first:mt-0 dark:text-orange-400'
          : 'mb-4 mt-8 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground first:mt-0'
      }
    >
      {label}
    </h2>
  );

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl px-6 py-8 md:px-10 md:py-10">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-[-0.02em] text-foreground" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Calendar
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Your upcoming meetings</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {syncMessage.visible && (
              <div className="flex items-center gap-2 text-[13px] text-green-600 dark:text-green-400">
                <CheckCircle2 size={16} />
                <span>Synced · {syncMessage.count} events</span>
              </div>
            )}
            <Button
              onClick={handleSync}
              disabled={syncing}
              className="gap-2 bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-70"
            >
              <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
              Sync Now
            </Button>
          </div>
        </div>

        {/* Events or Empty State */}
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
            <CalendarIcon className="mb-4 h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
            <h3 className="mb-2 text-base font-semibold text-foreground">No upcoming meetings found</h3>
            <p className="max-w-[360px] text-[13px] leading-relaxed text-muted-foreground">
              Add Calendar in{' '}
              <Link to="/settings?tab=integrations" className="font-medium text-orange-600 underline underline-offset-2 hover:text-orange-700 dark:text-orange-400">
                Settings → Integrations
              </Link>{' '}
              to run Google OAuth for this EchoBrief account. Project secrets alone do not connect your calendar.
            </p>
          </div>
        ) : (
          <div>
            {/* TODAY */}
            <SectionHeader label={`Today · ${format(new Date(), 'EEEE, MMMM d')}`} tone="accent" />
            {groupedEvents.today.length > 0 ? (
              <div className="mb-6 flex flex-col gap-3">
                {groupedEvents.today.map(event => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            ) : (
              <p className="mb-6 text-[13px] text-muted-foreground">No meetings scheduled for today</p>
            )}

            {/* TOMORROW */}
            <SectionHeader label={`Tomorrow · ${format(new Date(Date.now() + 86400000), 'EEEE, MMMM d')}`} tone="muted" />
            {groupedEvents.tomorrow.length > 0 ? (
              <div className="mb-6 flex flex-col gap-3">
                {groupedEvents.tomorrow.map(event => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            ) : (
              <p className="mb-6 text-[13px] text-muted-foreground">No meetings scheduled for tomorrow</p>
            )}

            {/* UPCOMING */}
            {Object.keys(upcomingByDate).length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setUpcomingExpanded(!upcomingExpanded)}
                  className="mb-4 mt-6 flex cursor-pointer items-center gap-2 border-none bg-transparent p-0 text-left transition-colors hover:opacity-90"
                >
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Upcoming
                  </span>
                  <ChevronDown
                    size={16}
                    className={cn('text-muted-foreground transition-transform duration-200', upcomingExpanded ? 'rotate-0' : '-rotate-90')}
                  />
                </button>

                {upcomingExpanded && (
                  <div className="flex flex-col gap-6">
                    {Object.entries(upcomingByDate).map(([dateKey, dateEvents]) => (
                      <div key={dateKey}>
                        <h4 className="mb-3 text-xs text-muted-foreground" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                          {format(parseISO(dateKey), 'EEEE, MMMM d')}
                        </h4>
                        <div className="flex flex-col gap-3">
                          {dateEvents.map(event => (
                            <EventCard key={event.id} event={event} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Meeting Detail Modal */}
      <MeetingDetailModal
        event={selectedEvent}
        onClose={closeModal}
        onRecordWithBot={handleRecordWithBot}
      />
    </DashboardLayout>
  );
}
