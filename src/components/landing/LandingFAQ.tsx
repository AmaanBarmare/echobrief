import { motion, useInView } from 'framer-motion';
import { useRef, useState } from 'react';
import { Plus, Minus } from 'lucide-react';

const faqs = [
  {
    q: 'Do I need to install anything in the meeting?',
    a: "No. EchoBrief uses a cloud bot that joins from your calendar, so there's nothing to install. A Chrome extension is still available if your workspace prefers local capture, but the dashboard flow is bot-only.",
  },
  {
    q: 'Which languages are supported?',
    a: '22 Indian languages plus Indian English, with strong code-mixing support (Hinglish, Tanglish, and more). Summaries can be delivered in a different language than the meeting, which is useful when a Hindi meeting goes to English readers.',
  },
  {
    q: 'Where do the summaries go?',
    a: 'Slack channels, WhatsApp numbers, email, or Notion pages. You choose per workspace or per user in settings, with per-language routing when a Hindi team and an English team share the same meeting.',
  },
  {
    q: 'What happens to my audio?',
    a: 'Audio is processed for transcription and insight extraction, then retained according to your workspace policy. Processing follows Indian cloud posture where applicable, with row-level security across all data.',
  },
  {
    q: 'Can teams outside India use this?',
    a: "We're India-first, but not India-only. Spanish, Portuguese, French, Arabic, Indonesian, Vietnamese, and Thai are coming in 2026. If you're outside India and want early access, write to us.",
  },
];

function Row({ item }: { item: { q: string; a: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: '1px solid var(--rule)' }}>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-6 py-5 text-left transition-colors"
      >
        <span
          className="text-[16.5px] font-medium leading-[1.4]"
          style={{ color: 'var(--ink)' }}
        >
          {item.q}
        </span>
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{
            border: '1px solid var(--rule)',
            color: 'var(--ink-mid)',
            background: 'var(--paper-card)',
          }}
          aria-hidden
        >
          {open ? <Minus className="h-[14px] w-[14px]" strokeWidth={1.75} /> : <Plus className="h-[14px] w-[14px]" strokeWidth={1.75} />}
        </span>
      </button>
      <div
        className="grid transition-[grid-template-rows,opacity] duration-300"
        style={{ gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0 }}
      >
        <div className="overflow-hidden">
          <p
            className="pb-6 text-[14.5px] leading-[1.7]"
            style={{ color: 'var(--ink-mid)' }}
          >
            {item.a}
          </p>
        </div>
      </div>
    </div>
  );
}

export function LandingFAQ() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section
      id="faq"
      ref={ref}
      className="scroll-mt-24 py-20 md:py-28"
      style={{ borderTop: '1px solid var(--rule)' }}
    >
      <div className="mx-auto max-w-[900px] px-6 md:px-8" style={{ fontFamily: 'var(--font-brand-body)' }}>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="mb-10 text-center"
        >
          <span className="eyebrow" style={{ justifyContent: 'center' }}>Questions</span>
          <h2
            className="mt-4 leading-[1.08]"
            style={{
              fontFamily: 'var(--font-brand-serif)',
              color: 'var(--ink)',
              fontSize: 'clamp(2rem, 4vw, 2.5rem)',
              letterSpacing: '-0.02em',
              fontWeight: 400,
            }}
          >
            Answered
          </h2>
          <p
            className="mx-auto mt-3 max-w-[48ch] text-[15.5px]"
            style={{ color: 'var(--ink-mid)' }}
          >
            If yours isn't here, write to us. We usually reply within a day.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ delay: 0.1, duration: 0.5 }}
        >
          {faqs.map((item, i) => (
            <Row key={i} item={item} />
          ))}
          <div style={{ borderTop: '1px solid var(--rule)' }} />
        </motion.div>
      </div>
    </section>
  );
}
