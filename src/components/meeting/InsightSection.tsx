import type { CSSProperties, ReactNode } from 'react';

/**
 * Section scaffolding shared by the meeting page and the summary email.
 *
 * The two surfaces used to render different sections, in a different order,
 * in a different visual language — bullet lists under emoji headings in the
 * app, boxed rows under accent headings in the email. Anyone reading both saw
 * two products. This is the app half of the single shape; the email builds the
 * same structure in table markup, which is the only thing mail clients render
 * reliably.
 */
const EMBER_BAR = 'linear-gradient(180deg, var(--ember), var(--ember-hi))';

export function InsightSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span className="h-4 w-1 shrink-0 rounded-full" style={{ background: EMBER_BAR }} />
        <h3
          className="text-[15px] font-semibold text-foreground"
          style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}
        >
          {title}
        </h3>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

/** One item, one box — a long list stays scannable instead of becoming a wall. */
export function InsightItem({
  children,
  accent = 'var(--rule)',
  style,
}: {
  children: ReactNode;
  accent?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className="flex overflow-hidden rounded-lg border border-border"
      style={{ background: 'var(--paper-card)', ...style }}
    >
      <span className="w-[3px] shrink-0" style={{ background: accent }} />
      <div className="flex-1 px-3.5 py-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </div>
  );
}
