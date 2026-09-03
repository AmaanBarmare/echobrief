import { useState, useEffect } from 'react';
import { X, Mic, Calendar, Clock, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { format, differenceInMinutes, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

interface UpcomingMeeting {
  id: string;
  title: string;
  start: string;
  end: string;
  meetingLink: string | null;
  attendees?: { email: string; displayName?: string }[];
}

// A full Google Calendar sync is expensive — it upserts `calendars` and
// `calendar_events` on every call. Running it once a minute per open tab was
// the single biggest source of write churn in the app (see README challenge
// #22 on the Disk IO Budget). Sync at a slow cadence; read from the DB often.
// Google is polled on a timer from every open tab. Each poll used to rewrite
// the user's whole calendar; it now writes only genuine changes, but the poll
// itself still costs a request per tab, so keep it infrequent.
const SYNC_INTERVAL_MS = 30 * 60 * 1000;
const POLL_INTERVAL_MS = 60 * 1000;

export function PreMeetingNotification() {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const [upcomingMeeting, setUpcomingMeeting] = useState<UpcomingMeeting | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [notetakerName, setNotetakerName] = useState('Notetaker');
  const [notificationMinutes, setNotificationMinutes] = useState(5);
  const [autoJoinEnabled, setAutoJoinEnabled] = useState(false);

  // The bot name, lead time and auto-join state are all per-user settings.
  // They used to be hardcoded props, so every user was told a bot named
  // "Khush's Notetaker" would auto-join — regardless of their own settings.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const loadPrefs = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('notetaker_name, pre_meeting_notification_minutes, auto_join_enabled')
        .eq('user_id', user.id)
        .maybeSingle();

      if (cancelled || !data) return;
      if (data.notetaker_name) setNotetakerName(data.notetaker_name);
      if (data.pre_meeting_notification_minutes) {
        setNotificationMinutes(data.pre_meeting_notification_minutes);
      }
      setAutoJoinEnabled(data.auto_join_enabled === true);
    };

    loadPrefs();
    return () => {
      cancelled = true;
    };
  }, [user]);
  const [minutesUntilMeeting, setMinutesUntilMeeting] = useState<number>(0);

  useEffect(() => {
    if (!user || !session?.access_token) return;

    // Pull fresh events from Google. Expensive (writes calendars +
    // calendar_events), so this runs on SYNC_INTERVAL_MS, not the poll.
    const syncCalendar = async () => {
      try {
        await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-google-calendar`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
          }
        );
      } catch (error) {
        console.error('Error syncing calendar:', error);
      }
    };

    // Cheap read against already-synced rows — safe to run every minute.
    const checkUpcomingMeetings = async () => {
      try {
        const now = new Date();
        const horizon = new Date(now.getTime() + 60 * 60 * 1000);

        const { data: events, error } = await supabase
          .from('calendar_events')
          .select('event_id, title, start_time, end_time, meeting_link, attendees')
          .eq('user_id', user.id)
          .gte('start_time', now.toISOString())
          .lte('start_time', horizon.toISOString())
          .order('start_time', { ascending: true });

        if (error) throw error;

        const list = (events || []).map((e) => ({
          id: e.event_id,
          title: e.title,
          start_time: e.start_time,
          end_time: e.end_time,
          meetingLink: e.meeting_link,
          attendees: e.attendees,
        }));

        const upcoming = list.find((raw: unknown) => {
          if (!raw || typeof raw !== 'object') return false;
          const event = raw as {
            id?: string;
            start?: string;
            start_time?: string;
          };
          const startStr = event.start_time || event.start;
          if (!startStr || !event.id) return false;
          const startTime = parseISO(startStr);
          const minutesUntil = differenceInMinutes(startTime, now);
          return minutesUntil > 0 && minutesUntil <= notificationMinutes && !dismissed.has(event.id);
        }) as
          | {
              id: string;
              title?: string;
              start?: string;
              start_time?: string;
              end?: string;
              end_time?: string;
              meetingUrl?: string;
              meetingLink?: string;
              attendees?: UpcomingMeeting['attendees'];
            }
          | undefined;

        if (upcoming) {
          const startStr = upcoming.start_time || upcoming.start!;
          const startTime = parseISO(startStr);
          setMinutesUntilMeeting(differenceInMinutes(startTime, now));
          setUpcomingMeeting({
            id: upcoming.id,
            title: upcoming.title || 'Meeting',
            start: startStr,
            end: upcoming.end_time || upcoming.end || startStr,
            meetingLink: upcoming.meetingUrl || upcoming.meetingLink || null,
            attendees: upcoming.attendees,
          });
        } else {
          setUpcomingMeeting(null);
        }
      } catch (error) {
        console.error('Error checking upcoming meetings:', error);
      }
    };

    void syncCalendar().then(checkUpcomingMeetings);

    const pollInterval = setInterval(checkUpcomingMeetings, POLL_INTERVAL_MS);
    const syncInterval = setInterval(() => {
      void syncCalendar().then(checkUpcomingMeetings);
    }, SYNC_INTERVAL_MS);

    return () => {
      clearInterval(pollInterval);
      clearInterval(syncInterval);
    };
  }, [user, session, dismissed, notificationMinutes]);

  // Update countdown every minute
  useEffect(() => {
    if (!upcomingMeeting) return;
    
    const interval = setInterval(() => {
      const startTime = parseISO(upcomingMeeting.start);
      const now = new Date();
      const minutes = differenceInMinutes(startTime, now);
      
      if (minutes <= 0) {
        setUpcomingMeeting(null);
      } else {
        setMinutesUntilMeeting(minutes);
      }
    }, 30000);
    
    return () => clearInterval(interval);
  }, [upcomingMeeting]);

  const handleDismiss = () => {
    if (upcomingMeeting) {
      setDismissed(prev => new Set(prev).add(upcomingMeeting.id));
      setUpcomingMeeting(null);
    }
  };

  const handleRecordMeeting = () => {
    if (!upcomingMeeting) return;
    
    navigate('/dashboard', {
      state: {
        prefillMeeting: {
          title: upcomingMeeting.title,
          calendarEventId: upcomingMeeting.id,
          meetingLink: upcomingMeeting.meetingLink,
          attendees: upcomingMeeting.attendees || [],
        }
      }
    });
    handleDismiss();
  };

  if (!upcomingMeeting) return null;

  return (
    <div className="pt-safe animate-in fixed left-4 right-4 top-4 z-50 sm:left-auto sm:w-[360px]">
      <div className="bg-card border-accent/30 rounded-lg border p-4 shadow-lg">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 text-accent">
            <Calendar className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Upcoming Meeting</span>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss upcoming meeting notice"
            className="surface-hover -mr-2 -mt-2 inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground md:h-8 md:w-8"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Meeting Info */}
        <h3 className="font-semibold text-foreground mb-2 line-clamp-2">
          {upcomingMeeting.title}
        </h3>
        
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
          <Clock className="w-3.5 h-3.5" />
          <span>
            Starts in <strong className="text-foreground">{minutesUntilMeeting} min</strong>
          </span>
        </div>

        {/* Notetaker message */}
        <p className="text-sm text-muted-foreground mb-4 p-2 bg-accent/5 rounded-md">
          {autoJoinEnabled ? (
            <>
              <strong className="text-accent">{notetakerName}</strong> will automatically join and record this meeting.
            </>
          ) : (
            <>
              Auto-join is off. Hit <strong className="text-accent">Record Now</strong> to send{' '}
              <strong className="text-accent">{notetakerName}</strong> to this meeting.
            </>
          )}
        </p>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button 
            variant="accent" 
            size="sm" 
            className="flex-1 gap-2"
            onClick={handleRecordMeeting}
          >
            <Mic className="w-4 h-4" />
            Record Now
          </Button>
          {upcomingMeeting.meetingLink && (
            <Button 
              variant="outline" 
              size="sm"
              asChild
            >
              <a href={upcomingMeeting.meetingLink} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4" />
              </a>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
