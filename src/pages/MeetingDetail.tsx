import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Meeting, Transcript, MeetingInsights } from '@/types/meeting';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ArrowLeft, Calendar, Clock, Loader2, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function MeetingDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [insights, setInsights] = useState<MeetingInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  useEffect(() => {
    if (!user || !id) return;

    const fetchMeetingData = async () => {
      const { data: meetingData } = await supabase
        .from('meetings')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (meetingData) {
        setMeeting(meetingData as Meeting);

        const { data: transcriptData } = await supabase
          .from('transcripts')
          .select('*')
          .eq('meeting_id', id)
          .single();

        if (transcriptData) {
          setTranscript({
            ...transcriptData,
            speakers: (transcriptData.speakers as any) || [],
            word_timestamps: (transcriptData.word_timestamps as any) || [],
          } as Transcript);
        }

        const { data: insightsData } = await supabase
          .from('meeting_insights')
          .select('*')
          .eq('meeting_id', id)
          .single();

        if (insightsData) {
          setInsights({
            ...insightsData,
            key_points: (insightsData.key_points as any) || [],
            action_items: (insightsData.action_items as any) || [],
            decisions: (insightsData.decisions as any) || [],
            risks: (insightsData.risks as any) || [],
            follow_ups: (insightsData.follow_ups as any) || [],
            summary_short: insightsData.summary_short || '',
            summary_detailed: insightsData.summary_detailed || '',
          } as MeetingInsights);
        }
      }

      setLoading(false);
    };

    fetchMeetingData();
  }, [user, id]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!meeting) {
    return (
      <DashboardLayout>
        <div className="max-w-3xl mx-auto px-6 py-8">
          <p className="text-muted-foreground">Meeting not found</p>
        </div>
      </DashboardLayout>
    );
  }

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    return `${mins} min`;
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Back button */}
        <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>

        {/* Title */}
        <h1 className="text-2xl font-semibold text-foreground mb-2">{meeting.title}</h1>
        
        {/* Metadata */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-8">
          <span className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4" />
            {format(new Date(meeting.start_time), 'MMMM d, yyyy · h:mm a')}
          </span>
          {meeting.duration_seconds && (
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              {formatDuration(meeting.duration_seconds)}
            </span>
          )}
          <span className={cn(
            'status-dot',
            meeting.status
          )} />
          <span className="capitalize">{meeting.status}</span>
        </div>

        {/* Content */}
        {insights ? (
          <div className="space-y-8">
            {/* Summary */}
            <section className="doc-section">
              <h2 className="doc-section-title">Summary</h2>
              <p className="doc-content">{insights.summary_short}</p>
              {insights.summary_detailed && (
                <p className="doc-content mt-3 text-muted-foreground">{insights.summary_detailed}</p>
              )}
            </section>

            {/* Key Points */}
            {insights.key_points && insights.key_points.length > 0 && (
              <section className="doc-section">
                <h2 className="doc-section-title">Key Points</h2>
                <ul className="space-y-2">
                  {insights.key_points.map((point: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 doc-content">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent mt-2 flex-shrink-0" />
                      {point}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Action Items */}
            {insights.action_items && insights.action_items.length > 0 && (
              <section className="doc-section">
                <h2 className="doc-section-title">Action Items</h2>
                <div className="space-y-2">
                  {insights.action_items.map((item: any, i: number) => (
                    <div key={i} className="action-item">
                      <Checkbox id={`action-${i}`} className="action-item-checkbox" />
                      <label htmlFor={`action-${i}`} className="action-item-text cursor-pointer">
                        {item.task}
                        {item.owner && (
                          <span className="text-muted-foreground ml-2">— {item.owner}</span>
                        )}
                      </label>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Decisions */}
            {insights.decisions && insights.decisions.length > 0 && (
              <section className="doc-section">
                <h2 className="doc-section-title">Decisions</h2>
                <ul className="space-y-2">
                  {insights.decisions.map((decision: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 doc-content">
                      <span className="w-1.5 h-1.5 rounded-full bg-warning mt-2 flex-shrink-0" />
                      {decision}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Transcript (collapsible) */}
            {transcript && (
              <Collapsible open={transcriptOpen} onOpenChange={setTranscriptOpen}>
                <CollapsibleTrigger className="collapsible-trigger">
                  <ChevronRight className="w-4 h-4" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Full Transcript</span>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-4">
                  <p className="doc-content whitespace-pre-wrap text-muted-foreground">
                    {transcript.content}
                  </p>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        ) : meeting.status === 'processing' ? (
          <div className="empty-state">
            <Loader2 className="empty-state-icon animate-spin" />
            <p className="empty-state-title">Processing meeting...</p>
            <p className="empty-state-description">AI is analyzing your recording. This usually takes a few minutes.</p>
          </div>
        ) : (
          <div className="empty-state">
            <p className="empty-state-title">No insights available</p>
            <p className="empty-state-description">This meeting hasn't been processed yet.</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
