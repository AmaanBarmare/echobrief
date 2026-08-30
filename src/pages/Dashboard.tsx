import { useEffect, useMemo, useState } from 'react';
import { formatIST } from '@/lib/time';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { RecordingButton } from '@/components/dashboard/RecordingButton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Meeting } from '@/types/meeting';
import { ChevronDown, ChevronRight, Mic, Clock, CheckCircle2, Sparkles, Trash2, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

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
    case 'joining': return { label: 'Joining', color: 'hsl(var(--warning))', tint: 'color-mix(in oklch, hsl(var(--warning)) 14%, transparent)' };
    case 'in_call': return { label: 'In call', color: 'hsl(var(--warning))', tint: 'color-mix(in oklch, hsl(var(--warning)) 14%, transparent)' };
    case 'recording': return { label: 'Recording', color: 'var(--ember)', tint: 'color-mix(in oklch, var(--ember) 12%, transparent)' };
    case 'transcribing': return { label: 'Transcribing', color: 'hsl(var(--warning))', tint: 'color-mix(in oklch, hsl(var(--warning)) 14%, transparent)' };
    case 'processing': return { label: 'Processing', color: 'hsl(var(--warning))', tint: 'color-mix(in oklch, hsl(var(--warning)) 14%, transparent)' };
    case 'completed': return { label: 'Completed', color: 'hsl(var(--success))', tint: 'color-mix(in oklch, hsl(var(--success)) 14%, transparent)' };
    case 'failed': return { label: 'Failed', color: 'hsl(var(--destructive))', tint: 'color-mix(in oklch, hsl(var(--destructive)) 12%, transparent)' };
    case 'cancelled': return { label: 'Cancelled', color: 'hsl(var(--destructive))', tint: 'color-mix(in oklch, hsl(var(--destructive)) 12%, transparent)' };
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

// Confirm-then-delete button for clearing all meetings of one status.
function BulkDeleteButton({ status, count, deleting, onConfirm }: {
  status: 'failed' | 'cancelled';
  count: number;
  deleting: boolean;
  onConfirm: () => void;
}) {
  const label = status === 'failed' ? 'Delete all failed meetings' : 'Delete all cancelled meetings';
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          disabled={deleting}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium transition-colors disabled:opacity-60"
          style={{ border: '1px solid var(--rule)', background: 'var(--paper-card)', color: 'hsl(var(--destructive))' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in oklch, hsl(var(--destructive)) 8%, transparent)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--paper-card)'; }}
        >
          {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} strokeWidth={1.75} />}
          {label}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete all {status} meetings?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes {count} {status} meeting{count === 1 ? '' : 's'} and their data. Completed meetings are not affected. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Delete {count}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [deletingStatus, setDeletingStatus] = useState<'failed' | 'cancelled' | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const prefillMeeting = (location.state as { prefillMeeting?: PrefillMeeting })?.prefillMeeting;

  // Onboarding gate — independent of meetings, so it runs in parallel.
  const { data: profile } = useQuery({
    queryKey: ['profile-onboarding', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('user_id', user!.id)
        .maybeSingle();
      return data ?? null;
    },
  });

  useEffect(() => {
    if (profile && !profile.onboarding_completed) navigate('/onboarding');
  }, [profile, navigate]);

  const { data: meetings = [], isLoading: loading, error } = useQuery({
    queryKey: ['meetings', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .eq('user_id', user!.id)
        .order('start_time', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Meeting[];
    },
  });

  const fetchError = error ? (error instanceof Error ? error.message : 'Could not load meetings') : null;

  const meetingIds = meetings.map((m) => m.id);
  const { data: insightCounts = {} } = useQuery({
    queryKey: ['meeting-insight-flags', user?.id, meetingIds],
    enabled: !!user && meetingIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('meeting_insights')
        .select('meeting_id')
        .in('meeting_id', meetingIds);
      const counts: Record<string, boolean> = {};
      (data ?? []).forEach((i) => { counts[i.meeting_id] = true; });
      return counts;
    },
  });

  // Realtime: patch the cached meetings list in place instead of refetching.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`meetings-changes-${user.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'meetings', filter: `user_id=eq.${user.id}` },
        (payload) => {
          queryClient.setQueryData<Meeting[]>(['meetings', user.id], (prev = []) => {
            if (payload.eventType === 'INSERT') return [payload.new as Meeting, ...prev];
            if (payload.eventType === 'UPDATE') return prev.map((m) => (m.id === (payload.new as Meeting).id ? (payload.new as Meeting) : m));
            if (payload.eventType === 'DELETE') return prev.filter((m) => m.id !== (payload.old as Meeting).id);
            return prev;
          });
        })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [user, queryClient]);

  const stats = useMemo(() => {
    const totalMeetings = meetings.length;
    const totalDuration = meetings.reduce((sum, m) => sum + (m.duration_seconds || 0), 0);
    const summarized = Object.keys(insightCounts).length;
    const timeSavedMin = Math.round((totalDuration / 60) * 0.25);
    return { totalMeetings, totalDuration, summarized, timeSavedMin };
  }, [meetings, insightCounts]);

  const failedCount = useMemo(() => meetings.filter((m) => m.status === 'failed').length, [meetings]);
  const cancelledCount = useMemo(() => meetings.filter((m) => m.status === 'cancelled').length, [meetings]);

  // Rendering split: meetings with (or on their way to) content stay on top in
  // the query's start_time desc order; cancelled/failed ones collapse under a
  // muted expander at the bottom. The query itself is untouched.
  const activeMeetings = useMemo(
    () => meetings.filter((m) => m.status !== 'cancelled' && m.status !== 'failed'),
    [meetings]
  );
  const archivedMeetings = useMemo(
    () => meetings.filter((m) => m.status === 'cancelled' || m.status === 'failed'),
    [meetings]
  );

  // Bulk-delete every meeting of one status (and its child rows + audio), the
  // same cleanup the single-meeting delete does. Completed meetings are never
  // touched. Only the targeted status is offered via the UI.
  const deleteMeetingsByStatus = async (status: 'failed' | 'cancelled') => {
    if (!user) return;
    setDeletingStatus(status);
    try {
      const { data: targets, error: fetchErr } = await supabase
        .from('meetings')
        .select('id, audio_url')
        .eq('user_id', user.id)
        .eq('status', status);
      if (fetchErr) throw fetchErr;
      const ids = (targets ?? []).map((m) => m.id);
      if (ids.length === 0) {
        toast({ title: 'Nothing to delete', description: `No ${status} meetings found.` });
        return;
      }
      // Remove child rows first (mirrors the single-meeting delete).
      await supabase.from('meeting_insights').delete().in('meeting_id', ids);
      await supabase.from('transcripts').delete().in('meeting_id', ids);
      const audioPaths = (targets ?? [])
        .map((m) => m.audio_url)
        .filter((p): p is string => !!p);
      if (audioPaths.length > 0) {
        await supabase.storage.from('recordings').remove(audioPaths);
      }
      const { error: delErr } = await supabase
        .from('meetings')
        .delete()
        .eq('user_id', user.id)
        .eq('status', status);
      if (delErr) throw delErr;
      queryClient.setQueryData<Meeting[]>(['meetings', user.id], (prev = []) =>
        prev.filter((m) => m.status !== status));
      toast({ title: 'Deleted', description: `Removed ${ids.length} ${status} meeting${ids.length === 1 ? '' : 's'}.` });
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : `Could not delete ${status} meetings`,
        variant: 'destructive',
      });
    } finally {
      setDeletingStatus(null);
    }
  };

  const firstName = user?.user_metadata?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'there';

  const renderMeetingRow = (meeting: Meeting, first: boolean, muted: boolean) => {
    const s = statusConfig(meeting.status || 'scheduled');
    const hasSummary = insightCounts[meeting.id];
    const lang = (meeting as any).language;
    return (
      <Link
        key={meeting.id}
        to={`/meeting/${meeting.id}`}
        className={`group flex items-center gap-4 px-5 py-4 no-underline transition-colors md:px-6${muted ? ' opacity-60' : ''}`}
        style={{
          borderTop: first ? 'none' : '1px solid var(--rule-soft)',
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
            <span>{formatIST(new Date(meeting.start_time), 'MMM d, h:mm a')}</span>
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
  };

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
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2
            className="text-[17px] font-semibold"
            style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}
          >
            Recent meetings
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {!loading && failedCount > 0 && (
              <BulkDeleteButton
                status="failed"
                count={failedCount}
                deleting={deletingStatus === 'failed'}
                onConfirm={() => deleteMeetingsByStatus('failed')}
              />
            )}
            {!loading && cancelledCount > 0 && (
              <BulkDeleteButton
                status="cancelled"
                count={cancelledCount}
                deleting={deletingStatus === 'cancelled'}
                onConfirm={() => deleteMeetingsByStatus('cancelled')}
              />
            )}
            {!loading && meetings.length > 0 && (
              <span className="text-[13px]" style={{ color: 'var(--ink-soft)' }}>
                {meetings.length} total
              </span>
            )}
          </div>
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
            {activeMeetings.map((meeting, idx) => renderMeetingRow(meeting, idx === 0, false))}
            {archivedMeetings.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setShowArchived((v) => !v)}
                  aria-expanded={showArchived}
                  className="flex w-full items-center gap-2 px-5 py-3 text-left text-[12.5px] font-medium transition-colors md:px-6"
                  style={{
                    borderTop: activeMeetings.length === 0 ? 'none' : '1px solid var(--rule-soft)',
                    color: 'var(--ink-soft)',
                    background: 'color-mix(in oklch, var(--ink) 2%, transparent)',
                  }}
                >
                  {showArchived ? (
                    <ChevronDown size={14} strokeWidth={1.75} />
                  ) : (
                    <ChevronRight size={14} strokeWidth={1.75} />
                  )}
                  Cancelled &amp; failed ({archivedMeetings.length})
                </button>
                {showArchived && archivedMeetings.map((meeting) => renderMeetingRow(meeting, false, true))}
              </>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
