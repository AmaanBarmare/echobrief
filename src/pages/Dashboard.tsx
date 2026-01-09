import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { RecordingButton } from '@/components/dashboard/RecordingButton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Meeting } from '@/types/meeting';
import { Input } from '@/components/ui/input';
import { Search, Loader2, Clock, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface PrefillMeeting {
  title: string;
  calendarEventId?: string;
  meetingLink?: string;
}

export default function Dashboard() {
  const { user } = useAuth();
  const location = useLocation();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
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

  const handleRecordingComplete = (meetingId: string) => {
    supabase.functions.invoke('process-meeting', {
      body: { meetingId },
    });
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    return `${mins}m`;
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Inbox</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {meetings.length} meeting{meetings.length !== 1 ? 's' : ''}
            </p>
          </div>
          <RecordingButton 
            onRecordingComplete={handleRecordingComplete}
            prefillTitle={prefillMeeting?.title}
            calendarEventId={prefillMeeting?.calendarEventId}
            meetingLink={prefillMeeting?.meetingLink}
          />
        </div>

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

        {/* Meetings List */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
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
