import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { SlackDeliverySelector } from '@/components/dashboard/SlackDeliverySelector';
import { WhatsAppDeliverySelector } from '@/components/dashboard/WhatsAppDeliverySelector';
import { EmailReportSelector } from '@/components/dashboard/EmailReportSelector';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Meeting, Transcript, MeetingInsights, StrategicInsight, SpeakerHighlight, ActionItem, FollowUp } from '@/types/meeting';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { 
  ArrowLeft, Calendar, Clock, Loader2, ChevronRight, Trash2, Users, Send, 
  Lightbulb, AlertTriangle, HelpCircle, RefreshCw, Zap, CheckCircle2, 
  FileText, Globe, MessageCircle, Mail, Languages, Bot
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

interface SpeakerSegment {
  speaker: string;
  text: string;
  start?: number;
  end?: number;
}

interface Attendee {
  email: string;
  displayName?: string | null;
  responseStatus?: string | null;
  organizer?: boolean;
}

// ─── Clean modern badges ───
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; tint: string; label: string }> = {
    completed: { color: 'hsl(var(--success))', tint: 'color-mix(in oklch, hsl(var(--success)) 14%, transparent)', label: 'Completed' },
    processing: { color: 'hsl(var(--warning))', tint: 'color-mix(in oklch, hsl(var(--warning)) 14%, transparent)', label: 'Processing' },
    recording: { color: 'var(--ember)', tint: 'color-mix(in oklch, var(--ember) 12%, transparent)', label: 'Recording' },
    failed: { color: 'hsl(var(--destructive))', tint: 'color-mix(in oklch, hsl(var(--destructive)) 12%, transparent)', label: 'Failed' },
    scheduled: { color: 'var(--ink-soft)', tint: 'color-mix(in oklch, var(--ink) 8%, transparent)', label: 'Scheduled' },
  };
  const s = map[status] || map.scheduled;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium"
      style={{ color: s.color, background: s.tint }}
    >
      {status === 'recording' && <span className="status-dot recording" style={{ width: 6, height: 6 }} />}
      {s.label}
    </span>
  );
}

function SourceBadge({ source }: { source: string }) {
  const label = source === 'google_meet' ? 'Google Meet' : source === 'zoom' ? 'Zoom' : source === 'teams' ? 'Teams' : 'Recording';
  return (
    <span
      className="inline-flex items-center gap-1 text-[12.5px]"
      style={{ color: 'var(--ink-mid)' }}
    >
      <Bot size={12} strokeWidth={1.75} />
      {label}
    </span>
  );
}

function ShareButton({ icon: Icon, label, onClick }: { icon: React.ComponentType<{ className?: string; strokeWidth?: number; size?: number }>; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors"
      style={{
        border: '1px solid var(--rule)',
        background: 'var(--paper-card)',
        color: 'var(--ink)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'color-mix(in oklch, var(--ink) 20%, transparent)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--rule)'; }}
    >
      <Icon size={13} strokeWidth={1.75} />
      {label}
    </button>
  );
}

function ProtoCard({ children, style, className }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return (
    <div
      className={cn('rounded-xl p-6', className)}
      style={{
        background: 'var(--paper-card)',
        border: '1px solid var(--rule)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Legacy — now a no-op (was the orange gradient bar)
function GradientBar() {
  return null;
}

export default function MeetingDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [speakerSegments, setSpeakerSegments] = useState<SpeakerSegment[]>([]);
  const [insights, setInsights] = useState<MeetingInsights | null>(null);
  const [emailMessages, setEmailMessages] = useState<any[]>([]);
  const [slackMessages, setSlackMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [slackDialogOpen, setSlackDialogOpen] = useState(false);
  const [slackChannelId, setSlackChannelId] = useState<string | undefined>();
  const [slackChannelName, setSlackChannelName] = useState<string | undefined>();
  const [whatsappDialogOpen, setWhatsappDialogOpen] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('summary');
  const [summaryLang, setSummaryLang] = useState('English');

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

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
        
        if (meetingData.attendees && Array.isArray(meetingData.attendees)) {
          setAttendees(meetingData.attendees as unknown as Attendee[]);
        }

        // Also derive attendees from transcript speaker segments if attendees is empty
        // (bot recordings don't populate the attendees field, but speakers are in the transcript)

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
          
          if (transcriptData.speakers && Array.isArray(transcriptData.speakers)) {
            const segments = transcriptData.speakers as unknown as SpeakerSegment[];
            setSpeakerSegments(segments);

            // Derive attendees from speaker names if not already set
            if (!meetingData.attendees || (meetingData.attendees as any[]).length === 0) {
              const uniqueNames = [...new Set(segments.map((s) => s.speaker).filter(Boolean))];
              const derived: Attendee[] = uniqueNames.map((name) => ({
                email: '',
                displayName: name,
              }));
              setAttendees(derived);
            }
          }
        }

        const { data: insightsRows } = await supabase
          .from('meeting_insights')
          .select('*')
          .eq('meeting_id', id)
          .order('created_at', { ascending: false })
          .limit(1);

        const insightsData = insightsRows?.[0] || null;
        if (insightsData) {
          setInsights({
            ...insightsData,
            key_points: (insightsData.key_points as any) || [],
            action_items: (insightsData.action_items as any) || [],
            decisions: (insightsData.decisions as any) || [],
            risks: (insightsData.risks as any) || [],
            follow_ups: (insightsData.follow_ups as any) || [],
            strategic_insights: (insightsData.strategic_insights as any) || [],
            speaker_highlights: (insightsData.speaker_highlights as any) || [],
            open_questions: (insightsData.open_questions as any) || [],
            timeline_entries: (insightsData.timeline_entries as any) || [],
            meeting_metrics: (insightsData.meeting_metrics as any) || {},
            summary_short: insightsData.summary_short || '',
            summary_detailed: insightsData.summary_detailed || '',
          } as MeetingInsights);
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('slack_channel_id, slack_channel_name')
          .eq('user_id', user.id)
          .single();

        if (profile) {
          setSlackChannelId(profile.slack_channel_id || undefined);
          setSlackChannelName(profile.slack_channel_name || undefined);
        }

        // Fetch delivery history
        const { data: emailMsgs } = await supabase
          .from('email_messages')
          .select('*')
          .eq('meeting_id', id)
          .order('created_at', { ascending: false });

        if (emailMsgs) {
          setEmailMessages(emailMsgs);
        }

        const { data: slackMsgs } = await supabase
          .from('slack_messages')
          .select('*')
          .eq('meeting_id', id)
          .order('created_at', { ascending: false });

        if (slackMsgs) {
          setSlackMessages(slackMsgs);
        }
      }

      setLoading(false);
    };

    fetchMeetingData();
  }, [user, id]);

  // Listen for status updates via Supabase Realtime + a single backend
  // fallback call instead of hammering check-recall-status every 5 seconds.
  useEffect(() => {
    if (!user || !id || !meeting) return;
    const terminalStatuses = ['completed', 'failed'];
    if (terminalStatuses.includes(meeting.status)) return;

    // Subscribe to realtime changes on this meeting row
    const channel = supabase
      .channel(`meeting-status-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'meetings', filter: `id=eq.${id}` },
        async (payload) => {
          const updatedMeeting = payload.new as Meeting;
          setMeeting(updatedMeeting);

          if (updatedMeeting.status === 'completed') {
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
              if (transcriptData.speakers && Array.isArray(transcriptData.speakers)) {
                setSpeakerSegments(transcriptData.speakers as unknown as SpeakerSegment[]);
              }
            }

            const { data: insightsRows } = await supabase
              .from('meeting_insights')
              .select('*')
              .eq('meeting_id', id)
              .order('created_at', { ascending: false })
              .limit(1);

            const insightsData = insightsRows?.[0] || null;
            if (insightsData) {
              setInsights({
                ...insightsData,
                key_points: (insightsData.key_points as any) || [],
                action_items: (insightsData.action_items as any) || [],
                decisions: (insightsData.decisions as any) || [],
                risks: (insightsData.risks as any) || [],
                follow_ups: (insightsData.follow_ups as any) || [],
                strategic_insights: (insightsData.strategic_insights as any) || [],
                speaker_highlights: (insightsData.speaker_highlights as any) || [],
                open_questions: (insightsData.open_questions as any) || [],
                timeline_entries: (insightsData.timeline_entries as any) || [],
                meeting_metrics: (insightsData.meeting_metrics as any) || {},
                summary_short: insightsData.summary_short || '',
                summary_detailed: insightsData.summary_detailed || '',
              } as MeetingInsights);
            }
          }
        }
      )
      .subscribe();

    // Single backend fallback: call check-recall-status once after 30s,
    // then again every 60s — just in case the webhook was missed entirely.
    let fallbackCount = 0;
    const maxFallbacks = 10; // stop after ~10 minutes
    const callFallback = async () => {
      if (!meeting.recall_bot_id || fallbackCount >= maxFallbacks) return;
      fallbackCount++;
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        if (token) {
          await fetch(`${SUPABASE_URL}/functions/v1/check-recall-status`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ meeting_id: id }),
          });
        }
      } catch {
        // Ignore fallback errors
      }
    };

    const initialTimeout = setTimeout(callFallback, 30_000);
    const fallbackInterval = setInterval(callFallback, 60_000);

    return () => {
      supabase.removeChannel(channel);
      clearTimeout(initialTimeout);
      clearInterval(fallbackInterval);
    };
  }, [user, id, meeting?.status, meeting?.recall_bot_id]);

  const handleDelete = async () => {
    if (!meeting || !user) return;
    setDeleting(true);
    try {
      await supabase.from('meeting_insights').delete().eq('meeting_id', meeting.id);
      await supabase.from('transcripts').delete().eq('meeting_id', meeting.id);
      await supabase.from('slack_messages').delete().eq('meeting_id', meeting.id);
      if (meeting.audio_url) {
        await supabase.storage.from('recordings').remove([meeting.audio_url]);
      }
      const { error } = await supabase.from('meetings').delete().eq('id', meeting.id).eq('user_id', user.id);
      if (error) throw error;
      toast({ title: 'Meeting deleted', description: 'The meeting and all related data have been removed.' });
      navigate('/dashboard');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to delete meeting', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const getInitials = (name?: string | null, email?: string) => {
    if (name) return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    if (email) return email.slice(0, 2).toUpperCase();
    return '??';
  };

  const handleSendToSlack = async (destination: { type: 'dm' | 'channel'; channelId: string; channelName?: string }) => {
    if (!meeting || !session?.access_token) return;
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/process-meeting`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId: meeting.id, slackDestination: destination }),
      });
      const data = await response.json();
      if (data.slackSent) {
        toast({ title: 'Sent to Slack', description: `Summary sent to ${destination.channelName || destination.channelId}` });
      } else throw new Error('Failed to send');
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to send summary to Slack', variant: 'destructive' });
    }
  };

  const handleSendToWhatsApp = async (phoneNumber: string) => {
    if (!meeting || !user || !session?.access_token) return;
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp-report`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          meeting_id: meeting.id, 
          user_id: user.id,
          phone_number: phoneNumber,
          language: summaryLang.toLowerCase(),
        }),
      });
      const data = await response.json();
      if (data.success) {
        toast({ title: 'Sent to WhatsApp', description: `Report sent to ${phoneNumber}` });
      } else throw new Error(data.error || 'Failed to send');
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to send to WhatsApp', variant: 'destructive' });
    }
  };

  const handleSendEmail = async (emailAddress: string) => {
    if (!meeting || !user || !session?.access_token) return;
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/send-email-report`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          meeting_id: meeting.id, 
          user_id: user.id,
          recipient_email: emailAddress,
        }),
      });
      const data = await response.json();
      if (data.success) {
        toast({ title: 'Sent', description: `Report sent to ${emailAddress}` });
      } else throw new Error(data.error || 'Failed to send');
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to send email', variant: 'destructive' });
    }
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'high': return 'bg-destructive/10 text-destructive border-destructive/20';
      case 'medium': return 'bg-warning/10 text-warning border-warning/20';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    return `${mins} min`;
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-[960px] px-6 py-10 md:px-10 md:py-14">
          <Skeleton className="mb-6 h-4 w-32" />
          <Skeleton className="mb-3 h-4 w-64" />
          <Skeleton className="mb-6 h-12 w-[80%]" />
          <Skeleton className="mb-2 h-4 w-48" />
          <div className="mt-10 space-y-4">
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!meeting) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-[960px] px-6 py-20 md:px-8">
          <h1 className="text-[24px] font-semibold" style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}>
            Meeting not found
          </h1>
          <p className="mt-2 text-[14.5px]" style={{ color: 'var(--ink-mid)' }}>
            The meeting may have been deleted or the link is wrong.
          </p>
          <Link
            to="/dashboard"
            className="mt-5 inline-flex items-center gap-1.5 text-[13.5px] font-medium no-underline"
            style={{ color: 'var(--ember-deep)' }}
          >
            <ArrowLeft size={14} strokeWidth={1.75} /> Back to meetings
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  const actionItemCount = insights?.action_items?.length || 0;

  const tabs = [
    { id: 'summary', label: 'Summary', icon: <Zap size={14} /> },
    { id: 'actions', label: `Actions (${actionItemCount})`, icon: <CheckCircle2 size={14} /> },
    { id: 'transcript', label: 'Transcript', icon: <FileText size={14} /> },
    { id: 'delivery', label: 'Delivery', icon: <Mail size={14} /> },
  ];

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[960px] px-6 py-8 md:px-8 md:py-10">
        <div className="mb-8">
          <Link
            to="/dashboard"
            className="mb-5 inline-flex items-center gap-1.5 text-[13px] no-underline transition-colors"
            style={{ color: 'var(--ink-mid)' }}
          >
            <ArrowLeft size={14} strokeWidth={1.75} />
            Back to meetings
          </Link>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h1
                className="text-[28px] font-semibold leading-tight"
                style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
              >
                {meeting.title}
              </h1>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]" style={{ color: 'var(--ink-mid)' }}>
                <StatusBadge status={meeting.status || 'scheduled'} />
                <span aria-hidden>·</span>
                <SourceBadge source={meeting.source || 'manual'} />
                <span aria-hidden>·</span>
                <span>{format(new Date(meeting.start_time), 'MMM d, yyyy')}</span>
                <span aria-hidden>·</span>
                <span>{format(new Date(meeting.start_time), 'h:mm a')}</span>
                {meeting.duration_seconds && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{formatDuration(meeting.duration_seconds)}</span>
                  </>
                )}
                {meeting.language && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{meeting.language}</span>
                  </>
                )}
              </div>
              {meeting.status === 'failed' && meeting.error_message && (
                <p className="mt-2 text-[13px]" style={{ color: 'hsl(var(--destructive))' }}>
                  {meeting.error_message}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {insights && (
                <>
                  <ShareButton icon={Send} label="Slack" onClick={() => setSlackDialogOpen(true)} />
                  <ShareButton icon={Mail} label="Email" onClick={() => setEmailDialogOpen(true)} />
                  <ShareButton icon={MessageCircle} label="WhatsApp" onClick={() => setWhatsappDialogOpen(true)} />
                </>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors"
                    style={{ color: 'var(--ink-soft)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in oklch, hsl(var(--destructive)) 8%, transparent)'; e.currentTarget.style.color = 'hsl(var(--destructive))'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ink-soft)'; }}
                  >
                    <Trash2 size={13} strokeWidth={1.75} /> Delete
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Meeting</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete this meeting, including its transcript, insights, and audio recording. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>

        {/* Slack Delivery Selector */}
        <SlackDeliverySelector
          open={slackDialogOpen}
          onOpenChange={setSlackDialogOpen}
          meetingTitle={meeting.title}
          defaultChannel={slackChannelId}
          defaultChannelName={slackChannelName}
          onSend={handleSendToSlack}
        />

        {/* Email Report Selector */}
        <EmailReportSelector
          open={emailDialogOpen}
          onOpenChange={setEmailDialogOpen}
          meetingTitle={meeting.title}
          userEmail={user?.email || undefined}
          onSend={handleSendEmail}
        />

        {/* WhatsApp Delivery Selector */}
        <WhatsAppDeliverySelector
          open={whatsappDialogOpen}
          onOpenChange={setWhatsappDialogOpen}
          meetingTitle={meeting.title}
          onSend={handleSendToWhatsApp}
        />

        {insights && (
          <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Speakers', value: attendees.length || 0 },
              { label: 'Action items', value: actionItemCount },
              { label: 'Decisions', value: insights.decisions?.length || 0 },
              { label: 'Risks', value: insights.risks?.length || 0, alert: (insights.risks?.length || 0) > 0 },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-xl p-4"
                style={{ background: 'var(--paper-card)', border: '1px solid var(--rule)' }}
              >
                <p className="text-[12.5px]" style={{ color: 'var(--ink-mid)' }}>{s.label}</p>
                <p
                  className="mt-1 text-[22px] font-semibold leading-none"
                  style={{ color: s.alert ? 'hsl(var(--destructive))' : 'var(--ink)', letterSpacing: '-0.02em' }}
                >
                  {s.value}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Content */}
        {insights ? (
          <div>
            {/* Tabs — editorial section tabs with underline, not pills */}
            <div
              className="mb-8 flex w-full flex-wrap items-end gap-5"
              style={{ borderBottom: '1px solid var(--rule)' }}
            >
              {tabs.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className="relative flex items-center gap-2 pb-3 pt-1 text-[13px] transition-colors"
                    style={{
                      fontFamily: 'var(--font-body)',
                      color: active ? 'var(--ink)' : 'var(--ink-soft)',
                      background: 'transparent',
                      fontWeight: active ? 600 : 500,
                      letterSpacing: '-0.005em',
                    }}
                  >
                    {tab.icon} {tab.label}
                    {active && (
                      <span
                        aria-hidden
                        className="absolute -bottom-px left-0 right-0 h-[2px]"
                        style={{ background: 'var(--ember)' }}
                      />
                    )}
                  </button>
                );
              })}

              {activeTab === 'summary' && (
                <div className="ml-auto flex items-center gap-2 pb-2">
                  <Languages size={13} strokeWidth={1.5} style={{ color: 'var(--ink-soft)' }} />
                  <select
                    value={summaryLang}
                    onChange={(e) => setSummaryLang(e.target.value)}
                    className="rounded-full px-3 py-1.5 text-[12px] outline-none"
                    style={{
                      fontFamily: 'var(--font-body)',
                      border: '1px solid var(--rule)',
                      background: 'var(--paper-card)',
                      color: 'var(--ink)',
                    }}
                  >
                    {['English', 'Hindi', 'Tamil', 'Telugu', 'Bengali', 'Kannada', 'Marathi', 'Malayalam', 'Gujarati', 'Punjabi'].map((l) => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* ═══ SUMMARY TAB ═══ */}
            {activeTab === 'summary' && (
              <div className="space-y-4">
                {/* Executive Summary */}
                <ProtoCard>
                  <GradientBar />
                  <h3 className="text-[15px] font-semibold text-foreground mb-2" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>
                    Executive Summary
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {insights.summary_short}
                  </p>
                  {insights.summary_detailed && (
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground/90">
                      {insights.summary_detailed}
                    </p>
                  )}
                </ProtoCard>

                {/* Key Decisions */}
                {insights.decisions && insights.decisions.length > 0 && (
                  <ProtoCard>
                    <h3 className="text-[15px] font-semibold text-foreground mb-3 flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>
                      <Zap size={16} style={{ color: 'var(--ember)' }} /> Key Decisions
                    </h3>
                    {insights.decisions.map((d: string, i: number) => (
                      <div
                        key={i}
                        className={cn('flex gap-2 py-2 text-sm text-muted-foreground', i > 0 && 'border-t border-border')}
                      >
                        <span className="min-w-[20px] text-xs font-semibold text-orange-500">{i + 1}.</span> {d}
                      </div>
                    ))}
                  </ProtoCard>
                )}

                {/* Strategic Insights */}
                {insights.strategic_insights && insights.strategic_insights.length > 0 && (
                  <ProtoCard>
                    <h3 className="text-[15px] font-semibold text-foreground mb-3 flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>
                      <Lightbulb size={16} style={{ color: 'var(--amber-warm)' }} /> Strategic Insights
                    </h3>
                    <div className="space-y-3">
                      {(insights.strategic_insights as StrategicInsight[]).map((item, i) => (
                        <div key={i} className="flex items-start gap-3 rounded-xl border border-border bg-orange-500/[0.04] p-3">
                          <p className="flex-1 text-sm text-muted-foreground">{item.insight}</p>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">
                            {item.category || 'insight'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </ProtoCard>
                )}

                {/* Key Points */}
                {insights.key_points && insights.key_points.length > 0 && (
                  <ProtoCard>
                    <h3 className="text-[15px] font-semibold text-foreground mb-3" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>
                      🎯 Key Points
                    </h3>
                    <ul className="space-y-2">
                      {insights.key_points.map((point: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-orange-500" />
                          {point}
                        </li>
                      ))}
                    </ul>
                  </ProtoCard>
                )}

                {/* Risks */}
                {insights.risks && insights.risks.length > 0 && (
                  <ProtoCard style={{ borderColor: 'rgba(239,68,68,0.2)' }}>
                    <h3 className="text-[15px] font-semibold mb-3 flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.01em', color: '#EF4444' }}>
                      <AlertTriangle size={16} /> Risk Flags
                    </h3>
                    {insights.risks.map((r: string, i: number) => (
                      <div key={i} className="text-sm leading-relaxed text-muted-foreground">{r}</div>
                    ))}
                  </ProtoCard>
                )}

                {/* Open Questions */}
                {insights.open_questions && insights.open_questions.length > 0 && (
                  <ProtoCard>
                    <h3 className="text-[15px] font-semibold text-foreground mb-3 flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>
                      <HelpCircle size={16} style={{ color: 'var(--amber-warm)' }} /> Open Questions
                    </h3>
                    {insights.open_questions.map((q: string, i: number) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.15)' }}>
                        <HelpCircle size={14} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--amber-warm)' }} />
                        <p className="text-sm text-muted-foreground">{q}</p>
                      </div>
                    ))}
                  </ProtoCard>
                )}

                {/* Follow-Ups */}
                {insights.follow_ups && insights.follow_ups.length > 0 && (
                  <ProtoCard>
                    <h3 className="text-[15px] font-semibold text-foreground mb-3 flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>
                      <RefreshCw size={16} style={{ color: '#3B82F6' }} /> Follow-Ups
                    </h3>
                    <div className="space-y-2">
                      {(insights.follow_ups as FollowUp[]).map((item, i) => (
                        <div key={i} className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-3">
                          <RefreshCw size={14} className="mt-0.5 flex-shrink-0 text-blue-500" />
                          <div className="flex-1">
                            <p className="text-sm text-muted-foreground">{item.description}</p>
                            <div className="mt-1.5 flex items-center gap-2">
                              {item.assignee && (
                                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                  → {item.assignee}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ProtoCard>
                )}

                {/* Speakers */}
                {attendees.length > 0 && (
                  <ProtoCard>
                    <h3 className="text-[15px] font-semibold text-foreground mb-3 flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>
                      <Users size={16} style={{ color: '#3B82F6' }} /> Speakers
                    </h3>
                    <div className="flex gap-2 flex-wrap">
                      {attendees.map((a, i) => (
                        <div key={i} className="flex items-center gap-2 rounded-full bg-blue-500/10 px-3.5 py-1.5 text-[13px] text-foreground">
                          <div 
                            className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold text-white"
                            style={{ background: 'var(--ember)' }}
                          >
                            {getInitials(a.displayName, a.email)}
                          </div>
                          {a.displayName || a.email}
                          {a.organizer && <span className="text-[11px] text-muted-foreground">(organizer)</span>}
                        </div>
                      ))}
                    </div>
                  </ProtoCard>
                )}

                {/* Speaker Highlights */}
                {insights.speaker_highlights && insights.speaker_highlights.length > 0 && (
                  <ProtoCard>
                    <h3 className="text-[15px] font-semibold text-foreground mb-3 flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>
                      💬 Speaker Highlights
                    </h3>
                    <div className="space-y-3">
                      {(insights.speaker_highlights as SpeakerHighlight[]).map((item, i) => (
                        <div key={i} className="rounded-xl border border-border p-3">
                          <span className="text-sm font-medium text-foreground">{item.speaker}</span>
                          <p className="mt-1 text-sm text-foreground">{item.highlight}</p>
                          <p className="mt-1 text-xs text-muted-foreground">→ {item.context}</p>
                        </div>
                      ))}
                    </div>
                  </ProtoCard>
                )}
              </div>
            )}

            {/* ═══ ACTIONS TAB ═══ */}
            {activeTab === 'actions' && (
              <div className="space-y-2">
                {insights.action_items && (insights.action_items as ActionItem[]).map((item, i) => (
                  <ProtoCard key={i} style={{ padding: 16 }}>
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2',
                          item.done ? 'border-green-500 bg-green-500' : 'border-border bg-transparent'
                        )}
                      >
                        {item.done && <CheckCircle2 size={12} className="text-white" />}
                      </div>
                      <div className="flex-1">
                        <div className={cn('text-sm text-foreground', item.done && 'text-muted-foreground line-through')}>
                          {typeof item === 'string' ? item : item.task}
                        </div>
                        {item.owner && (
                          <div className="mt-0.5 text-xs text-muted-foreground">Assigned to {item.owner}</div>
                        )}
                      </div>
                      {item.owner && (
                        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                          {item.owner}
                        </span>
                      )}
                      {item.priority && (
                        <Badge variant="outline" className={cn('text-xs', getPriorityColor(item.priority))}>
                          {item.priority}
                        </Badge>
                      )}
                    </div>
                  </ProtoCard>
                ))}
                {(!insights.action_items || insights.action_items.length === 0) && (
                  <ProtoCard style={{ textAlign: 'center', padding: 40 }}>
                    <CheckCircle2 size={32} className="mx-auto mb-3 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No action items for this meeting</p>
                  </ProtoCard>
                )}
              </div>
            )}

            {/* ═══ TRANSCRIPT TAB ═══ */}
            {activeTab === 'transcript' && (
              <div>
                {speakerSegments.length > 0 ? speakerSegments.map((seg, i) => {
                  const prevSpeaker = i > 0 ? speakerSegments[i - 1].speaker : null;
                  const isNewSpeaker = seg.speaker !== prevSpeaker;
                  return (
                    <div key={i} className="flex gap-3 border-b border-border py-3">
                      {isNewSpeaker ? (
                        <div 
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0"
                          style={{ background: 'var(--ember)' }}
                        >
                          {seg.speaker[0]}
                        </div>
                      ) : (
                        <div className="w-8 flex-shrink-0" />
                      )}
                      <div>
                        {isNewSpeaker && (
                          <div className="flex gap-2 items-center mb-1">
                            <span className="text-[13px] font-medium text-foreground">{seg.speaker}</span>
                            {seg.start !== undefined && (
                              <span className="text-[11px] font-mono text-muted-foreground">
                                {Math.floor((seg.start || 0) / 60)}:{String(Math.floor((seg.start || 0) % 60)).padStart(2, '0')}
                              </span>
                            )}
                          </div>
                        )}
                        <p className="text-sm leading-relaxed text-muted-foreground">{seg.text}</p>
                      </div>
                    </div>
                  );
                }) : transcript ? (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {transcript.content}
                  </p>
                ) : (
                  <ProtoCard style={{ textAlign: 'center', padding: 40 }}>
                    <FileText size={32} className="mx-auto mb-3 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Transcript will appear here after processing</p>
                  </ProtoCard>
                )}
              </div>
            )}

            {/* ═══ DELIVERY TAB ═══ */}
            {activeTab === 'delivery' && (
              <div className="space-y-3">
                {/* Email Deliveries */}
                {emailMessages.length > 0 && (
                  <>
                    <h3 className="text-[15px] font-semibold text-foreground mb-3 flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>
                      <Mail size={16} style={{ color: '#3B82F6' }} /> Email Deliveries
                    </h3>
                    {emailMessages.map((msg, i) => (
                      <ProtoCard key={i} style={{ padding: 16 }}>
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="text-sm font-medium text-foreground">{msg.recipient_email}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {format(new Date(msg.sent_at || msg.created_at), 'MMM d, yyyy h:mm a')}
                            </div>
                            {msg.error_message && (
                              <div className="mt-1 text-xs text-destructive">
                                Error: {msg.error_message}
                              </div>
                            )}
                          </div>
                          <span
                            className={cn(
                              'rounded-full px-2.5 py-1 text-[11px] font-semibold',
                              msg.status === 'sent' ? 'bg-green-500/15 text-green-600 dark:text-green-400' : 'bg-muted text-muted-foreground'
                            )}
                          >
                            {msg.status === 'sent' ? '✓ Sent' : msg.status === 'failed' ? '✗ Failed' : 'Pending'}
                          </span>
                        </div>
                      </ProtoCard>
                    ))}
                  </>
                )}

                {/* Slack Deliveries */}
                {slackMessages.length > 0 && (
                  <>
                    <h3 className="text-[15px] font-semibold text-foreground mb-3 mt-6 flex items-center gap-2" style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>
                      <Send size={16} style={{ color: 'var(--ember)' }} /> Slack Deliveries
                    </h3>
                    {slackMessages.map((msg, i) => (
                      <ProtoCard key={i} style={{ padding: 16 }}>
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="text-sm font-medium text-foreground">{msg.channel_id}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {format(new Date(msg.sent_at || msg.created_at), 'MMM d, yyyy h:mm a')}
                            </div>
                            {msg.error_message && (
                              <div className="mt-1 text-xs text-destructive">
                                Error: {msg.error_message}
                              </div>
                            )}
                          </div>
                          <span
                            className={cn(
                              'rounded-full px-2.5 py-1 text-[11px] font-semibold',
                              msg.status === 'sent' ? 'bg-green-500/15 text-green-600 dark:text-green-400' : 'bg-muted text-muted-foreground'
                            )}
                          >
                            {msg.status === 'sent' ? '✓ Sent' : msg.status === 'failed' ? '✗ Failed' : 'Pending'}
                          </span>
                        </div>
                      </ProtoCard>
                    ))}
                  </>
                )}

                {emailMessages.length === 0 && slackMessages.length === 0 && (
                  <ProtoCard style={{ textAlign: 'center', padding: 40 }}>
                    <Mail size={32} className="mx-auto mb-3 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No deliveries yet. Send this report via Email or Slack above.</p>
                  </ProtoCard>
                )}
              </div>
            )}
          </div>
        ) : meeting.status === 'processing' ? (
          <div className="py-16 text-center">
            <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-muted-foreground" />
            <p className="mb-1 text-base font-medium text-foreground">Processing meeting...</p>
            <p className="mx-auto max-w-sm text-sm text-muted-foreground">
              AI is analyzing your recording. This usually takes a few minutes.
            </p>
          </div>
        ) : (
          <div className="py-16 text-center">
            <p className="mb-1 text-base font-medium text-foreground">No insights available</p>
            <p className="text-sm text-muted-foreground">This meeting hasn&apos;t been processed yet.</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
