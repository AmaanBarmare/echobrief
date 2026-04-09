import { motion } from 'framer-motion';
import { useInView } from 'framer-motion';
import { useRef } from 'react';
import { ArrowRight } from 'lucide-react';

const steps = [
  {
    num: '01',
    title: 'Connect calendar',
    description: 'Link Google Calendar or Outlook. Takes about thirty seconds.',
    bgColor: 'bg-orange-500/10',
    textColor: 'text-orange-600 dark:text-orange-400',
    borderColor: 'border-orange-500/25',
  },
  {
    num: '02',
    title: 'Bot auto-joins',
    description: 'EchoBrief joins before start time. No click, no extension in the room.',
    bgColor: 'bg-purple-500/10',
    textColor: 'text-purple-600 dark:text-purple-400',
    borderColor: 'border-purple-500/25',
  },
  {
    num: '03',
    title: 'Transcribe & understand',
    description: 'Sarvam STT, diarization, and insight extraction, tuned for Indian speech.',
    bgColor: 'bg-blue-500/10',
    textColor: 'text-blue-600 dark:text-blue-400',
    borderColor: 'border-blue-500/25',
  },
  {
    num: '04',
    title: 'Deliver the brief',
    description: 'Summaries, actions, and risks via Slack, WhatsApp, or email in your language.',
    bgColor: 'bg-green-500/10',
    textColor: 'text-green-600 dark:text-green-400',
    borderColor: 'border-green-500/25',
  },
];

export function HowItWorks() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section id="how-it-works" ref={ref} className="scroll-mt-24 border-y border-border/60 bg-muted/35 py-20 dark:bg-muted/20 md:py-28">
      <div className="mx-auto max-w-[1200px] px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="mb-14 text-center md:mb-16"
        >
          <p
            className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-orange-600 dark:text-orange-400"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            How it works
          </p>
          <h2
            className="mb-3 text-4xl font-semibold tracking-[-0.035em] text-foreground md:text-5xl"
            style={{ fontFamily: "'Outfit', sans-serif" }}
          >
            Four beats. One pipeline.
          </h2>
          <p className="mx-auto max-w-lg text-lg text-muted-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            Connect once. EchoBrief handles every meeting that follows.
          </p>
        </motion.div>

        <div className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute left-[8%] right-[8%] top-[52px] hidden h-0.5 overflow-hidden rounded-full lg:block"
          >
            <motion.div
              className="h-full bg-gradient-to-r from-orange-500 via-amber-500 to-green-500 opacity-40"
              initial={{ scaleX: 0 }}
              animate={inView ? { scaleX: 1 } : {}}
              transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
              style={{ transformOrigin: 'left' }}
            />
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            {steps.map((step, idx) => (
              <motion.article
                key={step.num}
                initial={{ opacity: 0, y: 28 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 0.12 + idx * 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="group relative flex flex-col rounded-2xl border border-border/80 bg-card/80 p-6 shadow-sm backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-orange-500/20 hover:shadow-lg hover:shadow-orange-500/10"
              >
                <div
                  className={`mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border-2 ${step.borderColor} ${step.bgColor}`}
                >
                  <span
                    className={`text-xl font-bold ${step.textColor}`}
                    style={{ fontFamily: 'Outfit, sans-serif' }}
                  >
                    {step.num}
                  </span>
                </div>
                <h3 className="mb-2 text-lg font-semibold text-foreground" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  {step.title}
                </h3>
                <p className="flex-1 text-sm leading-relaxed text-muted-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  {step.description}
                </p>
                {idx < steps.length - 1 && (
                  <div className="mt-4 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 lg:hidden">
                    Next <ArrowRight className="h-3 w-3" />
                  </div>
                )}
              </motion.article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
