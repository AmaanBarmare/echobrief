import * as React from 'react';

type Tone = 'green' | 'amber' | 'red' | 'accent' | 'neutral';
const tones: Record<Tone, [string, string]> = {
  green: ['var(--eb-green)', 'var(--eb-green-bg)'],
  amber: ['var(--eb-amber)', 'var(--eb-amber-bg)'],
  red: ['var(--eb-red)', 'var(--eb-red-bg)'],
  accent: ['var(--eb-accent-text)', 'var(--eb-accent-soft)'],
  neutral: ['var(--eb-text-secondary)', 'var(--eb-chip)'],
};

/** Status badge. `dot` adds the 6px status dot (Summarized, Connected, Bot will join…). */
export function Badge({ tone = 'neutral', dot, children }: { tone?: Tone; dot?: boolean; children: React.ReactNode }) {
  const [fg, bg] = tones[tone];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, color: fg, background: bg, padding: `3px 9px 3px ${dot ? 8 : 9}px`, borderRadius: 'var(--eb-r-pill)', whiteSpace: 'nowrap' }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: fg }} />}
      {children}
    </span>
  );
}
