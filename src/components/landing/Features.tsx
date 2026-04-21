import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import {
  Bot,
  Globe,
  FileText,
  Users,
  MessageSquare,
  Shield,
} from 'lucide-react';

const features = [
  {
    icon: Bot,
    title: 'Auto-join every call',
    body: 'Connect your calendar once. EchoBrief joins Meet, Zoom, and Teams calls automatically. No extension, no manual start.',
    accent: true,
  },
  {
    icon: Globe,
    title: '22 Indian languages',
    body: 'Built for Hindi, Tamil, Bengali, Telugu, and 18 more. Handles Hinglish and Tanglish code-switching accurately.',
  },
  {
    icon: FileText,
    title: 'Clear summaries',
    body: 'Executive summary, key decisions, action items with owners, and risks. Not a wall of transcript.',
  },
  {
    icon: Users,
    title: 'Accurate speaker names',
    body: 'Speakers are matched to your calendar attendees, so "who said what" is right in every summary.',
  },
  {
    icon: MessageSquare,
    title: 'Delivered where you work',
    body: 'Summaries arrive in Slack, WhatsApp, or email, with per-language routing when you need it.',
  },
  {
    icon: Shield,
    title: 'Data stays in India',
    body: 'Processing aligned with Indian cloud posture. DPDP-aware handling and row-level security by default.',
  },
];

export function Features() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section
      id="features"
      ref={ref}
      className="scroll-mt-24 py-20 md:py-28"
      style={{ borderTop: '1px solid var(--rule)' }}
    >
      <div className="mx-auto max-w-[1200px] px-6 md:px-8" style={{ fontFamily: 'var(--font-brand-body)' }}>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="mb-14 max-w-2xl"
        >
          <span className="eyebrow">Features</span>
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
            Everything after the meeting,{' '}
            <em className="serif-italic" style={{ color: 'var(--ember)' }}>
              done for you.
            </em>
          </h2>
          <p
            className="mt-4 max-w-[54ch] text-[16px] leading-[1.65]"
            style={{ color: 'var(--ink-mid)' }}
          >
            Calendar-aware bot, multilingual transcripts, and clear summaries
            delivered where your team already works.
          </p>
        </motion.div>

        {/* Clean equal 3-column grid. First card gets a subtle ember accent for visual rhythm. */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => {
            const isAccent = f.accent;
            return (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 16 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 0.04 * i, duration: 0.45 }}
                className="relative rounded-xl p-7 transition-colors"
                style={{
                  background: isAccent
                    ? 'color-mix(in oklch, var(--ember) 6%, var(--paper-card))'
                    : 'var(--paper-card)',
                  border: isAccent
                    ? '1px solid color-mix(in oklch, var(--ember) 20%, transparent)'
                    : '1px solid var(--rule)',
                }}
              >
                <div
                  className="mb-5 inline-flex h-9 w-9 items-center justify-center rounded-md"
                  style={{
                    background: isAccent
                      ? 'color-mix(in oklch, var(--ember) 14%, transparent)'
                      : 'color-mix(in oklch, var(--ink) 5%, transparent)',
                    color: isAccent ? 'var(--ember)' : 'var(--ink)',
                  }}
                >
                  <f.icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                </div>
                <h3
                  className="text-[18px] font-semibold leading-tight"
                  style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}
                >
                  {f.title}
                </h3>
                <p
                  className="mt-2.5 text-[14px] leading-[1.6]"
                  style={{ color: 'var(--ink-mid)' }}
                >
                  {f.body}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
