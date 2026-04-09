import { motion } from 'framer-motion';
import { useInView } from 'framer-motion';
import { useRef } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

const faqs = [
  {
    q: 'Do I need to install anything in the meeting?',
    a: 'No. EchoBrief uses a cloud bot that joins from your calendar. You can still use the Chrome extension for local capture if you prefer. The dashboard flow is bot-only.',
  },
  {
    q: 'Which languages are supported?',
    a: '22 Indian languages plus English (Indian), with strong code-mixing (e.g. Hinglish, Tanglish). Summaries can be delivered in the language your team prefers.',
  },
  {
    q: 'Where do summaries go?',
    a: 'Slack channels, WhatsApp, or email. You choose per workspace or per user in settings.',
  },
  {
    q: 'Is my audio stored?',
    a: 'Audio is processed for transcription and insights; retention follows your workspace policy. Processing is designed with India-first data paths where applicable.',
  },
];

export function LandingFAQ() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <section id="faq" ref={ref} className="scroll-mt-24 border-t border-border/60 bg-background py-20 md:py-24">
      <div className="mx-auto max-w-[720px] px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="mb-10 text-center"
        >
          <p
            className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-orange-600 dark:text-orange-400"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            FAQ
          </p>
          <h2 className="text-3xl font-semibold tracking-[-0.03em] text-foreground md:text-4xl" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Questions, answered
          </h2>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ delay: 0.15, duration: 0.5 }}>
          <Accordion type="single" collapsible className="rounded-2xl border border-border bg-card/50 px-2 shadow-sm backdrop-blur-sm">
            {faqs.map((item, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="border-border/80 px-4">
                <AccordionTrigger className="text-left text-[15px] hover:no-underline" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-[14px] leading-relaxed text-muted-foreground pb-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  );
}
