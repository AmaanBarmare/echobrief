import { Progress } from '@/components/ui/progress';
import { Users, Smile, Frown, Meh, Scale, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

import type { MeetingMetrics as MeetingMetricsData, SpeakerStat } from '@/types/meeting';

export type { MeetingMetricsData, SpeakerStat };

interface MeetingMetricsProps {
  metrics: MeetingMetricsData;
}

/** Historical rows wrote duration_seconds; computed rows write seconds. */
const speakerSeconds = (s: SpeakerStat) => s.seconds ?? s.duration_seconds ?? 0;

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

  const formatDuration = (seconds: number) => {
    const total = Math.round(seconds);
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const balancePercent =
    metrics.participation_balance !== undefined
      ? Math.round(metrics.participation_balance * 100)
      : undefined;

  // Generate colors for speakers
  const speakerColors = ['bg-accent', 'bg-success', 'bg-warning', 'bg-primary', 'bg-destructive'];

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-3 gap-4">
        {/* Talk Time */}
        <div className="p-4 rounded-lg bg-card border border-border">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Talk Time</span>
          </div>
          <span className="text-2xl font-semibold text-foreground">
            {metrics.total_speaking_seconds !== undefined
              ? formatDuration(metrics.total_speaking_seconds)
              : '--:--'}
          </span>
          {metrics.silence_percentage !== undefined && (
            <p className="text-xs text-muted-foreground mt-1">
              {Math.round(metrics.silence_percentage)}% silence
            </p>
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

        {/* Participation balance */}
        <div className="p-4 rounded-lg bg-card border border-border">
          <div className="flex items-center gap-2 mb-2">
            <Scale className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Balance</span>
          </div>
          <span className="text-2xl font-semibold text-foreground">
            {balancePercent !== undefined ? `${balancePercent}%` : '--'}
          </span>
          {balancePercent !== undefined && (
            <Progress value={balancePercent} className="h-1.5 mt-2" />
          )}
          {metrics.turn_count !== undefined && (
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.turn_count} speaker {metrics.turn_count === 1 ? 'turn' : 'turns'}
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
                <span className="text-sm text-muted-foreground">
                  {formatDuration(speakerSeconds(speaker))} · {Math.round(speaker.percentage)}%
                </span>
              </div>
            ))}
          </div>

          {metrics.longest_monologue_speaker && metrics.longest_monologue_seconds !== undefined && (
            <p className="text-xs text-muted-foreground mt-4">
              Longest uninterrupted stretch: {metrics.longest_monologue_speaker} for{' '}
              {formatDuration(metrics.longest_monologue_seconds)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
