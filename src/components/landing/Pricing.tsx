import { motion, useInView } from 'framer-motion';
import { useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { openWaitlist } from '@/lib/waitlist';

type Billing = 'monthly' | 'annual';

type Tier = {
  name: string;
  tagline: string;
  monthly: number;
  annualTotal: number | null;
  unit: string;
  // Set on tiers that are not self-serve. Renders in place of the rupee figure,
  // so a "talk to us" plan doesn't have to fake a price.
  priceLabel?: string;
  priceNote?: string;
  features: string[];
  cta: string;
  featured?: boolean;
  footnote?: string;
};

const tiers: Tier[] = [
  {
    name: 'Starter',
    tagline: 'For individuals',
    monthly: 799,
    annualTotal: 7990,
    unit: '/month',
    features: [
      '10 meeting-hours / month',
      '₹129/hr overage, capped at +10 hrs',
      'Email delivery and Google Calendar follow-ups',
      'Full AI insights',
      'Speaker identification',
      '30-day retention',
    ],
    cta: 'Join waitlist',
  },
  {
    name: 'Pro',
    tagline: 'For power users',
    monthly: 1999,
    annualTotal: 19990,
    unit: '/month',
    features: [
      '25 meeting-hours / month',
      '₹99/hr after that',
      'Everything in Starter',
      'Custom vocabulary and priority processing',
      '90-day retention',
    ],
    cta: 'Join waitlist',
    featured: true,
  },
  {
    name: 'Teams',
    tagline: 'For teams of five or more',
    monthly: 0,
    annualTotal: null,
    unit: '',
    priceLabel: 'Talk to us',
    priceNote: 'Priced per team',
    features: [
      'In build with design partners',
      'Shared workspace and pooled meeting-hours',
      'Admin dashboard and usage analytics',
      'Priority support',
      'Tell us what your team needs',
    ],
    cta: 'Start a conversation',
  },
];

function formatINR(n: number) {
  return new Intl.NumberFormat('en-IN').format(n);
}

export function Pricing() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const [billing, setBilling] = useState<Billing>('monthly');

  return (
    <section
      id="pricing"
      ref={ref}
      className="scroll-mt-24 py-20 md:py-28"
      style={{ borderTop: '1px solid var(--rule)' }}
    >
      <div
        className="mx-auto max-w-[1200px] px-6 md:px-8"
        style={{ fontFamily: 'var(--font-brand-body)' }}
      >
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="mb-10 flex flex-col items-start gap-6 md:mb-14 md:flex-row md:items-end md:justify-between"
        >
          <div className="max-w-2xl">
            <span className="eyebrow">Pricing</span>
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
              Simple pricing.{' '}
              <em className="serif-italic" style={{ color: 'var(--ember)' }}>
                In rupees.
              </em>
            </h2>
            <p
              className="mt-4 max-w-[54ch] text-[16px] leading-[1.65]"
              style={{ color: 'var(--ink-mid)' }}
            >
              These are the plans waiting for you. Tell us which one fits and
              we'll hold it. Annual plans get two months on the house.
            </p>
          </div>

          <div
            className="inline-flex items-center rounded-full p-1"
            style={{
              background: 'var(--paper-raised)',
              border: '1px solid var(--rule)',
            }}
            role="tablist"
            aria-label="Billing period"
          >
            <button
              role="tab"
              aria-selected={billing === 'monthly'}
              onClick={() => setBilling('monthly')}
              className="rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors"
              style={{
                background:
                  billing === 'monthly' ? 'var(--paper-card)' : 'transparent',
                color:
                  billing === 'monthly' ? 'var(--ink)' : 'var(--ink-mid)',
                boxShadow:
                  billing === 'monthly'
                    ? '0 1px 2px color-mix(in oklch, var(--ink) 8%, transparent)'
                    : 'none',
              }}
            >
              Monthly
            </button>
            <button
              role="tab"
              aria-selected={billing === 'annual'}
              onClick={() => setBilling('annual')}
              className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors"
              style={{
                background:
                  billing === 'annual' ? 'var(--paper-card)' : 'transparent',
                color:
                  billing === 'annual' ? 'var(--ink)' : 'var(--ink-mid)',
                boxShadow:
                  billing === 'annual'
                    ? '0 1px 2px color-mix(in oklch, var(--ink) 8%, transparent)'
                    : 'none',
              }}
            >
              Annual
              <span
                className="rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold"
                style={{
                  background:
                    'color-mix(in oklch, var(--ember) 14%, transparent)',
                  color: 'var(--ember)',
                  letterSpacing: '0.02em',
                }}
              >
                2 MONTHS FREE
              </span>
            </button>
          </div>
        </motion.div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {tiers.map((tier, i) => {
            const displayPrice =
              billing === 'annual' && tier.annualTotal
                ? Math.round(tier.annualTotal / 12)
                : tier.monthly;
            const isFeatured = tier.featured;

            return (
              <motion.div
                key={tier.name}
                initial={{ opacity: 0, y: 16 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 0.05 * i, duration: 0.45 }}
                className="relative flex flex-col rounded-xl p-7 transition-colors"
                style={{
                  background: isFeatured
                    ? 'color-mix(in oklch, var(--ember) 6%, var(--paper-card))'
                    : 'var(--paper-card)',
                  border: isFeatured
                    ? '1px solid color-mix(in oklch, var(--ember) 22%, transparent)'
                    : '1px solid var(--rule)',
                }}
              >
                {isFeatured && (
                  <span
                    className="absolute -top-3 left-7 rounded-full px-2.5 py-1 text-[10.5px] font-semibold uppercase"
                    style={{
                      background: 'var(--ember)',
                      color: 'white',
                      letterSpacing: '0.06em',
                      fontFamily: 'var(--font-brand-mono)',
                    }}
                  >
                    Most popular
                  </span>
                )}

                <div>
                  <h3
                    className="text-[17px] font-semibold leading-tight"
                    style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}
                  >
                    {tier.name}
                  </h3>
                  <p
                    className="mt-1 text-[13px]"
                    style={{ color: 'var(--ink-mid)' }}
                  >
                    {tier.tagline}
                  </p>
                </div>

                <div className="mt-6">
                  {tier.priceLabel ? (
                    <div className="flex items-baseline">
                      <span
                        className="text-[28px] leading-none tracking-tight"
                        style={{
                          color: 'var(--ink)',
                          fontFamily: 'var(--font-brand-serif)',
                          fontWeight: 400,
                        }}
                      >
                        {tier.priceLabel}
                      </span>
                    </div>
                  ) : (
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className="text-[14px] font-medium"
                      style={{ color: 'var(--ink-mid)' }}
                    >
                      ₹
                    </span>
                    <span
                      className="text-[40px] font-semibold leading-none tracking-tight"
                      style={{
                        color: 'var(--ink)',
                        fontFamily: 'var(--font-brand-serif)',
                        fontWeight: 400,
                      }}
                    >
                      {formatINR(displayPrice)}
                    </span>
                    <span
                      className="text-[13.5px]"
                      style={{ color: 'var(--ink-mid)' }}
                    >
                      {tier.unit}
                    </span>
                  </div>
                  )}
                  <p
                    className="mt-1.5 min-h-[18px] text-[12.5px]"
                    style={{ color: 'var(--ink-mid)' }}
                  >
                    {tier.priceNote
                      ? tier.priceNote
                      : billing === 'annual' && tier.annualTotal
                      ? `₹${formatINR(tier.annualTotal)} billed yearly`
                      : 'Billed monthly'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => openWaitlist(`pricing:${tier.name}`)}
                  className="mt-6 inline-flex w-full items-center justify-center rounded-md px-4 py-2.5 text-[14px] font-semibold transition-opacity hover:opacity-90"
                  style={
                    isFeatured
                      ? { background: 'var(--ember)', color: 'white' }
                      : {
                          background: 'var(--paper-card)',
                          color: 'var(--ink)',
                          border: '1px solid var(--rule)',
                        }
                  }
                >
                  {tier.cta}
                </button>

                <ul className="mt-7 space-y-3">
                  {tier.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2.5 text-[13.5px] leading-[1.5]"
                      style={{ color: 'var(--ink-mid)' }}
                    >
                      <Check
                        className="mt-0.5 h-[15px] w-[15px] flex-shrink-0"
                        strokeWidth={2.25}
                        style={{ color: 'var(--ember)' }}
                      />
                      <span style={{ color: 'var(--ink)' }}>{f}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.3, duration: 0.45 }}
          className="mt-8 flex flex-col gap-3 rounded-xl p-6 md:flex-row md:items-center md:justify-between"
          style={{
            background: 'var(--paper-raised)',
            border: '1px solid var(--rule)',
          }}
        >
          <div>
            <h4
              className="text-[16px] font-semibold"
              style={{ color: 'var(--ink)' }}
            >
              Business
            </h4>
            <p
              className="mt-1 text-[14px] leading-[1.55]"
              style={{ color: 'var(--ink-mid)' }}
            >
              Starts at ₹19,999/month. SSO, Indian data residency, dedicated
              CSM, custom retention, and SLA.
            </p>
          </div>
          <a
            href="mailto:hello@echobrief.ai"
            className="inline-flex shrink-0 items-center justify-center rounded-md px-4 py-2.5 text-[14px] font-semibold no-underline transition-opacity hover:opacity-90"
            style={{
              color: 'var(--ink)',
              border: '1px solid var(--rule)',
              background: 'var(--paper-card)',
            }}
          >
            Talk to sales
          </a>
        </motion.div>

        <p
          className="mt-6 text-[12.5px] leading-[1.6]"
          style={{ color: 'var(--ink-mid)' }}
        >
          Prices shown in INR. Global customers are billed the equivalent in
          their local currency at current exchange rates. GST extra where
          applicable. Annual plans billed upfront.
        </p>
      </div>
    </section>
  );
}
