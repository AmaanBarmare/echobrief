import { useEffect, useState, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { RecordingButton } from '@/components/dashboard/RecordingButton';

import { DigestSettings } from '@/components/dashboard/DigestSettings';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Meeting } from '@/types/meeting';
import { Clock, ChevronRight, Mic, Users, CheckCircle2, Globe, Bot, FileText, Zap, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { useThemeTokens } from '@/lib/theme';

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

// ─── Badge (prototype exact) ───
function Badge({ children, color, bg }: { children: React.ReactNode; color: string; bg: string }) {
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 600,
      color, background: bg, letterSpacing: '0.02em',
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      {children}
    </span>
  );
}

// ─── StatusBadge (prototype exact) ───
function StatusBadge({ status }: { status: string }) {
  const T = useThemeTokens();
  const map: Record<string, { bg: string; color: string; label: string }> = {
    completed: { bg: '#FFF7ED', color: '#C2410C', label: 'Completed' },
    processing: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Processing' },
    recording: { bg: '#DCFCE7', color: '#15803D', label: 'Recording' },
    failed: { bg: '#FEE2E2', color: '#B91C1C', label: 'Failed' },
    scheduled: { bg: 'rgba(168,168,168,0.1)', color: '#A8A29E', label: 'Scheduled' },
  };
  const s = map[status] || map.scheduled;
  return (
    <Badge color={s.color} bg={s.bg}>
      {status === 'recording' && (
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.green, animation: 'pulse 1.5s infinite' }} />
      )}
      {s.label}
    </Badge>
  );
}

// ─── SourceBadge (prototype exact) ───
function SourceBadge({ source }: { source: string }) {
  const T = useThemeTokens();
  return (
    <Badge
      color={T.purple}
      bg="rgba(168,85,247,0.12)"
    >
      <Bot size={11} />
      Bot
    </Badge>
  );
}

// ─── GradientBar (prototype exact) ───
function GradientBar() {
  const T = useThemeTokens();
  return <div style={{ height: 3, background: T.gradient, borderRadius: 2 }} />;
}

export default function Dashboard() {
  const T = useThemeTokens();
  const { user, session } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [insightCounts, setInsightCounts] = useState<Record<string, boolean>>({});
  const [digestSending, setDigestSending] = useState(false);
  const [showDigestSettings, setShowDigestSettings] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const aliveRef = useRef(true);

  const prefillMeeting = (location.state as { prefillMeeting?: PrefillMeeting })?.prefillMeeting;

  const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      promise
        .then((v) => {
          clearTimeout(t);
          resolve(v);
        })
        .catch((e) => {
          clearTimeout(t);
          reject(e);
        });
    });
  };

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setFetchError(null);

    const checkOnboardingAndFetch = async () => {
      try {
        const { data: profile, error: profileError } = await withTimeout(
          supabase
            .from('profiles')
            .select('onboarding_completed')
            .eq('user_id', user.id)
            .maybeSingle(),
          25_000,
          'Profile load'
        );

        if (!aliveRef.current) return;

        if (profileError) {
          console.error('[Dashboard] Profile fetch:', profileError);
        }

        if (profile && !profile.onboarding_completed) {
          navigate('/onboarding');
          return;
        }

        const { data, error } = await withTimeout(
          supabase
            .from('meetings')
            .select('*')
            .eq('user_id', user.id)
            .order('start_time', { ascending: false }),
          25_000,
          'Meetings load'
        );

        if (!aliveRef.current) return;

        if (error) {
          console.error('[Dashboard] Meetings fetch:', error);
          setFetchError(error.message || 'Could not load meetings');
          setMeetings([]);
          return;
        }

        if (data) {
          setMeetings(data as Meeting[]);

          if (data.length > 0) {
            const { data: insights, error: insightsError } = await withTimeout(
              supabase
                .from('meeting_insights')
                .select('meeting_id')
                .in('meeting_id', data.map((m) => m.id)),
              25_000,
              'Insights load'
            );

            if (!aliveRef.current) return;

            if (insightsError) {
              console.error('[Dashboard] Insights fetch:', insightsError);
            } else if (insights) {
              const counts: Record<string, boolean> = {};
              insights.forEach((i) => {
                counts[i.meeting_id] = true;
              });
              setInsightCounts(counts);
            }
          }
        }
      } catch (err) {
        console.error('[Dashboard] Failed to fetch meetings:', err);
        if (aliveRef.current) {
          setFetchError(err instanceof Error ? err.message : 'Could not load meetings');
          setMeetings([]);
        }
      } finally {
        if (aliveRef.current) setLoading(false);
      }
    };

    void checkOnboardingAndFetch();

    const channel = supabase
      .channel(`meetings-changes-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meetings',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setMeetings((prev) => [payload.new as Meeting, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setMeetings((prev) =>
              prev.map((m) => (m.id === payload.new.id ? (payload.new as Meeting) : m))
            );
          } else if (payload.eventType === 'DELETE') {
            setMeetings((prev) => prev.filter((m) => m.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, navigate]);

  const stats = useMemo(() => {
    const totalMeetings = meetings.length;
    const totalDuration = meetings.reduce((sum, m) => sum + (m.duration_seconds || 0), 0);
    const transcriptCount = Object.keys(insightCounts).length;
    const completedCount = meetings.filter(m => m.status === 'completed').length;
    const languages = new Set(meetings.map(m => (m as any).language || 'en').filter(Boolean));
    
    return { totalMeetings, totalDuration, transcriptCount, completedCount, languageCount: Math.max(languages.size, 1) };
  }, [meetings, insightCounts]);

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    return `${mins}m`;
  };

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

  const handleSendDigest = async () => {
    if (!user || !session?.access_token) return;
    
    setDigestSending(true);
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!profile?.email) {
        alert('No email found in profile');
        return;
      }

      const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-digest-report`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${session.access_token}`, 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({
          user_id: user.id,
          frequency: 'manual',
          recipient_emails: [profile.email],
        }),
      });

      const data = await response.json();
      if (data.success) {
        alert(`Digest sent! (${data.meetings_count} meetings)`);
      } else {
        alert('Error: ' + (data.error || 'Failed to send'));
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setDigestSending(false);
    }
  };

  const formatTotalDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'google_meet': return 'Google Meet';
      case 'zoom': return 'Zoom';
      case 'teams': return 'Teams';
      default: return 'Recording';
    }
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1200px] px-6 py-8 md:px-10 md:py-10">
        {/* Welcome message */}
        <p
          className="text-muted-foreground"
          style={{
            fontFamily: 'DM Sans, sans-serif',
            fontSize: 14,
            margin: '0 0 24px 0',
            fontWeight: 400,
          }}
        >
          Welcome back, {user?.email?.split('@')[0] || 'User'}
        </p>

        {/* Header: Meetings title + Record button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1
              className="text-3xl font-semibold tracking-[-0.02em] text-foreground md:text-[2rem]"
              style={{
                fontFamily: 'Outfit, sans-serif',
                margin: 0,
              }}
            >
              Meetings
            </h1>
            <p
              className="text-muted-foreground"
              style={{
                fontFamily: 'DM Sans, sans-serif',
                fontSize: 13,
                margin: '4px 0 0 0',
              }}
            >
              Your meeting intelligence hub
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
            className="mb-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3.5 text-sm text-destructive dark:text-red-200"
          >
            {fetchError}. Check your connection and that the app is pointed at the correct Supabase project.
          </div>
        )}

        {/* Stats Row: 3 columns */}
        {!loading && meetings.length > 0 && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
              {/* Meetings Count */}
              <div className="rounded-[14px] border border-border bg-card p-6 shadow-sm">
                <div className="text-foreground" style={{ fontFamily: 'Outfit, sans-serif', fontSize: 32, fontWeight: 700, margin: 0 }}>
                  {meetings.length}
                </div>
                <div className="text-muted-foreground" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, margin: '4px 0 0 0' }}>
                  Meetings
                </div>
              </div>

              <div className="rounded-[14px] border border-border bg-card p-6 shadow-sm">
                <div className="text-foreground" style={{ fontFamily: 'Outfit, sans-serif', fontSize: 32, fontWeight: 700, margin: 0 }}>
                  {(() => {
                    const totalSecs = meetings.reduce((acc, m) => acc + (m.duration_seconds || 0), 0);
                    const hours = Math.floor(totalSecs / 3600);
                    const mins = Math.floor((totalSecs % 3600) / 60);
                    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                  })()}
                </div>
                <div className="text-muted-foreground" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, margin: '4px 0 0 0' }}>
                  Recorded
                </div>
              </div>

              <div className="rounded-[14px] border border-border bg-card p-6 shadow-sm">
                <div className="text-foreground" style={{ fontFamily: 'Outfit, sans-serif', fontSize: 32, fontWeight: 700, margin: 0 }}>
                  {meetings.filter(m => m.summary).length}
                </div>
                <div className="text-muted-foreground" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, margin: '4px 0 0 0' }}>
                  Summaries
                </div>
              </div>
            </div>

            {/* Time Saved Banner */}
            <div className="mb-8 flex items-center gap-3.5 rounded-xl border border-green-500/20 bg-green-500/[0.08] px-5 py-4 dark:bg-green-500/10">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500/15">
                <Sparkles className="h-5 w-5 text-green-600 dark:text-green-400" style={{ flexShrink: 0 }} />
              </div>
              <div>
                <div className="text-foreground" style={{ fontFamily: 'Outfit, sans-serif', fontSize: 15, fontWeight: 600, margin: 0 }}>
                  ~{(() => {
                    const totalSecs = meetings.reduce((acc, m) => acc + (m.duration_seconds || 0), 0);
                    const totalMins = Math.round(totalSecs / 60);
                    const saved = Math.round(totalMins * 0.25);
                    const hours = Math.floor(saved / 60);
                    const mins = saved % 60;
                    return hours > 0 ? `${hours}h ${mins}m saved` : `${mins}m saved`;
                  })()}
                </div>
                <div className="text-muted-foreground" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, margin: '2px 0 0 0' }}>
                  Estimated time saved on meeting summaries
                </div>
              </div>
            </div>

            {/* Recent Meetings Label */}
            <div className="mb-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Recent Meetings
            </div>
          </>
        )}

        {/* Meeting cards */}
        {loading ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-muted/20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-orange-500" />
            <p className="text-sm text-muted-foreground">Loading meetings…</p>
          </div>
        ) : meetings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
            <Mic className="mx-auto mb-4 h-12 w-12 text-muted-foreground" strokeWidth={1.5} />
            <p className="text-base font-medium text-foreground">No meetings yet</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              Click Record to capture your first meeting. Summaries and insights will show up here.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {meetings.map((meeting) => (
              <Link
                key={meeting.id}
                to={`/meeting/${meeting.id}`}
                className="group block no-underline"
              >
                <div className="cursor-pointer rounded-2xl border border-border bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-px hover:border-orange-500/20 hover:bg-muted/50 hover:shadow-md dark:hover:bg-muted/30">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 0 }}>
                      {/* Meeting icon */}
                      <div style={{
                        width: 42, height: 42, borderRadius: 12,
                        background: meeting.status === 'processing'
                          ? 'rgba(59,130,246,0.1)'
                          : 'rgba(249,115,22,0.08)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        {meeting.status === 'processing' ? (
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: T.blue, animation: 'pulse 1.5s infinite' }} />
                        ) : (
                          <FileText size={18} color={T.orangeL} />
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{
                            fontFamily: 'Outfit, sans-serif', fontSize: 15, fontWeight: 600,
                            color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
                          }}>
                            {meeting.title}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const }}>
                          <StatusBadge status={meeting.status || 'scheduled'} />
                          <SourceBadge source={meeting.source || 'manual'} />
                          {(meeting as any).language && (
                            <Badge color={T.textS} bg="rgba(168,168,168,0.08)">
                              <Globe size={10} /> {(meeting as any).language}
                            </Badge>
                          )}
                          <span style={{ color: T.textM, fontSize: 12 }}>
                            {getSourceLabel(meeting.source)} · {format(new Date(meeting.start_time), 'MMM d')} {format(new Date(meeting.start_time), 'h:mm a')}
                            {meeting.duration_seconds ? ` · ${formatDuration(meeting.duration_seconds)}` : ''}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right side stats + chevron */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                      {meeting.status === 'completed' && (
                        <div style={{ display: 'flex', gap: 12, color: T.textM, fontSize: 12 }}>
                          {meeting.duration_seconds && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                              <Clock size={12} /> {formatDuration(meeting.duration_seconds)}
                            </span>
                          )}
                          {insightCounts[meeting.id] && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                              <Zap size={12} /> Summary
                            </span>
                          )}
                        </div>
                      )}
                      <ChevronRight size={16} className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
