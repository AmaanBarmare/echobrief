import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { MeetingMetrics as MeetingMetricsData, SpeakerStat } from '@/types/meeting';

export type { MeetingMetricsData, SpeakerStat };

interface MeetingMetricsProps {
  metrics: MeetingMetricsData;
}

/** Historical rows wrote duration_seconds; computed rows write seconds. */
const speakerSeconds = (s: SpeakerStat) => s.seconds ?? s.duration_seconds ?? 0;

const clock = (seconds: number) => {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * One metric, one box. A dense list of numbers is unreadable at a glance, so
 * each value gets its own tile with a quiet label above and its unit below.
 */
function MetricTile({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p
        className="mt-1 text-2xl font-semibold leading-tight text-foreground"
        style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}
      >
        {value}
      </p>
      {caption && <p className="mt-0.5 text-xs text-muted-foreground">{caption}</p>}
    </div>
  );
}

export function MeetingMetrics({ metrics }: MeetingMetricsProps) {
  const tiles: { label: string; value: string; caption?: string }[] = [];

  if (typeof metrics.total_speaking_seconds === 'number') {
    tiles.push({
      label: 'Talk time',
      value: clock(metrics.total_speaking_seconds),
      caption: typeof metrics.total_words === 'number' ? `${metrics.total_words} words` : undefined,
    });
  }
  if (
    metrics.dominant_speaker &&
    typeof metrics.dominant_speaker_share === 'number' &&
    (metrics.speaker_participation?.length ?? 0) >= 2
  ) {
    tiles.push({
      label: 'Airtime',
      value: `${Math.round(metrics.dominant_speaker_share)}%`,
      caption: metrics.dominant_speaker,
    });
  }
  if (typeof metrics.questions_asked === 'number') {
    tiles.push({
      label: 'Questions',
      value: `${metrics.questions_asked}`,
      caption: 'asked in the meeting',
    });
  }
  if (typeof metrics.turns_per_minute === 'number') {
    tiles.push({
      label: 'Back-and-forth',
      value: `${metrics.turns_per_minute}`,
      caption: 'speaker turns per minute',
    });
  }
  if (typeof metrics.words_per_minute === 'number') {
    const pace =
      metrics.words_per_minute < 110 ? 'on the slow side' :
      metrics.words_per_minute > 180 ? 'on the fast side' :
      'conversational pace';
    tiles.push({ label: 'Speaking rate', value: `${metrics.words_per_minute}`, caption: `${pace} · words per minute` });
  }
  if (typeof metrics.silence_percentage === 'number') {
    tiles.push({ label: 'Silence', value: `${Math.round(metrics.silence_percentage)}%`, caption: 'of the meeting' });
  }
  if (typeof metrics.turn_count === 'number') {
    tiles.push({
      label: 'Speaker turns',
      value: `${metrics.turn_count}`,
      caption: metrics.turn_count === 1 ? 'one continuous speaker' : 'hand-offs between speakers',
    });
  }
  if (typeof metrics.longest_monologue_seconds === 'number' && metrics.longest_monologue_speaker) {
    tiles.push({
      label: 'Longest stretch',
      value: clock(metrics.longest_monologue_seconds),
      caption: `unbroken, ${metrics.longest_monologue_speaker}`,
    });
  }
  if (typeof metrics.lead_in_silence_seconds === 'number' && metrics.lead_in_silence_seconds >= 5) {
    tiles.push({ label: 'Dead air', value: clock(metrics.lead_in_silence_seconds), caption: 'before the first word' });
  }
  if (typeof metrics.participation_balance === 'number') {
    tiles.push({
      label: 'Balance',
      value: `${Math.round(metrics.participation_balance * 100)}%`,
      caption: 'how evenly time was shared',
    });
  }
  if (typeof metrics.sentiment_score === 'number') {
    tiles.push({
      label: 'Sentiment',
      value:
        metrics.sentiment_score > 0.3 ? 'Positive' : metrics.sentiment_score < -0.3 ? 'Negative' : 'Neutral',
      caption: 'tone across the discussion',
    });
  }

  const speakers = metrics.speaker_participation ?? [];
  if (tiles.length === 0 && speakers.length === 0) return null;

  return (
    <div className="space-y-4">
      {tiles.length > 0 && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span
              className="h-4 w-1 rounded-full"
              style={{ background: 'linear-gradient(180deg, var(--ember), var(--ember-hi))' }}
            />
            <h3
              className="text-[15px] font-semibold text-foreground"
              style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}
            >
              At a glance
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {tiles.map((t) => (
              <MetricTile key={t.label} {...t} />
            ))}
          </div>
        </div>
      )}

      {speakers.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-4 flex items-center gap-2">
            <span
              className="h-4 w-1 rounded-full"
              style={{ background: 'linear-gradient(180deg, var(--ember), var(--ember-hi))' }}
            />
            <h3
              className="text-[15px] font-semibold text-foreground"
              style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}
            >
              Who spoke
            </h3>
          </div>

          <div className="space-y-3.5">
            {speakers.map((s) => {
              const detail = [
                clock(speakerSeconds(s)),
                typeof s.words_per_minute === 'number' ? `${s.words_per_minute} wpm` : null,
                typeof s.questions === 'number' && s.questions > 0
                  ? `${s.questions} question${s.questions === 1 ? '' : 's'}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <div key={s.speaker}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-medium text-foreground">{s.speaker}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {detail} ·{' '}
                      <span className="font-semibold" style={{ color: 'var(--ember)' }}>
                        {Math.round(s.percentage)}%
                      </span>
                    </span>
                  </div>
                  <Progress
                    value={s.percentage}
                    className={cn('h-1.5', '[&>div]:bg-[var(--ember)]')}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
