import { Link } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { ArrowRight } from 'lucide-react';

export function CTA() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section id="pricing" ref={ref} className="scroll-mt-24 py-20 md:py-28">
      <div className="mx-auto max-w-[1100px] px-6 md:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="relative overflow-hidden rounded-[28px] px-8 py-16 text-center md:px-14 md:py-20"
          style={{
            background: 'var(--paper-card)',
            border: '1px solid var(--rule)',
            fontFamily: 'var(--font-brand-body)',
            boxShadow: '0 20px 60px color-mix(in oklch, var(--ink) 8%, transparent)',
          }}
        >
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-[3px]"
            style={{ background: 'linear-gradient(90deg, var(--ember), var(--gold))' }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full blur-[80px]"
            style={{ background: 'color-mix(in oklch, var(--ember) 10%, transparent)' }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full blur-[80px]"
            style={{ background: 'color-mix(in oklch, var(--gold) 10%, transparent)' }}
          />

          <span className="eyebrow relative" style={{ justifyContent: 'center' }}>Free to start</span>

          <h2
            className="relative mt-5 leading-[1.06]"
            style={{
              fontFamily: 'var(--font-brand-serif)',
              color: 'var(--ink)',
              fontSize: 'clamp(2rem, 4.5vw, 3rem)',
              letterSpacing: '-0.02em',
              fontWeight: 400,
            }}
          >
            Stop taking notes.{' '}
            <em className="serif-italic" style={{ color: 'var(--ember)' }}>
              Start deciding.
            </em>
          </h2>
          <p
            className="relative mx-auto mt-5 max-w-[46ch] text-[16px] leading-[1.65]"
            style={{ color: 'var(--ink-mid)' }}
          >
            Connect your calendar in thirty seconds. EchoBrief handles every
            meeting that follows, in the language your team actually speaks.
          </p>

          <div className="relative mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/auth"
              className="group inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-[15px] font-bold text-white no-underline transition-all hover:-translate-y-0.5"
              style={{
                background: 'var(--ember)',
                boxShadow: '0 8px 28px color-mix(in oklch, var(--ember) 30%, transparent)',
              }}
            >
              Start free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.25} />
            </Link>
            <Link
              to="/docs"
              className="inline-flex items-center rounded-full px-6 py-3 text-[14.5px] font-semibold no-underline"
              style={{
                color: 'var(--ink)',
                border: '1.5px solid var(--rule)',
              }}
            >
              Read the docs
            </Link>
          </div>

          <p
            className="relative mt-6 text-[12.5px]"
            style={{
              fontFamily: 'var(--font-brand-mono)',
              color: 'var(--ink-soft)',
              letterSpacing: '0.06em',
            }}
          >
            3 MEETINGS FREE · NO CARD · CANCEL ANYTIME
          </p>
        </motion.div>
      </div>
    </section>
  );
}
