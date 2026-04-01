import { useEffect, useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { RecordingButton } from '@/components/dashboard/RecordingButton';
import { ExtensionStatus } from '@/components/dashboard/ExtensionStatus';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Meeting } from '@/types/meeting';
import { Clock, ChevronRight, Mic, Users, CheckCircle2, Globe, Bot, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { MeetingStatusBadge } from '@/components/dashboard/MeetingStatusBadge';

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

// Status badge component matching the prototype
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    completed: { bg: '#FFF7ED', color: '#C2410C', label: 'Completed' },
    processing: { bg: '#DBEAFE', color: '#1D4ED8', label: 'Processing' },
    recording: { bg: '#DCFCE7', color: '#15803D', label: 'Recording' },
    failed: { bg: '#FEE2E2', color: '#B91C1C', label: 'Failed' },
    scheduled: { bg: 'rgba(168,168,168,0.1)', color: '#A8A29E', label: 'Scheduled' },
  };
  const s = map[status] || map.scheduled;
  return (
    <span
      className="inline-flex items-center gap-1.5"
      style={{ padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 600, color: s.color, background: s.bg, letterSpacing: '0.02em' }}
    >
      {status === 'recording' && (
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
      )}
      {s.label}
    </span>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const location = useLocation();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [insightCounts, setInsightCounts] = useState<Record<string, boolean>>({});
  
  const prefillMeeting = (location.state as { prefillMeeting?: PrefillMeeting })?.prefillMeeting;

  useEffect(() => {
    if (!user) return;

    const fetchMeetings = async () => {
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('user_id', user.id)
        .order('start_time', { ascending: false });

      if (!error && data) {
        setMeetings(data as Meeting[]);
        
        const { data: insights } = await supabase
          .from('meeting_insights')
          .select('meeting_id')
          .in('meeting_id', data.map(m => m.id));
        
        if (insights) {
          const counts: Record<string, boolean> = {};
          insights.forEach(i => { counts[i.meeting_id] = true; });
          setInsightCounts(counts);
        }
      }
      setLoading(false);
    };

    fetchMeetings();

    const channel = supabase
      .channel('meetings-changes')
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
      supabase.removeChannel(channel);
    };
  }, [user]);

  const stats = useMemo(() => {
    const totalMeetings = meetings.length;
    const totalDuration = meetings.reduce((sum, m) => sum + (m.duration_seconds || 0), 0);
    const transcriptCount = Object.keys(insightCounts).length;
    const completedCount = meetings.filter(m => m.status === 'completed').length;
    
    return { totalMeetings, totalDuration, transcriptCount, completedCount };
  }, [meetings, insightCounts]);

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    return `${mins}m`;
  };

  const formatTotalDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-8 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-7">
          <div>
            <h1 
              className="text-[26px] font-semibold text-foreground"
              style={{ fontFamily: 'Outfit, sans-serif', letterSpacing: '-0.02em' }}
            >
              Your Meetings
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {meetings.length} meetings · {Object.keys(insightCounts).length} summaries generated
            </p>
          </div>
          <RecordingButton 
            prefillTitle={prefillMeeting?.title}
            calendarEventId={prefillMeeting?.calendarEventId}
            meetingLink={prefillMeeting?.meetingLink}
            attendees={prefillMeeting?.attendees}
          />
        </div>

        {/* Extension Status Banner */}
        <ExtensionStatus className="mb-6" />

        {/* Quick Stats - 4 column grid matching prototype */}
        {!loading && meetings.length > 0 && (
          <div className="grid grid-cols-4 gap-3 mb-7">
            {[
              { label: 'Total Meetings', value: stats.totalMeetings.toString(), sub: 'All time', icon: <Mic size={18} style={{ color: '#FB923C' }} /> },
              { label: 'Summaries', value: stats.transcriptCount.toString(), sub: `${stats.completedCount} completed`, icon: <CheckCircle2 size={18} style={{ color: '#22C55E' }} /> },
              { label: 'Recorded', value: formatTotalDuration(stats.totalDuration), sub: 'Total duration', icon: <Globe size={18} style={{ color: '#A855F7' }} /> },
              { label: 'Completed', value: stats.completedCount.toString(), sub: 'With insights', icon: <Bot size={18} style={{ color: '#3B82F6' }} /> },
            ].map((stat, i) => (
              <div
                key={i}
                className="rounded-2xl p-[18px] transition-all duration-200"
                style={{ background: '#1C1917', border: '1px solid #292524' }}
              >
                <div className="flex justify-between items-start mb-3">
                  {stat.icon}
                </div>
                <div 
                  className="text-[26px] font-bold text-foreground mb-0.5"
                  style={{ fontFamily: 'Outfit, sans-serif' }}
                >
                  {stat.value}
                </div>
                <div className="text-xs" style={{ color: '#78716C' }}>{stat.label}</div>
                <div className="text-[11px] mt-0.5" style={{ color: '#A8A29E' }}>{stat.sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* Meeting cards */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-[76px] rounded-2xl" />
            ))}
          </div>
        ) : meetings.length === 0 ? (
          <div className="text-center py-16">
            <Mic className="w-12 h-12 mx-auto mb-4" style={{ color: '#78716C' }} />
            <p className="text-base font-medium text-foreground mb-1">No meetings yet</p>
            <p className="text-sm max-w-sm mx-auto" style={{ color: '#A8A29E' }}>
              Click Record to capture your first meeting. Your AI-powered summaries will appear here.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {meetings.map((meeting) => (
              <Link
                key={meeting.id}
                to={`/meeting/${meeting.id}`}
                className="block group"
              >
                <div
                  className="rounded-2xl p-5 transition-all duration-200 cursor-pointer"
                  style={{ background: '#1C1917', border: '1px solid #292524' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#292524';
                    e.currentTarget.style.borderColor = '#44403C';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#1C1917';
                    e.currentTarget.style.borderColor = '#292524';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      {/* Meeting icon */}
                      <div 
                        className="w-[42px] h-[42px] rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ 
                          background: meeting.status === 'processing' 
                            ? 'rgba(59,130,246,0.1)' 
                            : 'rgba(249,115,22,0.08)' 
                        }}
                      >
                        {meeting.status === 'processing' ? (
                          <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: '#3B82F6' }} />
                        ) : (
                          <FileText size={18} style={{ color: '#FB923C' }} />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span 
                            className="text-[15px] font-semibold text-foreground truncate"
                            style={{ fontFamily: 'Outfit, sans-serif' }}
                          >
                            {meeting.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <StatusBadge status={meeting.status || 'scheduled'} />
                          {insightCounts[meeting.id] && (
                            <span
                              className="inline-flex items-center"
                              style={{ padding: '3px 10px', borderRadius: 100, fontSize: 11, fontWeight: 600, color: '#A855F7', background: 'rgba(168,85,247,0.12)' }}
                            >
                              Summary
                            </span>
                          )}
                          <span className="text-xs" style={{ color: '#78716C' }}>
                            {meeting.source === 'google_meet' ? 'Google Meet' : meeting.source === 'zoom' ? 'Zoom' : meeting.source === 'teams' ? 'Teams' : 'Recording'} · {format(new Date(meeting.start_time), 'MMM d')} {format(new Date(meeting.start_time), 'h:mm a')}
                            {meeting.duration_seconds ? ` · ${formatDuration(meeting.duration_seconds)}` : ''}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right side stats + chevron */}
                    <div className="flex items-center gap-4 flex-shrink-0">
                      {meeting.status === 'completed' && meeting.duration_seconds && (
                        <div className="flex gap-3 text-xs" style={{ color: '#78716C' }}>
                          <span className="flex items-center gap-1">
                            <Clock size={12} />
                            {formatDuration(meeting.duration_seconds)}
                          </span>
                        </div>
                      )}
                      <ChevronRight size={16} style={{ color: '#78716C' }} />
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
