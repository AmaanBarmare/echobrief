import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { HeroShowcase } from '@/components/landing/HeroShowcase';
import { ArrowRight } from 'lucide-react';

const ease = [0.22, 1, 0.36, 1] as const;

const fade = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease, delay: 0.06 * i },
  }),
};

export function Hero() {
  return (
    <section
      className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-28"
      style={{ fontFamily: 'var(--font-brand-body)' }}
    >
      {/* Atmospheric warm orbs — brand-kit style, bigger and softer */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 -top-40 h-[600px] w-[600px] rounded-full blur-[90px]"
        style={{ background: 'color-mix(in oklch, var(--ember) 7%, transparent)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 bottom-0 h-[400px] w-[400px] rounded-full blur-[80px]"
        style={{ background: 'color-mix(in oklch, var(--gold) 7%, transparent)' }}
      />

      <div className="relative mx-auto grid max-w-[1200px] items-center gap-14 px-6 md:px-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16">
        <div>
          <motion.div
            custom={0}
            initial="hidden"
            animate="show"
            variants={fade}
            className="mb-7"
          >
            <span className="eyebrow">Meeting intelligence · Built for India</span>
          </motion.div>

          <motion.h1
            custom={1}
            initial="hidden"
            animate="show"
            variants={fade}
            className="max-w-[18ch] leading-[1.02]"
            style={{
              fontFamily: 'var(--font-brand-serif)',
              color: 'var(--ink)',
              fontSize: 'clamp(2.75rem, 5.5vw, 4.25rem)',
              letterSpacing: '-0.025em',
              fontWeight: 400,
            }}
          >
            Every meeting, summarized.
            <br />
            <em
              className="serif-italic"
              style={{ color: 'var(--ember)' }}
            >
              In any Indian language.
            </em>
          </motion.h1>

          <motion.p
            custom={2}
            initial="hidden"
            animate="show"
            variants={fade}
            className="mt-7 max-w-[54ch] text-[17px] leading-[1.65]"
            style={{ color: 'var(--ink-mid)' }}
          >
            EchoBrief joins your Meet, Zoom, and Teams calls, transcribes
            Hindi, Tamil, and Hinglish the way your team actually speaks,
            and delivers summaries to Slack, WhatsApp, or email automatically.
          </motion.p>

          <motion.div
            custom={3}
            initial="hidden"
            animate="show"
            variants={fade}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <Link
              to="/auth"
              className="group inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-[14.5px] font-bold text-white no-underline transition-all hover:-translate-y-0.5"
              style={{
                background: 'var(--ember)',
                boxShadow: '0 6px 24px color-mix(in oklch, var(--ember) 28%, transparent)',
              }}
            >
              Start free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.25} />
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center rounded-full px-6 py-3 text-[14.5px] font-semibold no-underline transition-colors"
              style={{
                color: 'var(--ink)',
                border: '1.5px solid var(--rule)',
                background: 'transparent',
              }}
            >
              See how it works
            </a>
          </motion.div>

          <motion.p
            custom={4}
            initial="hidden"
            animate="show"
            variants={fade}
            className="mt-5 text-[13px]"
            style={{ color: 'var(--ink-soft)' }}
          >
            Free for your first 3 meetings · No Chrome extension · Connect your calendar in 30 seconds
          </motion.p>

          <motion.dl
            custom={5}
            initial="hidden"
            animate="show"
            variants={fade}
            className="mt-12 grid max-w-[520px] grid-cols-3 gap-5"
          >
            {[
              { v: '22', l: 'Languages' },
              { v: '3', l: 'Platforms' },
              { v: '∞', l: 'Meetings' },
            ].map((s) => (
              <div key={s.l}>
                <dt
                  className="text-[10px]"
                  style={{
                    fontFamily: 'var(--font-brand-mono)',
                    color: 'var(--ink-soft)',
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    fontWeight: 500,
                  }}
                >
                  {s.l}
                </dt>
                <dd
                  className="mt-1.5 leading-none"
                  style={{
                    fontFamily: 'var(--font-brand-serif)',
                    color: 'var(--ink)',
                    fontSize: '2.25rem',
                    letterSpacing: '-0.02em',
                    fontWeight: 400,
                  }}
                >
                  {s.v}
                </dd>
              </div>
            ))}
          </motion.dl>
        </div>

        <HeroShowcase />
      </div>
    </section>
  );
}
