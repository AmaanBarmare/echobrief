import { Link } from 'react-router-dom';
import { Logo } from '@/components/ui/Logo';
import { Mail, BookOpen, Github } from 'lucide-react';

const CONTACT_EMAIL = 'admin@oltaflock.ai';

const linkGroups = [
  {
    title: 'Product',
    links: [
      { to: '/#features', label: 'Features' },
      { to: '/#how-it-works', label: 'How it works' },
      { to: '/#languages', label: 'Languages' },
      { to: '/#integrations', label: 'Integrations' },
    ],
  },
  {
    title: 'Company',
    links: [
      { to: '/docs', label: 'Documentation' },
      { to: '/privacy', label: 'Privacy' },
      { to: '/terms', label: 'Terms' },
      { to: `mailto:${CONTACT_EMAIL}`, label: 'Contact' },
    ],
  },
];

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer
      style={{
        borderTop: '1px solid var(--rule)',
        background: 'var(--paper)',
      }}
    >
      <div className="mx-auto max-w-[1200px] px-6 py-14 md:px-8 md:py-16">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo size="md" linkTo="/" />
            <p
              className="mt-4 max-w-[36ch] text-[14px] leading-[1.6]"
              style={{ color: 'var(--ink-mid)' }}
            >
              Meeting intelligence for teams in India. Transcribe, attribute
              speakers, and deliver clear summaries where your team works.
            </p>
            <div className="mt-5 flex items-center gap-2">
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="flex h-9 w-9 items-center justify-center rounded-md transition-colors"
                style={{
                  border: '1px solid var(--rule)',
                  color: 'var(--ink-mid)',
                  background: 'var(--paper-card)',
                }}
                aria-label={`Email ${CONTACT_EMAIL}`}
              >
                <Mail className="h-4 w-4" strokeWidth={1.75} />
              </a>
              <Link
                to="/docs"
                className="flex h-9 w-9 items-center justify-center rounded-md transition-colors"
                style={{
                  border: '1px solid var(--rule)',
                  color: 'var(--ink-mid)',
                  background: 'var(--paper-card)',
                }}
                aria-label="Documentation"
              >
                <BookOpen className="h-4 w-4" strokeWidth={1.75} />
              </Link>
              <span
                className="flex h-9 w-9 items-center justify-center rounded-md opacity-50"
                style={{ border: '1px solid var(--rule)', color: 'var(--ink-soft)', background: 'var(--paper-card)' }}
                title="GitHub (coming soon)"
              >
                <Github className="h-4 w-4" strokeWidth={1.75} />
              </span>
            </div>
          </div>

          {linkGroups.map((group) => (
            <div key={group.title}>
              <h3
                className="text-[13px] font-semibold"
                style={{ color: 'var(--ink)' }}
              >
                {group.title}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {group.links.map((l) => (
                  <li key={l.to + l.label}>
                    {l.to.startsWith('mailto:') ? (
                      <a
                        href={l.to}
                        className="text-[14px] no-underline"
                        style={{ color: 'var(--ink-mid)' }}
                      >
                        {l.label}
                      </a>
                    ) : (
                      <Link
                        to={l.to}
                        className="text-[14px] no-underline"
                        style={{ color: 'var(--ink-mid)' }}
                      >
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div
          className="mt-12 flex flex-col items-start justify-between gap-3 pt-6 md:flex-row md:items-center"
          style={{ borderTop: '1px solid var(--rule)' }}
        >
          <p className="text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
            © {year} OltaFlock AI · Made in India
          </p>
          <p className="text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'var(--ink-mid)' }} className="no-underline">
              {CONTACT_EMAIL}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
