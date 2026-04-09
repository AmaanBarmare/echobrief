import { motion } from 'framer-motion';
import { useInView } from 'framer-motion';
import { useRef } from 'react';
import { Globe2 } from 'lucide-react';

const primaryLanguages = [
  'Hindi',
  'Tamil',
  'Telugu',
  'Bengali',
  'Marathi',
  'Kannada',
  'Malayalam',
  'English (Indian)',
];

const otherLanguages = [
  'Gujarati',
  'Punjabi',
  'Odia',
  'Assamese',
  'Maithili',
  'Sanskrit',
  'Urdu',
  'Konkani',
  'Dogri',
  'Sindhi',
  'Manipuri',
  'Bodo',
  'Santali',
  'Kashmiri',
];

const chipVariants = {
  hidden: { opacity: 0, scale: 0.92 },
  show: (i: number) => ({
    opacity: 1,
    scale: 1,
    transition: { delay: 0.02 * i, duration: 0.35, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

export function Languages() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section id="languages" ref={ref} className="scroll-mt-24 bg-background py-20 md:py-28">
      <div className="mx-auto max-w-[1100px] px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="mb-12 text-center"
        >
          <p
            className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-orange-600 dark:text-orange-400"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            Languages
          </p>
          <h2
            className="mb-3 text-4xl font-semibold tracking-[-0.035em] text-foreground md:text-5xl"
            style={{ fontFamily: "'Outfit', sans-serif" }}
          >
            Built for how India actually speaks
          </h2>
          <p
            className="mx-auto max-w-xl text-lg text-muted-foreground"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            Sarvam Saaras v3: built for code-mixing, regional scripts, and real meeting cadence.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="relative overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-br from-card via-card to-orange-500/[0.04] p-8 shadow-lg shadow-orange-500/5 md:p-10"
        >
          <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-orange-500/10 blur-3xl" />
          <div className="mb-6 flex items-center justify-center gap-2 text-muted-foreground md:justify-start">
            <Globe2 className="h-5 w-5 text-orange-500" strokeWidth={1.75} />
            <span className="text-sm font-medium">Primary coverage</span>
          </div>
          <div className="flex flex-wrap justify-center gap-2.5 md:justify-start">
            {primaryLanguages.map((lang, i) => (
              <motion.span
                key={lang}
                custom={i}
                initial="hidden"
                animate={inView ? 'show' : 'hidden'}
                variants={chipVariants}
                whileHover={{ scale: 1.04, y: -2 }}
                className="cursor-default rounded-full border border-orange-500/35 bg-orange-500/[0.1] px-[18px] py-2.5 text-[13px] font-medium text-orange-800 shadow-sm dark:text-orange-200"
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                {lang}
              </motion.span>
            ))}
          </div>

          <div className="my-8 h-px w-full bg-gradient-to-r from-transparent via-border to-transparent" />

          <div className="mb-4 flex items-center justify-center gap-2 text-muted-foreground md:justify-start">
            <span className="text-sm font-medium">Also supported</span>
          </div>
          <div className="flex flex-wrap justify-center gap-2 md:justify-start">
            {otherLanguages.map((lang, i) => (
              <motion.span
                key={lang}
                custom={i + 20}
                initial="hidden"
                animate={inView ? 'show' : 'hidden'}
                variants={chipVariants}
                whileHover={{ scale: 1.03, y: -1 }}
                className="cursor-default rounded-full border border-border bg-background/80 px-[14px] py-2 text-[12px] font-medium text-muted-foreground backdrop-blur-sm transition-colors hover:border-orange-500/30 hover:text-foreground"
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                {lang}
              </motion.span>
            ))}
          </div>

          <p
            className="mt-8 text-center text-[13px] text-muted-foreground md:text-left"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            + Hinglish, Tanglish, and every messy code-mixed variant your standups already use.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
