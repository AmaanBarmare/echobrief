import { Clock, MessageSquare, HelpCircle, CheckCircle, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface TimelineEntry {
  timestamp: number; // seconds from start
  type: 'topic' | 'question' | 'decision' | 'action' | 'risk';
  content: string;
  speaker?: string;
}

interface TimelineViewProps {
  entries: TimelineEntry[];
  onSeek?: (timestamp: number) => void;
}

export function TimelineView({ entries, onSeek }: TimelineViewProps) {
  const formatTimestamp = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getIcon = (type: TimelineEntry['type']) => {
    switch (type) {
      case 'topic':
        return <MessageSquare className="w-4 h-4" />;
      case 'question':
        return <HelpCircle className="w-4 h-4" />;
      case 'decision':
        return <CheckCircle className="w-4 h-4" />;
      case 'action':
        return <CheckCircle className="w-4 h-4" />;
      case 'risk':
        return <AlertTriangle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const getColor = (type: TimelineEntry['type']) => {
    switch (type) {
      case 'topic':
        return 'text-accent bg-accent/10 border-accent/20';
      case 'question':
        return 'text-warning bg-warning/10 border-warning/20';
      case 'decision':
        return 'text-success bg-success/10 border-success/20';
      case 'action':
        return 'text-primary bg-primary/10 border-primary/20';
      case 'risk':
        return 'text-destructive bg-destructive/10 border-destructive/20';
      default:
        return 'text-muted-foreground bg-muted border-border';
    }
  };

  if (entries.length === 0) {
    return (
      <div className="empty-state">
        <Clock className="empty-state-icon" />
        <p className="empty-state-title">No timeline available</p>
        <p className="empty-state-description">
          Timeline entries will appear here after AI processing.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical timeline line */}
      <div className="absolute left-[39px] top-0 bottom-0 w-px bg-border" />

      <div className="space-y-4">
        {entries.map((entry, index) => (
          <div
            key={index}
            className={cn(
              "relative flex gap-4 group",
              onSeek && "cursor-pointer hover:bg-secondary/50 -mx-3 px-3 py-2 rounded-lg"
            )}
            onClick={() => onSeek?.(entry.timestamp)}
          >
            {/* Timestamp */}
            <div className="w-12 flex-shrink-0 text-right">
              <button 
                className="font-mono text-sm text-accent hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  onSeek?.(entry.timestamp);
                }}
              >
                {formatTimestamp(entry.timestamp)}
              </button>
            </div>

            {/* Icon */}
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border z-10",
              getColor(entry.type)
            )}>
              {getIcon(entry.type)}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pt-1">
              <div className="flex items-start gap-2">
                <Badge variant="outline" className={cn("text-xs capitalize", getColor(entry.type))}>
                  {entry.type}
                </Badge>
                {entry.speaker && (
                  <span className="text-xs text-muted-foreground">
                    by {entry.speaker}
                  </span>
                )}
              </div>
              <p className="text-foreground mt-1">{entry.content}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
