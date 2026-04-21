import { motion } from 'framer-motion';

type Line = {
  time: string;
  initials: string;
  name: string;
  text: string;
  accent?: 'ember' | 'gold' | 'neutral';
};

const lines: Line[] = [
  {
    time: '01:24',
    initials: 'PK',
    name: 'PRIYA K.',
    text: 'हम इस quarter में तीन priorities पर focus करेंगे. Sarvam pipeline पहले, फिर Slack rollout.',
    accent: 'ember',
  },
  {
    time: '01:52',
    initials: 'RS',
    name: 'RAHUL S.',
    text: "Agreed. I'll own the integration checklist by Friday.",
    accent: 'gold',
  },
];

const accentStyles = {
  ember: {
    av: { background: 'color-mix(in oklch, var(--ember) 14%, transparent)', color: 'var(--ember)' },
    name: 'var(--ember)',
  },
  gold: {
    av: { background: 'color-mix(in oklch, var(--gold) 22%, transparent)', color: '#A77A00' },
    name: '#A77A00',
  },
  neutral: {
    av: { background: 'var(--paper-raised)', color: 'var(--ink-mid)' },
    name: 'var(--ink-mid)',
  },
} as const;

export function HeroShowcase() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.25 }}
      className="relative mx-auto w-full max-w-[480px] lg:mx-0"
      style={{ fontFamily: 'var(--font-brand-body)' }}
    >
      {/* Warm glow orbs around the mockup */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 -top-10 h-56 w-56 rounded-full blur-[60px]"
        style={{ background: 'color-mix(in oklch, var(--ember) 12%, transparent)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-10 -right-10 h-48 w-48 rounded-full blur-[60px]"
        style={{ background: 'color-mix(in oklch, var(--gold) 12%, transparent)' }}
      />

      <div
        className="relative overflow-hidden rounded-[22px]"
        style={{
          background: 'var(--paper-card)',
          border: '1px solid var(--rule)',
          boxShadow: '0 20px 60px color-mix(in oklch, var(--ink) 12%, transparent), 0 0 0 1px color-mix(in oklch, var(--ink) 5%, transparent)',
        }}
      >
        {/* Brand signature stripe — 2px ember→gold bar */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-[3px]"
          style={{ background: 'linear-gradient(90deg, var(--ember), var(--gold))' }}
        />

        {/* Topbar */}
        <div
          className="flex items-center justify-between gap-3 px-5 py-4"
          style={{ borderBottom: '1px solid var(--rule-soft)' }}
        >
          <div className="min-w-0">
            <p
              className="text-[9px] font-semibold uppercase"
              style={{
                fontFamily: 'var(--font-brand-mono)',
                color: 'var(--ink-soft)',
                letterSpacing: '0.22em',
              }}
            >
              Sales Team · Q3 Sync
            </p>
            <p
              className="mt-1 truncate text-[16px] leading-tight"
              style={{ fontFamily: 'var(--font-brand-serif)', color: 'var(--ink)', letterSpacing: '-0.01em' }}
            >
              Q3 Strategy Review
            </p>
          </div>
          <span className="rec-pill">
            <span className="rec-dot" />
            Live
          </span>
        </div>

        {/* Language chips */}
        <div className="flex flex-wrap gap-1.5 px-5 pt-4">
          {['हिंदी', 'English', 'தமிழ்'].map((l) => (
            <span
              key={l}
              className="inline-flex items-center rounded-[7px] px-2.5 py-1 text-[11px] font-semibold"
              style={{
                color: 'var(--ember)',
                background: 'color-mix(in oklch, var(--ember) 8%, transparent)',
                border: '1px solid color-mix(in oklch, var(--ember) 22%, transparent)',
              }}
            >
              {l}
            </span>
          ))}
          <span
            className="inline-flex items-center rounded-[7px] px-2.5 py-1 text-[10px]"
            style={{
              fontFamily: 'var(--font-brand-mono)',
              color: 'var(--ink-soft)',
              background: 'color-mix(in oklch, var(--ink) 4%, transparent)',
              border: '1px solid var(--rule)',
              letterSpacing: '0.1em',
            }}
          >
            +19 more
          </span>
        </div>

        {/* Transcript */}
        <div className="space-y-0 px-5 pb-2 pt-3">
          {lines.map((line, i) => {
            const a = accentStyles[line.accent ?? 'neutral'];
            return (
              <div
                key={i}
                className="flex gap-3 py-3"
                style={{
                  borderBottom: i === lines.length - 1 ? 'none' : '1px solid var(--rule-soft)',
                }}
              >
                <span
                  className="shrink-0 pt-0.5 text-[9px]"
                  style={{ fontFamily: 'var(--font-brand-mono)', color: 'var(--ink-soft)', letterSpacing: '0.06em' }}
                >
                  {line.time}
                </span>
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                  style={a.av}
                >
                  {line.initials}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className="text-[10px] font-bold"
                    style={{
                      fontFamily: 'var(--font-brand-mono)',
                      color: a.name,
                      letterSpacing: '0.14em',
                    }}
                  >
                    {line.name}
                  </p>
                  <p
                    className="mt-1 text-[13px] leading-[1.55]"
                    style={{ color: 'var(--ink-mid)' }}
                  >
                    {line.text}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Mini stats */}
        <div
          className="grid grid-cols-3 gap-2 border-t px-5 py-4"
          style={{ borderColor: 'var(--rule-soft)' }}
        >
          {[
            { label: 'Duration', value: '34:12', hi: false },
            { label: 'Speakers', value: '6', hi: false },
            { label: 'Actions', value: '3', hi: true },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-[12px] px-3 py-2.5 text-center"
              style={{
                background: s.hi ? 'color-mix(in oklch, var(--ember) 8%, transparent)' : 'color-mix(in oklch, var(--ink) 3%, transparent)',
                border: `1px solid ${s.hi ? 'color-mix(in oklch, var(--ember) 22%, transparent)' : 'var(--rule-soft)'}`,
              }}
            >
              <div
                className="text-[8px] font-semibold uppercase"
                style={{
                  fontFamily: 'var(--font-brand-mono)',
                  color: s.hi ? 'var(--ember)' : 'var(--ink-soft)',
                  letterSpacing: '0.22em',
                }}
              >
                {s.label}
              </div>
              <div
                className="mt-1 leading-none"
                style={{
                  fontFamily: 'var(--font-brand-serif)',
                  fontSize: '20px',
                  color: s.hi ? 'var(--ember)' : 'var(--ink)',
                  letterSpacing: '-0.01em',
                }}
              >
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* Waveform footer */}
        <div
          className="flex items-center justify-between gap-3 px-5 py-4"
          style={{
            borderTop: '1px solid var(--rule-soft)',
            background: 'var(--paper-raised)',
          }}
        >
          <span
            className="text-[9px] font-semibold uppercase"
            style={{
              fontFamily: 'var(--font-brand-mono)',
              color: 'var(--ink-soft)',
              letterSpacing: '0.2em',
            }}
          >
            Recording · 00:34:12
          </span>
          <div className="waveform">
            {Array.from({ length: 12 }).map((_, i) => (
              <span key={i} className="wv" />
            ))}
          </div>
        </div>
      </div>

      <p
        className="mt-4 text-center text-[10px] lg:text-left"
        style={{
          fontFamily: 'var(--font-brand-mono)',
          color: 'var(--ink-soft)',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
        }}
      >
        Illustrative · Your dashboard shows real transcripts
      </p>
    </motion.div>
  );
}
