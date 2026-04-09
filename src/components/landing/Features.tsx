import { motion } from 'framer-motion';
import { useInView } from 'framer-motion';
import { useRef } from 'react';

const features = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-orange-400">
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="22" />
      </svg>
    ),
    title: 'Auto-join and record',
    description:
      "Connect your calendar. EchoBrief's bot joins Google Meet, Zoom, or Teams. No extension, no manual start.",
    color: 'bg-orange-500/10',
    kicker: 'Capture',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-purple-500">
        <path d="m5 8 6 6" />
        <path d="m4 14 6-6 2-3" />
        <path d="M2 5h12" />
        <path d="M7 2h1" />
        <path d="m22 22-5-10-5 10" />
        <path d="M14 18h6" />
      </svg>
    ),
    title: '22 Indian languages',
    description:
      'Sarvam Saaras v3: built for Hinglish, Tanglish, and native scripts. Summaries in the language you choose.',
    color: 'bg-purple-500/10',
    kicker: 'Speech',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-green-500">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="17" x2="16" y2="17" />
      </svg>
    ),
    title: 'Decision-grade insights',
    description: 'Executive summary, owners on action items, risks, timeline. Not a raw transcript wall.',
    color: 'bg-green-500/10',
    kicker: 'Intelligence',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-blue-500">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    title: 'Speaker attribution',
    description: 'Diarization matched to calendar names so “who said what” stays accurate in briefs.',
    color: 'bg-blue-500/10',
    kicker: 'People',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-orange-400">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
      </svg>
    ),
    title: 'WhatsApp delivery',
    description: 'Briefs land where your team already works, with per-language routing when you need it.',
    color: 'bg-orange-500/10',
    kicker: 'Reach',
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-green-500">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
    title: 'Data stays in India',
    description: "Processing aligned with Sarvam's Indian cloud posture. DPDP-aware handling for your org.",
    color: 'bg-emerald-500/10',
    kicker: 'Trust',
  },
];

function BentoCard({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-orange-500/25 hover:shadow-xl hover:shadow-orange-500/[0.07] dark:hover:shadow-black/30 ${className ?? ''}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 100% 0%, rgba(249,115,22,0.08), transparent 55%)',
        }}
      />
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}

export function Features() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section id="features" ref={ref} className="scroll-mt-24 border-t border-border/60 bg-background py-20 md:py-28">
      <div className="mx-auto max-w-[1200px] px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="mb-14 max-w-2xl"
        >
          <p
            className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-orange-600 dark:text-orange-400"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            Capabilities
          </p>
          <h2
            className="text-4xl font-semibold tracking-[-0.035em] text-foreground md:text-5xl"
            style={{ fontFamily: "'Outfit', sans-serif" }}
          >
            Everything after the meeting, without the homework.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            One pipeline from calendar → room → transcript → insights → your channels.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.05, duration: 0.5 }}
            className="lg:col-span-2 lg:row-span-2"
          >
            <BentoCard className="h-full min-h-[280px] justify-between p-8">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  {features[0].kicker}
                </span>
                <div className="mt-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500/10">
                  {features[0].icon}
                </div>
                <h3 className="mt-5 text-2xl font-semibold tracking-[-0.02em]" style={{ fontFamily: "'Outfit', sans-serif" }}>
                  {features[0].title}
                </h3>
                <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  {features[0].description}
                </p>
              </div>
              <div className="mt-6 h-px w-full bg-gradient-to-r from-orange-500/50 via-amber-500/30 to-transparent" />
            </BentoCard>
          </motion.div>

          {[1, 2].map((idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.08 * idx, duration: 0.5 }}
              className={idx === 1 ? 'lg:col-span-2 lg:col-start-3 lg:row-start-1' : 'lg:col-span-2 lg:col-start-3 lg:row-start-2'}
            >
              <BentoCard className="h-full">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  {features[idx].kicker}
                </span>
                <div className="mt-3 flex h-10 w-10 items-center justify-center rounded-xl bg-muted/80">{features[idx].icon}</div>
                <h3 className="mt-4 text-lg font-semibold" style={{ fontFamily: "'Outfit', sans-serif" }}>
                  {features[idx].title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  {features[idx].description}
                </p>
              </BentoCard>
            </motion.div>
          ))}

          {[3, 4].map((idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.15 + 0.05 * (idx - 3), duration: 0.5 }}
              className="lg:col-span-2"
            >
              <BentoCard className="h-full">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  {features[idx].kicker}
                </span>
                <div className="mt-3 flex h-10 w-10 items-center justify-center rounded-xl bg-muted/80">{features[idx].icon}</div>
                <h3 className="mt-4 text-lg font-semibold" style={{ fontFamily: "'Outfit', sans-serif" }}>
                  {features[idx].title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  {features[idx].description}
                </p>
              </BentoCard>
            </motion.div>
          ))}

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.25, duration: 0.5 }}
            className="lg:col-span-4"
          >
            <BentoCard className="flex-row flex-wrap items-center gap-6 border-orange-500/15 bg-gradient-to-br from-card via-card to-orange-500/[0.04] p-8 md:flex-nowrap">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15">
                {features[5].icon}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400">
                  {features[5].kicker}
                </span>
                <h3 className="mt-1 text-xl font-semibold" style={{ fontFamily: "'Outfit', sans-serif" }}>
                  {features[5].title}
                </h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  {features[5].description}
                </p>
              </div>
            </BentoCard>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
