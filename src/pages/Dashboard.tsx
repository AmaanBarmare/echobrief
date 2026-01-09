import { useEffect, useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { RecordingButton } from '@/components/dashboard/RecordingButton';
import { StatsCards } from '@/components/dashboard/StatsCards';
import { MeetingsChart } from '@/components/dashboard/MeetingsChart';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Meeting } from '@/types/meeting';
import { Input } from '@/components/ui/input';
import { Search, Clock, ChevronRight, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

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

export default function Dashboard() {
  const { user } = useAuth();
  const location = useLocation();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
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
        
        // Fetch which meetings have insights
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

  const filteredMeetings = meetings.filter((meeting) =>
    meeting.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Calculate stats
  const stats = useMemo(() => {
    const totalMeetings = meetings.length;
    const totalDuration = meetings.reduce((sum, m) => sum + (m.duration_seconds || 0), 0);
    const transcriptCount = Object.keys(insightCounts).length;
    const completedCount = meetings.filter(m => m.status === 'completed').length;
    
    return { totalMeetings, totalDuration, transcriptCount, completedCount };
  }, [meetings, insightCounts]);

  // Estimate time saved (avg 15 min per meeting summary)
  const timeSavedMinutes = stats.transcriptCount * 15;

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    return `${mins}m`;
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
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

        {/* Stats Cards */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="mb-8">
            <StatsCards 
              totalMeetings={stats.totalMeetings}
              totalDuration={stats.totalDuration}
              transcriptCount={stats.transcriptCount}
              completedCount={stats.completedCount}
            />
            {/* Time Saved Banner */}
            {timeSavedMinutes > 0 && (
              <div className="mt-4 p-4 rounded-lg bg-success/10 border border-success/20 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-success" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    ~{Math.floor(timeSavedMinutes / 60)}h {timeSavedMinutes % 60}m saved
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Time saved on meeting summaries with AI
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Weekly Chart */}
        {!loading && meetings.length > 0 && (
          <div className="mb-8">
            <MeetingsChart meetings={meetings} />
          </div>
        )}

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search meetings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 bg-secondary border-0"
          />
        </div>

        {/* Section Title */}
        <h2 className="text-sm font-medium text-muted-foreground mb-3">
          Recent Meetings
        </h2>

        {/* Meetings List */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : filteredMeetings.length === 0 ? (
          <div className="empty-state">
            <Search className="empty-state-icon" />
            <p className="empty-state-title">
              {searchQuery ? 'No meetings found' : 'No meetings yet'}
            </p>
            <p className="empty-state-description">
              {searchQuery ? 'Try a different search term' : 'Click Record to capture your first meeting'}
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {filteredMeetings.map((meeting) => (
              <Link
                key={meeting.id}
                to={`/meeting/${meeting.id}`}
                className="list-row group"
              >
                {/* Status dot */}
                <div className={cn('status-dot', meeting.status)} />
                
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-foreground truncate block">
                    {meeting.title}
                  </span>
                </div>

                {/* Insights badge */}
                {insightCounts[meeting.id] && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                    AI Summary
                  </span>
                )}

                {/* Metadata */}
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  {meeting.duration_seconds && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {formatDuration(meeting.duration_seconds)}
                    </span>
                  )}
                  <span>{format(new Date(meeting.start_time), 'MMM d')}</span>
                  <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
