import { useState, useEffect } from 'react';
import { X, Mic, Calendar, Clock, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { format, differenceInMinutes, parseISO, addMinutes } from 'date-fns';
import { cn } from '@/lib/utils';

interface UpcomingMeeting {
  id: string;
  title: string;
  start: string;
  end: string;
  meetingLink: string | null;
  attendees?: { email: string; displayName?: string }[];
}

interface PreMeetingNotificationProps {
  notetakerName?: string;
  notificationMinutes?: number;
}

export function PreMeetingNotification({ 
  notetakerName = 'Notetaker',
  notificationMinutes = 5 
}: PreMeetingNotificationProps) {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const [upcomingMeeting, setUpcomingMeeting] = useState<UpcomingMeeting | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [minutesUntilMeeting, setMinutesUntilMeeting] = useState<number>(0);

  useEffect(() => {
    if (!user || !session?.access_token) return;

    const checkUpcomingMeetings = async () => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-google-calendar`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        const data = await response.json();
        
        if (data.events && Array.isArray(data.events)) {
          const now = new Date();
          const notificationWindow = addMinutes(now, notificationMinutes);
          
          // Find meetings starting within notification window
          const upcoming = data.events.find((event: UpcomingMeeting) => {
            const startTime = parseISO(event.start);
            const minutesUntil = differenceInMinutes(startTime, now);
            return minutesUntil > 0 && minutesUntil <= notificationMinutes && !dismissed.has(event.id);
          });

          if (upcoming) {
            const startTime = parseISO(upcoming.start);
            setMinutesUntilMeeting(differenceInMinutes(startTime, now));
            setUpcomingMeeting(upcoming);
          } else {
            setUpcomingMeeting(null);
          }
        }
      } catch (error) {
        console.error('Error checking upcoming meetings:', error);
      }
    };

    // Check immediately
    checkUpcomingMeetings();
    
    // Check every minute
    const interval = setInterval(checkUpcomingMeetings, 60000);
    
    return () => clearInterval(interval);
  }, [user, session, dismissed, notificationMinutes]);

  // Update countdown every minute
  useEffect(() => {
    if (!upcomingMeeting) return;
    
    const interval = setInterval(() => {
      const startTime = parseISO(upcomingMeeting.start);
      const now = new Date();
      const minutes = differenceInMinutes(startTime, now);
      
      if (minutes <= 0) {
        setUpcomingMeeting(null);
      } else {
        setMinutesUntilMeeting(minutes);
      }
    }, 30000);
    
    return () => clearInterval(interval);
  }, [upcomingMeeting]);

  const handleDismiss = () => {
    if (upcomingMeeting) {
      setDismissed(prev => new Set(prev).add(upcomingMeeting.id));
      setUpcomingMeeting(null);
    }
  };

  const handleRecordMeeting = () => {
    if (!upcomingMeeting) return;
    
    navigate('/dashboard', {
      state: {
        prefillMeeting: {
          title: upcomingMeeting.title,
          calendarEventId: upcomingMeeting.id,
          meetingLink: upcomingMeeting.meetingLink,
          attendees: upcomingMeeting.attendees || [],
        }
      }
    });
    handleDismiss();
  };

  if (!upcomingMeeting) return null;

  return (
    <div className="fixed top-4 right-4 z-50 animate-in">
      <div className="bg-card border border-accent/30 rounded-lg shadow-lg p-4 max-w-sm">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 text-accent">
            <Calendar className="w-4 h-4" />
            <span className="text-xs font-medium uppercase tracking-wide">Upcoming Meeting</span>
          </div>
          <button 
            onClick={handleDismiss}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Meeting Info */}
        <h3 className="font-semibold text-foreground mb-2 line-clamp-2">
          {upcomingMeeting.title}
        </h3>
        
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
          <Clock className="w-3.5 h-3.5" />
          <span>
            Starts in <strong className="text-foreground">{minutesUntilMeeting} min</strong>
          </span>
        </div>

        {/* Notetaker message */}
        <p className="text-sm text-muted-foreground mb-4 p-2 bg-accent/5 rounded-md">
          <strong className="text-accent">{notetakerName}</strong> will automatically join and record this meeting.
        </p>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button 
            variant="accent" 
            size="sm" 
            className="flex-1 gap-2"
            onClick={handleRecordMeeting}
          >
            <Mic className="w-4 h-4" />
            Record Now
          </Button>
          {upcomingMeeting.meetingLink && (
            <Button 
              variant="outline" 
              size="sm"
              asChild
            >
              <a href={upcomingMeeting.meetingLink} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4" />
              </a>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
