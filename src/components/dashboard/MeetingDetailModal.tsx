import { useEffect, useState, useRef, useCallback } from 'react';
import { formatIST } from '@/lib/time';
import { X, Clock, Link2, Users, Copy, CheckCircle2, AlertCircle, Loader2, Mic, FileText, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {formatDistance} from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Attendee {
  name: string;
  email: string;
  isOrganizer: boolean;
  responseStatus: string;
}

const extractAttendees = (event: any): Attendee[] => {
  // Check primary location: standard Google Calendar API
  if (event.attendees && Array.isArray(event.attendees) && event.attendees.length > 0) {
    return event.attendees.map((a: any) => ({
      name: a.displayName || a.email?.split('@')[0] || 'Unknown',
      email: a.email || '',
      isOrganizer: a.organizer || false,
      responseStatus: a.responseStatus || 'needsAction',
    }));
  }

  // Fallback: check if stored as JSON string (from DB)
  if (typeof event.attendees === 'string' && event.attendees.length > 0) {
    try {
      const parsed = JSON.parse(event.attendees);
      if (Array.isArray(parsed)) {
        return parsed.map((a: any) => ({
          name: a.displayName || a.email?.split('@')[0] || 'Unknown',
          email: a.email || '',
          isOrganizer: a.organizer || false,
          responseStatus: a.responseStatus || 'needsAction',
        }));
      }
    } catch (e) {
      console.log('[extractAttendees] Failed to parse attendees string:', e);
    }
  }

  return [];
};

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

interface MeetingDetailModalProps {
  event: CalendarEvent | null;
  onClose: () => void;
  onRecordWithBot: (event: CalendarEvent) => Promise<{ meeting_id: string }>;
}

// Map DB meeting status to display info
type BotDisplayStatus = 'idle' | 'sending' | 'joining' | 'in_call' | 'recording' | 'processing' | 'completed' | 'failed';

const BOT_STATUS_DISPLAY: Record<BotDisplayStatus, { label: string; color: string; icon: 'loader' | 'check' | 'mic' | 'file' | 'done' | 'error' | null }> = {
  idle: { label: '', color: '', icon: null },
  sending: { label: 'Sending bot...', color: 'var(--warn)', icon: 'loader' },
  joining: { label: 'Bot is joining the meeting...', color: 'var(--warn)', icon: 'loader' },
  in_call: { label: 'Bot is in the meeting', color: 'var(--ok)', icon: 'check' },
  recording: { label: 'Recording in progress', color: 'var(--ok)', icon: 'mic' },
  processing: { label: 'Processing recording...', color: 'var(--warn)', icon: 'file' },
  completed: { label: 'Recording complete', color: 'var(--ok)', icon: 'done' },
  failed: { label: 'Recording failed', color: 'var(--stop)', icon: 'error' },
};

function mapDbStatusToDisplay(dbStatus: string): BotDisplayStatus {
  switch (dbStatus) {
    case 'recording': return 'recording';
    case 'joining': return 'joining';
    case 'in_call': return 'in_call';
    case 'processing': return 'processing';
    case 'completed': return 'completed';
    case 'failed': return 'failed';
    case 'cancelled': return 'failed';
    default: return 'joining';
  }
}

export function MeetingDetailModal({ event, onClose, onRecordWithBot }: MeetingDetailModalProps) {
  const { toast } = useToast();
  const [botStatus, setBotStatus] = useState<BotDisplayStatus>('idle');
  const [botError, setBotError] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // Check if a bot meeting already exists for this calendar event
  const eventId = event?.id;
  useEffect(() => {
    if (!eventId) return;
    setBotStatus('idle');
    setBotError('');
    setMeetingId(null);
    stopPolling();

    const checkExisting = async () => {
      const { data } = await supabase
        .from('meetings')
        .select('id, status')
        .eq('calendar_event_id', eventId)
        .not('recall_bot_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        setMeetingId(data.id);
        setBotStatus(mapDbStatusToDisplay(data.status));
      }
    };
    checkExisting();
  }, [eventId, stopPolling]);

  // Poll meeting status via the check-recall-status edge function
  // Uses exponential backoff (10s → 20s → 40s → 60s cap) to avoid
  // hammering the backend and depleting Disk IO budget.
  useEffect(() => {
    if (!meetingId) return;
    const isTerminal = botStatus === 'completed' || botStatus === 'failed' || botStatus === 'idle';
    if (isTerminal) {
      stopPolling();
      return;
    }

    let delay = 10_000; // start at 10s
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const { data: session } = await supabase.auth.getSession();
        const token = session?.session?.access_token;
        if (!token) return;

        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-recall-status`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ meeting_id: meetingId }),
          }
        );

        if (!res.ok) return;
        const result = await res.json();
        if (result.status) {
          setBotStatus(mapDbStatusToDisplay(result.status));
        }
        if (result.error) {
          setBotError(result.error);
        }
      } catch {
        // Silently ignore polling errors
      }

      if (!cancelled) {
        delay = Math.min(delay * 2, 60_000); // exponential backoff, cap at 60s
        pollingRef.current = setTimeout(poll, delay);
      }
    };

    // Poll immediately, then with backoff
    poll();
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [meetingId, botStatus, stopPolling]);

  // Cleanup on unmount
  useEffect(() => stopPolling, [stopPolling]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  if (!event) return null;

  const startDate = new Date(event.start_time);
  const endDate = new Date(event.end_time);
  const now = new Date();
  const durationMin = Math.round((endDate.getTime() - startDate.getTime()) / 60000);

  // Timing indicator
  const timingStatus = (() => {
    if (startDate <= now && endDate >= now) return { label: 'Happening now', color: 'var(--ok)', icon: '●' };
    if (startDate > now && startDate.getTime() - now.getTime() < 30 * 60 * 1000) return { label: 'Starting soon', color: 'var(--warn)', icon: '⚡' };
    if (startDate > now) return { label: `In ${formatDistance(now, startDate)}`, color: 'var(--ink-soft)', icon: '⏱' };
    return { label: 'Ended', color: 'var(--ink-soft)', icon: '✓' };
  })();

  // Platform detection
  const getPlatform = () => {
    if (!event.meetingUrl) return null;
    if (event.meetingUrl.includes('meet.google.com')) return 'Google Meet';
    if (event.meetingUrl.includes('zoom.us')) return 'Zoom';
    if (event.meetingUrl.includes('teams.microsoft.com')) return 'Teams';
    if (event.meetingUrl.includes('webex.com')) return 'WebEx';
    return 'Meeting';
  };

  const handleCopyUrl = () => {
    if (event.meetingUrl) {
      navigator.clipboard.writeText(event.meetingUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSendBot = async () => {
    if (!event.hasMeetingLink || !event.meetingUrl) return;
    setBotStatus('sending');
    setBotError('');
    try {
      const result = await onRecordWithBot(event);
      setMeetingId(result.meeting_id);
      setBotStatus('joining');
    } catch (err: any) {
      console.error('[SendBot] Error:', err);
      const errorMsg = err?.message || JSON.stringify(err) || 'Unknown error';
      setBotError(errorMsg);
      setBotStatus('failed');
      toast({
        title: 'Error',
        description: errorMsg,
        variant: 'destructive',
      });
    }
  };

  const truncateUrl = (url: string, max: number = 45) => {
    return url.length > max ? url.substring(0, max) + '...' : url;
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-4 dark:bg-black/60"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="relative max-h-[85dvh] w-full max-w-[480px] overflow-y-auto overscroll-contain rounded-[20px] border border-border bg-card p-5 text-card-foreground shadow-2xl animate-in fade-in-0 zoom-in-95 sm:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gradient bar */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: 'linear-gradient(135deg, var(--ember), var(--gold))',
            borderRadius: '20px 20px 0 0',
          }}
        />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h2 className="text-foreground" style={{ fontSize: 20, fontWeight: 600, margin: '0 0 8px 0', fontFamily: 'var(--font-display)' }}>
              {event.title}
            </h2>
            {getPlatform() && (
              <span className="inline-block rounded-md bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                {getPlatform()}
              </span>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="surface-hover -mr-2 -mt-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground md:h-8 md:w-8">
            <X size={20} />
          </button>
        </div>

        {/* Time & Duration */}
        <div style={{ marginBottom: 20 }}>
          <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Time</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <Clock size={15} className="mt-0.5 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-[14px] text-muted-foreground" style={{ margin: 0, fontFamily: 'var(--font-body)' }}>
                {formatIST(startDate, 'EEEE, MMMM d · h:mm a')} – {formatIST(endDate, 'h:mm a')} ({durationMin} min)
              </p>
              <p style={{ fontSize: 12, color: timingStatus.color, margin: '8px 0 0 0', fontFamily: 'var(--font-body)' }}>
                {timingStatus.icon} {timingStatus.label}
              </p>
            </div>
          </div>
        </div>

        {/* Meeting Link */}
        <div style={{ marginBottom: 20 }}>
          <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Meeting Link</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Link2 size={15} className="shrink-0 text-muted-foreground" />
            {event.hasMeetingLink && event.meetingUrl ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                <a
                  href={event.meetingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cursor-pointer text-[13px] text-ember-deep no-underline dark:text-ember-light"
                >
                  {truncateUrl(event.meetingUrl)}
                </a>
                <button
                  onClick={handleCopyUrl}
                  className="cursor-pointer border-0 bg-transparent p-0 text-muted-foreground"
                >
                  {copied ? <CheckCircle2 size={14} style={{ color: 'var(--ok)' }} /> : <Copy size={14} />}
                </button>
              </div>
            ) : (
              <p className="m-0 text-[13px] italic text-muted-foreground">No meeting link found</p>
            )}
          </div>
        </div>

        {/* Attendees */}
        <div style={{ marginBottom: 28 }}>
          <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Attendees</div>
          {(() => {
            const attendees = extractAttendees(event);
            return attendees.length > 0 ? (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {attendees.slice(0, 6).map((attendee, idx) => {
                  const initials = attendee.name
                    .split(' ')
                    .map(n => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2);
                  
                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 12px',
                        background: 'rgba(59,130,246,0.08)',
                        borderRadius: 100,
                      }}
                    >
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, var(--ember), var(--gold))',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontSize: 10,
                          fontWeight: 'bold',
                          flexShrink: 0,
                        }}
                      >
                        {initials}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <p className="text-[12px] font-medium text-foreground" style={{ margin: 0, fontFamily: 'var(--font-body)' }}>
                          {attendee.name}
                        </p>
                        {attendee.isOrganizer && (
                          <p style={{ fontSize: 10, color: 'var(--warn)', margin: 0, fontFamily: 'var(--font-body)' }}>
                            Organizer
                          </p>
                        )}
                        {!attendee.isOrganizer && attendee.responseStatus && (
                          <p style={{ fontSize: 10, color: 'var(--ink-soft)', margin: 0, fontFamily: 'var(--font-body)' }}>
                            {attendee.responseStatus === 'accepted' ? '✓ Accepted' : attendee.responseStatus === 'declined' ? '✗ Declined' : 'Awaiting response'}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
                {attendees.length > 6 && (
                  <div className="flex items-center rounded-full bg-secondary px-3 py-1.5 text-xs text-muted-foreground">
                    +{attendees.length - 6} more
                  </div>
                )}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: 0, fontStyle: 'italic' }}>
                No attendee info available
              </p>
            );
          })()}
        </div>

        {/* Divider */}
        <div className="mb-6 h-px bg-border" />

        {/* Recording Options */}
        <div>
          <div className="mb-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Record This Meeting</div>

          {/* Bot Option */}
          <div
            className="cursor-pointer rounded-xl border border-ember/25 bg-ember/[0.06] p-4 dark:bg-ember/[0.08]"
            style={{
              cursor: event.hasMeetingLink ? 'pointer' : 'not-allowed',
              opacity: event.hasMeetingLink ? 1 : 0.4,
            }}
          >
            <p className="text-[13px] font-semibold text-foreground" style={{ margin: '0 0 6px 0' }}>
              🤖 Send Bot to Join
            </p>
            <p className="mb-3 text-[12px] leading-snug text-muted-foreground" style={{ margin: '0 0 12px 0' }}>
              EchoBrief's bot will join the meeting automatically and record it for you.
            </p>

            {botStatus === 'idle' && (
              <Button
                onClick={handleSendBot}
                disabled={!event.hasMeetingLink}
                style={{
                  background: event.hasMeetingLink ? 'linear-gradient(135deg, var(--ember), var(--gold))' : 'var(--paper-deep)',
                  color: 'white',
                  fontSize: 12,
                  padding: '8px 12px',
                  border: 'none',
                  cursor: event.hasMeetingLink ? 'pointer' : 'not-allowed',
                }}
              >
                Send Bot →
              </Button>
            )}

            {(botStatus === 'sending' || botStatus === 'joining') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--warn)', fontSize: 12 }}>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                {BOT_STATUS_DISPLAY[botStatus].label}
              </div>
            )}

            {botStatus === 'in_call' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ok)', fontSize: 12 }}>
                <CheckCircle2 size={14} />
                <span>{BOT_STATUS_DISPLAY[botStatus].label}</span>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ok)', animation: 'pulse 2s infinite' }} />
              </div>
            )}

            {botStatus === 'recording' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ok)', fontSize: 12 }}>
                <Mic size={14} />
                <span>{BOT_STATUS_DISPLAY[botStatus].label}</span>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--stop)', animation: 'pulse 1s infinite' }} />
              </div>
            )}

            {botStatus === 'processing' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--warn)', fontSize: 12 }}>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                <span>{BOT_STATUS_DISPLAY[botStatus].label}</span>
              </div>
            )}

            {botStatus === 'completed' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ok)', fontSize: 12 }}>
                <CheckCircle2 size={14} />
                <span>{BOT_STATUS_DISPLAY[botStatus].label}</span>
              </div>
            )}

            {botStatus === 'failed' && (
              <div style={{ color: 'var(--stop)', fontSize: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertCircle size={14} />
                  {BOT_STATUS_DISPLAY[botStatus].label}
                </div>
                {botError && (
                  <div className="mt-1.5 break-words font-mono text-[11px] text-muted-foreground">
                    {botError}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <style>{`
          @keyframes modalEntrance {
            from {
              opacity: 0;
              transform: scale(0.95);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}
