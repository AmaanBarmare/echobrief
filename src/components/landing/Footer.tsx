import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Logo } from '@/components/ui/Logo';
import { BookOpen, Github, Mail } from 'lucide-react';

const CONTACT_EMAIL = 'admin@oltaflock.ai';

const linkGroups = [
  {
    title: 'Product',
    links: [
      { to: '/#features', label: 'Features' },
      { to: '/#integrations', label: 'Integrations' },
      { to: '/#languages', label: 'Languages' },
      { to: '/#pricing', label: 'Pricing' },
    ],
  },
  {
    title: 'Company',
    links: [
      { to: '/docs', label: 'Docs' },
      { to: '/privacy', label: 'Privacy' },
      { to: '/terms', label: 'Terms' },
      { to: `mailto:${CONTACT_EMAIL}`, label: 'Email us' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative border-t border-border bg-muted/25 dark:bg-muted/10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-orange-500/40 to-transparent" />
      <div className="mx-auto max-w-[1200px] px-6 py-14 md:py-16">
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr]">
          <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45 }}>
            <Logo size="lg" linkTo="/" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              Meeting intelligence for teams in India: transcribe, attribute speakers, and ship briefs where you work.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:border-orange-500/30 hover:text-orange-600 dark:hover:text-orange-400"
                aria-label={`Email ${CONTACT_EMAIL}`}
              >
                <Mail className="h-4 w-4" strokeWidth={1.75} />
              </a>
              <Link
                to="/docs"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:border-orange-500/30 hover:text-orange-600 dark:hover:text-orange-400"
                aria-label="Documentation"
              >
                <BookOpen className="h-4 w-4" strokeWidth={1.75} />
              </Link>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground opacity-60" title="GitHub coming soon">
                <Github className="h-4 w-4" strokeWidth={1.75} />
              </span>
            </div>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="mt-4 inline-block text-sm font-medium text-orange-600 no-underline transition-colors hover:text-orange-500 dark:text-orange-400 dark:hover:text-orange-300"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              {CONTACT_EMAIL}
            </a>
          </motion.div>

          {linkGroups.map((group) => (
            <motion.div
              key={group.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: 0.05 }}
            >
              <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                {group.title}
              </h3>
              <ul className="mt-4 space-y-3">
                {group.links.map((l) => (
                  <li key={l.to + l.label}>
                    {l.to.startsWith('mailto:') ? (
                      <a
                        href={l.to}
                        className="text-sm text-foreground/90 no-underline transition-colors hover:text-orange-600 dark:hover:text-orange-400"
                        style={{ fontFamily: "'DM Sans', sans-serif" }}
                      >
                        {l.label}
                      </a>
                    ) : (
                      <Link
                        to={l.to}
                        className="text-sm text-foreground/90 no-underline transition-colors hover:text-orange-600 dark:hover:text-orange-400"
                        style={{ fontFamily: "'DM Sans', sans-serif" }}
                      >
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-border/80 pt-8 text-[13px] text-muted-foreground md:flex-row">
          <p className="m-0" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            © {new Date().getFullYear()} EchoBrief · OltaFlock AI
          </p>
          <p className="m-0 text-center md:text-right" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            Built with care in India
          </p>
        </div>
      </div>
    </footer>
  );
}
