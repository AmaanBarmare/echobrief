import { motion } from 'framer-motion';
import { Calendar, Mail, MessageCircle, MonitorPlay, Slack, Video } from 'lucide-react';

const items = [
  { Icon: Video, label: 'Google Meet', hint: 'Browser & Workspace' },
  { Icon: MonitorPlay, label: 'Zoom', hint: 'Web client' },
  { Icon: MonitorPlay, label: 'Microsoft Teams', hint: 'Web & desktop' },
  { Icon: Calendar, label: 'Google Calendar', hint: 'Auto-join rules' },
  { Icon: Slack, label: 'Slack', hint: 'Channel delivery' },
  { Icon: MessageCircle, label: 'WhatsApp', hint: 'Brief to chat' },
  { Icon: Mail, label: 'Email', hint: 'Digests & alerts' },
];

export function IntegrationStrip() {
  return (
    <section id="integrations" className="relative scroll-mt-24 border-y border-border/50 bg-muted/30 py-10 dark:bg-muted/15">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(249,115,22,0.03)_50%,transparent)] dark:bg-[linear-gradient(90deg,transparent,rgba(249,115,22,0.06)_50%,transparent)]" />
      <div className="relative mx-auto max-w-[1200px] px-6">
        <p
          className="mb-6 text-center text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground"
          style={{ fontFamily: "'DM Sans', sans-serif" }}
        >
          Works with your stack
        </p>
        <div className="flex flex-wrap items-stretch justify-center gap-3 md:gap-4">
          {items.map(({ Icon, label, hint }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ delay: i * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="group flex min-w-[140px] flex-1 flex-col items-center rounded-2xl border border-border/80 bg-card/90 px-4 py-3 text-center shadow-sm backdrop-blur-sm transition-colors hover:border-orange-500/30 hover:shadow-md hover:shadow-orange-500/10 sm:min-w-[160px] md:flex-initial"
            >
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500/15 to-amber-500/10 text-orange-600 transition-transform group-hover:scale-110 dark:text-orange-400">
                <Icon className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <span className="text-[13px] font-semibold text-foreground" style={{ fontFamily: 'Outfit, sans-serif' }}>
                {label}
              </span>
              <span className="mt-0.5 text-[10px] text-muted-foreground">{hint}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
