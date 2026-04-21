import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

type Lang = { native: string; latin: string };

const allLanguages: Lang[] = [
  { native: 'हिंदी', latin: 'Hindi' },
  { native: 'English', latin: 'English' },
  { native: 'বাংলা', latin: 'Bengali' },
  { native: 'मराठी', latin: 'Marathi' },
  { native: 'తెలుగు', latin: 'Telugu' },
  { native: 'தமிழ்', latin: 'Tamil' },
  { native: 'ગુજરાતી', latin: 'Gujarati' },
  { native: 'اردو', latin: 'Urdu' },
  { native: 'ಕನ್ನಡ', latin: 'Kannada' },
  { native: 'ଓଡ଼ିଆ', latin: 'Odia' },
  { native: 'മലയാളം', latin: 'Malayalam' },
  { native: 'ਪੰਜਾਬੀ', latin: 'Punjabi' },
  { native: 'অসমীয়া', latin: 'Assamese' },
  { native: 'मैथिली', latin: 'Maithili' },
  { native: 'संस्कृत', latin: 'Sanskrit' },
  { native: 'कोंकणी', latin: 'Konkani' },
  { native: 'डोगरी', latin: 'Dogri' },
  { native: 'سنڌي', latin: 'Sindhi' },
  { native: 'ꯃꯤꯇꯩ', latin: 'Manipuri' },
  { native: 'बर‍ो', latin: 'Bodo' },
  { native: 'ᱥᱟᱱᱛᱟᱲᱤ', latin: 'Santali' },
  { native: 'कॉशुर', latin: 'Kashmiri' },
];

export function Languages() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section
      id="languages"
      ref={ref}
      className="scroll-mt-24 py-20 md:py-28"
      style={{ borderTop: '1px solid var(--rule)' }}
    >
      <div className="mx-auto max-w-[1200px] px-6 md:px-8" style={{ fontFamily: 'var(--font-brand-body)' }}>
        <div className="grid gap-12 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-16">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
          >
            <span className="eyebrow">Languages</span>
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
              Built for how{' '}
              <em className="serif-italic" style={{ color: 'var(--ember)' }}>
                India actually speaks.
              </em>
            </h2>
            <p
              className="mt-4 max-w-[48ch] text-[16px] leading-[1.65]"
              style={{ color: 'var(--ink-mid)' }}
            >
              22 Indian languages with accurate code-mixing support for Hinglish,
              Tanglish, and everything in between. More languages coming as we
              expand to other markets.
            </p>

            <div className="mt-10 inline-flex items-baseline gap-3">
              <span
                className="leading-none"
                style={{
                  fontFamily: 'var(--font-brand-serif)',
                  color: 'var(--ember)',
                  fontSize: 'clamp(4.5rem, 9vw, 6.5rem)',
                  letterSpacing: '-0.04em',
                  fontWeight: 400,
                }}
              >
                22
              </span>
              <span className="text-[15px]" style={{ color: 'var(--ink-mid)' }}>
                languages supported today
              </span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="flex flex-wrap gap-2"
          >
            {allLanguages.map((l, i) => (
              <motion.span
                key={l.latin}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={inView ? { opacity: 1, scale: 1 } : {}}
                transition={{ delay: 0.05 + i * 0.02, duration: 0.3 }}
                className="inline-flex items-baseline gap-2 rounded-md px-3.5 py-2"
                style={{
                  background: 'var(--paper-card)',
                  border: '1px solid var(--rule)',
                }}
              >
                <span className="text-[15px] font-medium" style={{ color: 'var(--ink)' }}>
                  {l.native}
                </span>
                <span className="text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
                  {l.latin}
                </span>
              </motion.span>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
