import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription 
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mic, Square, Pause, Play, Loader2 } from 'lucide-react';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface RecordingButtonProps {
  onRecordingComplete?: (meetingId: string) => void;
  prefillTitle?: string;
  calendarEventId?: string;
  meetingLink?: string;
}

export function RecordingButton({ 
  onRecordingComplete, 
  prefillTitle, 
  calendarEventId, 
  meetingLink 
}: RecordingButtonProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState(prefillTitle || '');
  const [currentMeetingId, setCurrentMeetingId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const {
    isRecording,
    isPaused,
    duration,
    audioLevel,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    error,
    permissionStatus,
  } = useAudioRecorder();

  // Auto-open dialog if prefillTitle is provided
  useEffect(() => {
    if (prefillTitle && !isRecording) {
      setMeetingTitle(prefillTitle);
      setShowDialog(true);
    }
  }, [prefillTitle, isRecording]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartRecording = async () => {
    if (!user) return;
    
    setIsStarting(true);
    
    try {
      const { data: meeting, error: meetingError } = await supabase
        .from('meetings')
        .insert({
          user_id: user.id,
          title: meetingTitle || `Meeting ${new Date().toLocaleDateString()}`,
          source: calendarEventId ? 'calendar' : 'manual',
          calendar_event_id: calendarEventId || null,
          meeting_link: meetingLink || null,
          status: 'recording',
          start_time: new Date().toISOString(),
        })
        .select()
        .single();

      if (meetingError) throw meetingError;

      setCurrentMeetingId(meeting.id);
      await startRecording(meeting.id);
      setShowDialog(false);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to start recording',
        variant: 'destructive',
      });
    } finally {
      setIsStarting(false);
    }
  };

  const handleStopRecording = async () => {
    await stopRecording();
    
    if (currentMeetingId) {
      toast({
        title: 'Recording saved',
        description: 'Your meeting is being processed...',
      });
      
      try {
        await supabase.functions.invoke('process-meeting', {
          body: { meetingId: currentMeetingId }
        });
      } catch (err) {
        console.error('Processing error:', err);
      }
      
      onRecordingComplete?.(currentMeetingId);
    }
    
    setCurrentMeetingId(null);
    setMeetingTitle('');
  };

  if (isRecording) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <div className="bg-card rounded-lg shadow-lg border border-border p-4 min-w-[260px]">
          {/* Recording indicator */}
          <div className="flex items-center gap-3 mb-3">
            <div className="status-dot recording" />
            <span className="text-sm font-medium text-foreground">Recording</span>
            <span className="ml-auto font-mono text-base font-semibold text-foreground">
              {formatDuration(duration)}
            </span>
          </div>

          {/* Audio level visualization */}
          <div className="flex items-end justify-center gap-0.5 h-6 mb-3">
            {[...Array(16)].map((_, i) => (
              <div
                key={i}
                className={cn(
                  'w-1 rounded-full transition-all duration-75',
                  audioLevel * 16 > i ? 'bg-recording' : 'bg-muted'
                )}
                style={{
                  height: `${Math.max(4, Math.random() * audioLevel * 100)}%`,
                }}
              />
            ))}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={isPaused ? resumeRecording : pauseRecording}
            >
              {isPaused ? (
                <Play className="w-4 h-4" />
              ) : (
                <Pause className="w-4 h-4" />
              )}
            </Button>
            <Button
              variant="recording"
              size="lg"
              onClick={handleStopRecording}
            >
              <Square className="w-4 h-4 mr-2" />
              Stop
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Button
        variant="recording"
        onClick={() => setShowDialog(true)}
        className="gap-2"
      >
        <Mic className="w-4 h-4" />
        Record
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start New Recording</DialogTitle>
            <DialogDescription>
              Give your meeting a name and we'll start capturing audio.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="meeting-title">Meeting Title</Label>
              <Input
                id="meeting-title"
                placeholder="Weekly standup, Client call..."
                value={meetingTitle}
                onChange={(e) => setMeetingTitle(e.target.value)}
              />
            </div>

            {permissionStatus === 'denied' && (
              <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                Microphone access is required. Please enable it in your browser settings.
              </div>
            )}

            {error && (
              <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}

            <div className="bg-secondary rounded-md p-3 space-y-1">
              <h4 className="font-medium text-sm">What we'll capture:</h4>
              <ul className="text-sm text-muted-foreground space-y-0.5">
                <li>• Microphone audio (your voice)</li>
                <li>• System audio (meeting participants)*</li>
              </ul>
              <p className="text-xs text-muted-foreground mt-2">
                *System audio requires screen sharing permission.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant="recording" 
              onClick={handleStartRecording}
              disabled={isStarting}
            >
              {isStarting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Mic className="w-4 h-4 mr-2" />
              )}
              Start Recording
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
