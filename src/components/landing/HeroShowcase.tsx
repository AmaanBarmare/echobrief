import { motion } from 'framer-motion';
import { Bot, Sparkles } from 'lucide-react';

const lines = [
  { speaker: 'Priya', text: 'Let’s lock Q3 scope: Sarvam pipeline first, then Slack rollout.', tone: 'text-foreground' },
  { speaker: 'Rahul', text: 'Agreed. I’ll own the integration checklist by Friday.', tone: 'text-muted-foreground' },
  { speaker: 'EchoBrief', text: '3 action items · 1 risk flagged · summary ready for WhatsApp.', tone: 'text-orange-600 dark:text-orange-400' },
];

export function HeroShowcase() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 32, rotate: -1 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1], delay: 0.35 }}
      className="relative mx-auto w-full max-w-[440px] lg:mx-0"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -left-8 -top-10 h-40 w-40 rounded-full bg-orange-500/20 blur-3xl dark:bg-orange-500/25"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-6 -right-6 h-32 w-32 rounded-full bg-amber-500/15 blur-2xl"
      />

      <div className="landing-float-slow relative overflow-hidden rounded-[22px] border border-border/90 bg-card/90 shadow-2xl shadow-orange-950/10 ring-1 ring-orange-500/10 backdrop-blur-md dark:bg-card/80 dark:shadow-black/40">
        <div className="flex items-center justify-between border-b border-border/80 bg-secondary/40 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/30">
              <Bot className="h-4 w-4" strokeWidth={2} />
            </span>
            <div>
              <p className="text-[13px] font-semibold leading-tight text-foreground" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Product sync · EchoBrief
              </p>
              <p className="text-[11px] text-muted-foreground">Processing · Insights ready</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-orange-500/25 bg-orange-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-orange-700 dark:text-orange-300">
            <Sparkles className="h-3 w-3" />
            Live
          </span>
        </div>

        <div className="landing-shimmer space-y-3 p-4">
          {lines.map((line, i) => (
            <div key={i} className="rounded-xl border border-border/60 bg-background/50 px-3 py-2.5 dark:bg-background/30">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{line.speaker}</p>
              <p className={`mt-1 text-[13px] leading-snug ${line.tone}`} style={{ fontFamily: "'DM Sans', sans-serif" }}>
                {line.text}
              </p>
            </div>
          ))}
        </div>

        <div className="border-t border-border/80 bg-gradient-to-r from-orange-500/[0.07] via-transparent to-amber-500/[0.07] px-4 py-3">
          <div className="flex h-9 items-end justify-between gap-0.5">
            {Array.from({ length: 28 }).map((_, i) => (
              <span
                key={i}
                className="w-1 rounded-sm bg-gradient-to-t from-orange-600/30 to-amber-400/80 dark:from-orange-400/40 dark:to-amber-300/90"
                style={{ height: `${12 + ((i * 17) % 24)}px` }}
              />
            ))}
          </div>
        </div>
      </div>

      <p className="mt-4 text-center text-[11px] text-muted-foreground lg:text-left">
        Illustrative preview: your dashboard shows real transcripts and insights.
      </p>
    </motion.div>
  );
}
