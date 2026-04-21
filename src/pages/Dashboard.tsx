import { useEffect, useState, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { RecordingButton } from '@/components/dashboard/RecordingButton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Meeting } from '@/types/meeting';
import { ChevronRight, Mic, Clock, CheckCircle2, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';

interface CalendarAttendee {
  email: string;
  displayName?: string | null;
  responseStatus?: string | null;
  organizer?: boolean;
}
interface PrefillMeeting {
  title: string;
  calendarEventId?: string;
  meetingLink?: string;
  attendees?: CalendarAttendee[];
}

function statusConfig(status: string) {
  switch (status) {
    case 'recording': return { label: 'Recording', color: 'var(--ember)', tint: 'color-mix(in oklch, var(--ember) 12%, transparent)' };
    case 'processing': return { label: 'Processing', color: 'hsl(var(--warning))', tint: 'color-mix(in oklch, hsl(var(--warning)) 14%, transparent)' };
    case 'completed': return { label: 'Completed', color: 'hsl(var(--success))', tint: 'color-mix(in oklch, hsl(var(--success)) 14%, transparent)' };
    case 'failed': return { label: 'Failed', color: 'hsl(var(--destructive))', tint: 'color-mix(in oklch, hsl(var(--destructive)) 12%, transparent)' };
    default: return { label: 'Scheduled', color: 'var(--ink-soft)', tint: 'color-mix(in oklch, var(--ink) 8%, transparent)' };
  }
}

function sourceLabel(source?: string) {
  switch (source) {
    case 'google_meet': return 'Google Meet';
    case 'zoom': return 'Zoom';
    case 'teams': return 'Teams';
    default: return 'Recording';
  }
}

function formatDuration(seconds?: number) {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  return `${mins} min`;
}

function formatTotalHours(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [insightCounts, setInsightCounts] = useState<Record<string, boolean>>({});
  const [fetchError, setFetchError] = useState<string | null>(null);
  const aliveRef = useRef(true);

  const prefillMeeting = (location.state as { prefillMeeting?: PrefillMeeting })?.prefillMeeting;

  const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      promise.then((v) => { clearTimeout(t); resolve(v); }).catch((e) => { clearTimeout(t); reject(e); });
    });

  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    setFetchError(null);

    const run = async () => {
      try {
        const { data: profile } = await withTimeout(
          supabase.from('profiles').select('onboarding_completed').eq('user_id', user.id).maybeSingle(),
          25_000, 'Profile load');
        if (!aliveRef.current) return;
        if (profile && !profile.onboarding_completed) { navigate('/onboarding'); return; }

        const { data, error } = await withTimeout(
          supabase.from('meetings').select('*').eq('user_id', user.id).order('start_time', { ascending: false }),
          25_000, 'Meetings load');
        if (!aliveRef.current) return;
        if (error) {
          setFetchError(error.message || 'Could not load meetings');
          setMeetings([]);
          return;
        }
        if (data) {
          setMeetings(data as Meeting[]);
          if (data.length > 0) {
            const { data: insights } = await withTimeout(
              supabase.from('meeting_insights').select('meeting_id').in('meeting_id', data.map((m) => m.id)),
              25_000, 'Insights load');
            if (!aliveRef.current) return;
            if (insights) {
              const counts: Record<string, boolean> = {};
              insights.forEach((i) => { counts[i.meeting_id] = true; });
              setInsightCounts(counts);
            }
          }
        }
      } catch (err) {
        if (aliveRef.current) {
          setFetchError(err instanceof Error ? err.message : 'Could not load meetings');
          setMeetings([]);
        }
      } finally {
        if (aliveRef.current) setLoading(false);
      }
    };

    void run();

    const channel = supabase
      .channel(`meetings-changes-${user.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'meetings', filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') setMeetings((prev) => [payload.new as Meeting, ...prev]);
          else if (payload.eventType === 'UPDATE') setMeetings((prev) => prev.map((m) => (m.id === payload.new.id ? (payload.new as Meeting) : m)));
          else if (payload.eventType === 'DELETE') setMeetings((prev) => prev.filter((m) => m.id !== payload.old.id));
        })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [user, navigate]);

  const stats = useMemo(() => {
    const totalMeetings = meetings.length;
    const totalDuration = meetings.reduce((sum, m) => sum + (m.duration_seconds || 0), 0);
    const summarized = Object.keys(insightCounts).length;
    const timeSavedMin = Math.round((totalDuration / 60) * 0.25);
    return { totalMeetings, totalDuration, summarized, timeSavedMin };
  }, [meetings, insightCounts]);

  const firstName = user?.user_metadata?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'there';

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1200px] px-6 py-8 md:px-8 md:py-10">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1
              className="text-[28px] font-semibold leading-tight"
              style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
            >
              Welcome back, {firstName}
            </h1>
            <p className="mt-1 text-[14px]" style={{ color: 'var(--ink-mid)' }}>
              Here's what's happening with your meetings.
            </p>
          </div>
          <RecordingButton
            prefillTitle={prefillMeeting?.title}
            calendarEventId={prefillMeeting?.calendarEventId}
            meetingLink={prefillMeeting?.meetingLink}
            attendees={prefillMeeting?.attendees}
          />
        </div>

        {fetchError && !loading && (
          <div
            role="alert"
            className="mb-6 rounded-md px-4 py-3 text-[13.5px]"
            style={{
              border: '1px solid color-mix(in oklch, hsl(var(--destructive)) 25%, transparent)',
              background: 'color-mix(in oklch, hsl(var(--destructive)) 7%, transparent)',
              color: 'hsl(var(--destructive))',
            }}
          >
            {fetchError}
          </div>
        )}

        {/* Stats */}
        {!loading && meetings.length > 0 && (
          <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            {[
              { label: 'Meetings', value: String(stats.totalMeetings), icon: Mic },
              { label: 'Recorded', value: formatTotalHours(stats.totalDuration), icon: Clock },
              { label: 'Summarized', value: String(stats.summarized), icon: CheckCircle2 },
              { label: 'Time saved', value: `~${Math.floor(stats.timeSavedMin / 60) || stats.timeSavedMin}${stats.timeSavedMin >= 60 ? 'h' : 'm'}`, icon: Sparkles, accent: true },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-xl p-5"
                style={{
                  background: 'var(--paper-card)',
                  border: '1px solid var(--rule)',
                }}
              >
                <div className="flex items-center justify-between">
                  <p className="text-[13px]" style={{ color: 'var(--ink-mid)' }}>
                    {s.label}
                  </p>
                  <s.icon
                    className="h-[15px] w-[15px]"
                    strokeWidth={1.75}
                    style={{ color: s.accent ? 'var(--ember)' : 'var(--ink-soft)' }}
                  />
                </div>
                <p
                  className="mt-2 text-[26px] font-semibold leading-none"
                  style={{ color: s.accent ? 'var(--ember-deep)' : 'var(--ink)', letterSpacing: '-0.02em' }}
                >
                  {s.value}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Section heading */}
        <div className="mb-4 flex items-baseline justify-between">
          <h2
            className="text-[17px] font-semibold"
            style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}
          >
            Recent meetings
          </h2>
          {!loading && meetings.length > 0 && (
            <span className="text-[13px]" style={{ color: 'var(--ink-soft)' }}>
              {meetings.length} total
            </span>
          )}
        </div>

        {/* List */}
        {loading ? (
          <div
            className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-xl"
            style={{ border: '1px solid var(--rule)', background: 'var(--paper-card)' }}
          >
            <div
              className="h-6 w-6 animate-spin rounded-full"
              style={{ border: '2px solid var(--rule)', borderTopColor: 'var(--ember)' }}
            />
            <p className="text-[13px]" style={{ color: 'var(--ink-soft)' }}>Loading meetings…</p>
          </div>
        ) : meetings.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-4 rounded-xl px-6 py-16 text-center"
            style={{ border: '1px dashed var(--rule)', background: 'var(--paper-card)' }}
          >
            <Mic className="h-10 w-10" strokeWidth={1.5} style={{ color: 'var(--ink-faint)' }} />
            <div className="max-w-md space-y-1.5">
              <p className="text-[17px] font-semibold" style={{ color: 'var(--ink)' }}>
                No meetings yet
              </p>
              <p style={{ color: 'var(--ink-mid)', fontSize: 14, lineHeight: 1.6 }}>
                Click Record to capture your first meeting. Summaries and insights will appear here.
              </p>
            </div>
          </div>
        ) : (
          <div
            className="overflow-hidden rounded-xl"
            style={{ border: '1px solid var(--rule)', background: 'var(--paper-card)' }}
          >
            {meetings.map((meeting, idx) => {
              const s = statusConfig(meeting.status || 'scheduled');
              const hasSummary = insightCounts[meeting.id];
              const lang = (meeting as any).language;
              return (
                <Link
                  key={meeting.id}
                  to={`/meeting/${meeting.id}`}
                  className="group flex items-center gap-4 px-5 py-4 no-underline transition-colors md:px-6"
                  style={{
                    borderTop: idx === 0 ? 'none' : '1px solid var(--rule-soft)',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in oklch, var(--ink) 3%, transparent)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="text-[14.5px] font-semibold truncate"
                        style={{ color: 'var(--ink)' }}
                      >
                        {meeting.title || 'Untitled meeting'}
                      </span>
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{ background: s.tint, color: s.color }}
                      >
                        {meeting.status === 'recording' && (
                          <span className="status-dot recording" style={{ width: 6, height: 6 }} />
                        )}
                        {s.label}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
                      <span>{sourceLabel(meeting.source)}</span>
                      <span aria-hidden>·</span>
                      <span>{format(new Date(meeting.start_time), 'MMM d, h:mm a')}</span>
                      {meeting.duration_seconds && (
                        <>
                          <span aria-hidden>·</span>
                          <span>{formatDuration(meeting.duration_seconds)}</span>
                        </>
                      )}
                      {lang && (
                        <>
                          <span aria-hidden>·</span>
                          <span>{lang}</span>
                        </>
                      )}
                      {hasSummary && (
                        <>
                          <span aria-hidden>·</span>
                          <span style={{ color: 'var(--ember-deep)', fontWeight: 500 }}>Summary ready</span>
                        </>
                      )}
                    </div>
                  </div>
                  <ChevronRight
                    size={16}
                    strokeWidth={1.75}
                    style={{ color: 'var(--ink-faint)' }}
                    className="shrink-0 transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
