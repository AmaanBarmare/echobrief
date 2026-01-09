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
import { Mic, Loader2 } from 'lucide-react';
import { useRecording } from '@/contexts/RecordingContext';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';

interface CalendarAttendee {
  email: string;
  displayName?: string | null;
  responseStatus?: string | null;
  organizer?: boolean;
}

interface RecordingButtonProps {
  onRecordingComplete?: (meetingId: string) => void;
  prefillTitle?: string;
  calendarEventId?: string;
  meetingLink?: string;
  attendees?: CalendarAttendee[];
}

export function RecordingButton({ 
  prefillTitle, 
  calendarEventId, 
  meetingLink,
  attendees 
}: RecordingButtonProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState(prefillTitle || '');
  const [isStarting, setIsStarting] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const {
    isRecording,
    startRecording,
    error,
    permissionStatus,
  } = useRecording();

  // Auto-open dialog if prefillTitle is provided
  useEffect(() => {
    if (prefillTitle && !isRecording) {
      setMeetingTitle(prefillTitle);
      setShowDialog(true);
    }
  }, [prefillTitle, isRecording]);

  const handleStartRecording = async () => {
    if (!user) return;
    
    setIsStarting(true);
    
    try {
      const title = meetingTitle || `Meeting ${new Date().toLocaleDateString()}`;
      const meetingData = {
        user_id: user.id,
        title,
        source: calendarEventId ? 'calendar' : 'manual',
        calendar_event_id: calendarEventId || null,
        meeting_link: meetingLink || null,
        attendees: (attendees || []) as unknown as Json,
        status: 'recording',
        start_time: new Date().toISOString(),
      };
      
      const { data: meeting, error: meetingError } = await supabase
        .from('meetings')
        .insert(meetingData)
        .select()
        .single();

      if (meetingError) throw meetingError;

      await startRecording(meeting.id, title);
      setShowDialog(false);
      setMeetingTitle('');
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

  // Don't show the button if already recording
  if (isRecording) {
    return null;
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
