import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useInView } from 'framer-motion';
import { useRef } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';

export function CTA() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section id="pricing" ref={ref} className="scroll-mt-24 bg-background py-20 md:py-24">
      <div className="mx-auto max-w-[1100px] px-6">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="landing-cta-glow relative overflow-hidden rounded-[28px] border border-orange-500/20 bg-gradient-to-br from-orange-500/[0.09] via-card to-amber-500/[0.06] px-8 py-14 text-center md:px-14 md:py-16 dark:from-orange-500/15 dark:via-card dark:to-amber-500/10"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -left-24 top-0 h-64 w-64 rounded-full bg-orange-500/20 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-16 -right-16 h-56 w-56 rounded-full bg-amber-500/15 blur-3xl"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={inView ? { scale: 1, opacity: 1 } : {}}
            transition={{ delay: 0.15, duration: 0.45 }}
            className="mb-4 inline-flex items-center gap-2 rounded-full border border-orange-500/25 bg-background/60 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-orange-700 dark:text-orange-300"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Free to start
          </motion.div>

          <h2
            className="relative mb-4 text-3xl font-semibold tracking-[-0.035em] text-foreground md:text-[2.35rem]"
            style={{ fontFamily: "'Outfit', sans-serif" }}
          >
            Stop taking notes.
            <span className="gradient-text"> Start deciding.</span>
          </h2>

          <p
            className="relative mx-auto mb-10 max-w-md text-base leading-relaxed text-muted-foreground md:text-lg"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            Connect your calendar. EchoBrief runs the rest. No card required for your first recordings.
          </p>

          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Link
              to="/auth"
              className="group relative inline-flex items-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 px-10 py-4 text-base font-semibold text-white no-underline shadow-xl shadow-orange-500/30 transition-shadow hover:shadow-2xl hover:shadow-orange-500/40"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
              <span className="relative">Start recording free</span>
              <ArrowRight className="relative h-5 w-5 transition-transform group-hover:translate-x-1" strokeWidth={2} />
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
