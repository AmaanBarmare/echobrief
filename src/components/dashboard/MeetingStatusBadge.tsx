import { Clock, Mic, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type MeetingStatus = 'scheduled' | 'upcoming' | 'recording' | 'processing' | 'completed' | 'failed';

interface MeetingStatusBadgeProps {
  status: string;
  className?: string;
  showLabel?: boolean;
}

const statusConfig: Record<MeetingStatus, { 
  icon: typeof Clock; 
  label: string; 
  dotClass: string;
  textClass: string;
}> = {
  scheduled: {
    icon: Clock,
    label: 'Scheduled',
    dotClass: 'bg-muted-foreground',
    textClass: 'text-muted-foreground',
  },
  upcoming: {
    icon: Clock,
    label: 'Upcoming',
    dotClass: 'bg-accent',
    textClass: 'text-accent',
  },
  recording: {
    icon: Mic,
    label: 'Recording',
    dotClass: 'bg-recording animate-pulse',
    textClass: 'text-recording',
  },
  processing: {
    icon: Loader2,
    label: 'Processing',
    dotClass: 'bg-warning',
    textClass: 'text-warning',
  },
  completed: {
    icon: CheckCircle,
    label: 'Completed',
    dotClass: 'bg-success',
    textClass: 'text-success',
  },
  failed: {
    icon: AlertCircle,
    label: 'Failed',
    dotClass: 'bg-destructive',
    textClass: 'text-destructive',
  },
};

export function MeetingStatusBadge({ status, className, showLabel = false }: MeetingStatusBadgeProps) {
  const config = statusConfig[status as MeetingStatus] || statusConfig.scheduled;
  const Icon = config.icon;

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <span className={cn('w-2 h-2 rounded-full', config.dotClass)} />
      {showLabel && (
        <span className={cn('text-xs font-medium', config.textClass)}>
          {config.label}
        </span>
      )}
    </div>
  );
}
