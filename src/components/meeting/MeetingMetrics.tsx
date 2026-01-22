import { Progress } from '@/components/ui/progress';
import { Users, Smile, Frown, Meh, TrendingUp, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MeetingMetricsData {
  engagement_score?: number; // 0-100
  sentiment_score?: number; // -1 to 1
  speaker_participation?: { speaker: string; percentage: number; duration_seconds: number }[];
  total_duration_seconds?: number;
  speaking_time_seconds?: number;
  silence_percentage?: number;
}

interface MeetingMetricsProps {
  metrics: MeetingMetricsData;
}

export function MeetingMetrics({ metrics }: MeetingMetricsProps) {
  const getSentimentIcon = () => {
    if (!metrics.sentiment_score) return <Meh className="w-5 h-5 text-muted-foreground" />;
    if (metrics.sentiment_score > 0.3) return <Smile className="w-5 h-5 text-success" />;
    if (metrics.sentiment_score < -0.3) return <Frown className="w-5 h-5 text-destructive" />;
    return <Meh className="w-5 h-5 text-warning" />;
  };

  const getSentimentLabel = () => {
    if (!metrics.sentiment_score) return 'Neutral';
    if (metrics.sentiment_score > 0.3) return 'Positive';
    if (metrics.sentiment_score < -0.3) return 'Negative';
    return 'Neutral';
  };

  const getEngagementColor = (score: number) => {
    if (score >= 70) return 'bg-success';
    if (score >= 40) return 'bg-warning';
    return 'bg-destructive';
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Generate colors for speakers
  const speakerColors = ['bg-accent', 'bg-success', 'bg-warning', 'bg-primary', 'bg-destructive'];

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-3 gap-4">
        {/* Engagement Score */}
        <div className="p-4 rounded-lg bg-card border border-border">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Engagement</span>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-semibold text-foreground">
              {metrics.engagement_score ?? '--'}%
            </span>
          </div>
          {metrics.engagement_score !== undefined && (
            <Progress 
              value={metrics.engagement_score} 
              className="h-1.5 mt-2"
            />
          )}
        </div>

        {/* Sentiment */}
        <div className="p-4 rounded-lg bg-card border border-border">
          <div className="flex items-center gap-2 mb-2">
            {getSentimentIcon()}
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Sentiment</span>
          </div>
          <span className="text-2xl font-semibold text-foreground">
            {getSentimentLabel()}
          </span>
          {metrics.sentiment_score !== undefined && (
            <p className="text-xs text-muted-foreground mt-1">
              Score: {(metrics.sentiment_score * 100).toFixed(0)}%
            </p>
          )}
        </div>

        {/* Duration */}
        <div className="p-4 rounded-lg bg-card border border-border">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Duration</span>
          </div>
          <span className="text-2xl font-semibold text-foreground">
            {metrics.total_duration_seconds ? formatDuration(metrics.total_duration_seconds) : '--:--'}
          </span>
          {metrics.silence_percentage !== undefined && (
            <p className="text-xs text-muted-foreground mt-1">
              {Math.round(metrics.silence_percentage)}% silence
            </p>
          )}
        </div>
      </div>

      {/* Speaker Participation */}
      {metrics.speaker_participation && metrics.speaker_participation.length > 0 && (
        <div className="p-4 rounded-lg bg-card border border-border">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Speaker Participation
            </span>
          </div>

          {/* Stacked bar */}
          <div className="h-3 rounded-full overflow-hidden flex mb-4">
            {metrics.speaker_participation.map((speaker, index) => (
              <div
                key={speaker.speaker}
                className={cn(speakerColors[index % speakerColors.length], 'transition-all')}
                style={{ width: `${speaker.percentage}%` }}
              />
            ))}
          </div>

          {/* Legend */}
          <div className="grid grid-cols-2 gap-3">
            {metrics.speaker_participation.map((speaker, index) => (
              <div key={speaker.speaker} className="flex items-center gap-2">
                <div className={cn(
                  'w-3 h-3 rounded-full flex-shrink-0',
                  speakerColors[index % speakerColors.length]
                )} />
                <span className="text-sm text-foreground truncate flex-1">{speaker.speaker}</span>
                <span className="text-sm text-muted-foreground">{Math.round(speaker.percentage)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
