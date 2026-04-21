import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

const steps = [
  {
    title: 'Connect your calendar',
    body: 'Link Google Calendar or Outlook in about thirty seconds.',
  },
  {
    title: 'Bot joins automatically',
    body: 'EchoBrief joins Meet, Zoom, or Teams calls a minute before they start.',
  },
  {
    title: 'Transcribe and understand',
    body: 'We transcribe, identify speakers, and extract key points in your language.',
  },
  {
    title: 'Delivered where you work',
    body: 'Summary lands in Slack, WhatsApp, or email, in the language your team prefers.',
  },
];

export function HowItWorks() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section
      id="how-it-works"
      ref={ref}
      className="scroll-mt-24 py-20 md:py-28"
      style={{
        background: 'var(--paper-raised)',
        borderTop: '1px solid var(--rule)',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      <div className="mx-auto max-w-[1200px] px-6 md:px-8" style={{ fontFamily: 'var(--font-brand-body)' }}>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="mb-14 max-w-2xl"
        >
          <span className="eyebrow">How it works</span>
          <h2
            className="mt-4 leading-[1.06]"
            style={{
              fontFamily: 'var(--font-brand-serif)',
              color: 'var(--ink)',
              fontSize: 'clamp(2rem, 4vw, 2.75rem)',
              letterSpacing: '-0.02em',
              fontWeight: 400,
            }}
          >
            Connect once.{' '}
            <em className="serif-italic" style={{ color: 'var(--ember)' }}>
              EchoBrief does the rest.
            </em>
          </h2>
          <p
            className="mt-4 max-w-[54ch] text-[16px] leading-[1.65]"
            style={{ color: 'var(--ink-mid)' }}
          >
            Set it up once. Every meeting after that is handled automatically.
            No clicks, no buttons to remember.
          </p>
        </motion.div>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4 lg:gap-10">
          {steps.map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 16 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.08 * i, duration: 0.45 }}
              className="relative"
            >
              <span
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[14px] font-semibold"
                style={{
                  background: 'color-mix(in oklch, var(--ember) 12%, transparent)',
                  color: 'var(--ember)',
                }}
              >
                {i + 1}
              </span>
              <h3
                className="mt-5 text-[18px] font-semibold leading-tight"
                style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}
              >
                {step.title}
              </h3>
              <p className="mt-2 text-[14.5px] leading-[1.6]" style={{ color: 'var(--ink-mid)' }}>
                {step.body}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
