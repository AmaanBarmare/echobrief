import { useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface SectionTab<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
}

interface SectionTabsProps<T extends string> {
  tabs: SectionTab<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Rendered at the end of the bar on wide screens (e.g. a language picker). */
  trailing?: ReactNode;
  label: string;
  className?: string;
}

/**
 * The editorial underline tab bar used by Settings and MeetingDetail.
 *
 * Replaces two hand-rolled copies that were plain `<button>` lists inside a
 * `flex-wrap` container. Two problems that fixes:
 *   - no `role="tablist"` / `aria-selected` / arrow-key movement, so the bar
 *     was invisible to assistive tech and awkward from the keyboard;
 *   - when the buttons wrapped, the active underline (`-bottom-px`) only met
 *     the container border on the final row and detached everywhere else.
 * A single scrolling row avoids the wrap entirely on narrow screens.
 */
export function SectionTabs<T extends string>({
  tabs, value, onChange, trailing, label, className,
}: SectionTabsProps<T>) {
  const barRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'Home' ? 'first' : e.key === 'End' ? 'last' : null;
    if (dir === null) return;
    e.preventDefault();
    const i = tabs.findIndex((t) => t.id === value);
    const next =
      dir === 'first' ? 0 :
      dir === 'last' ? tabs.length - 1 :
      (i + dir + tabs.length) % tabs.length;
    onChange(tabs[next].id);
    barRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };

  return (
    <div
      className={cn('mb-6 flex items-end md:mb-8', className)}
      style={{ borderBottom: '1px solid var(--rule)' }}
    >
      <div
        ref={barRef}
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="scroll-x flex min-w-0 flex-1 items-end gap-4 sm:gap-5"
      >
        {tabs.map((tab) => {
          const active = value === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={active}
              aria-controls={`panel-${tab.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(tab.id)}
              className="relative flex shrink-0 items-center gap-2 whitespace-nowrap pb-3 pt-1 text-[13px] transition-colors"
              style={{
                fontFamily: 'var(--font-body)',
                color: active ? 'var(--ink)' : 'var(--ink-soft)',
                background: 'transparent',
                fontWeight: active ? 600 : 500,
                letterSpacing: '-0.005em',
              }}
            >
              {tab.icon}
              {tab.label}
              {active && (
                <span
                  aria-hidden
                  className="absolute -bottom-px left-0 right-0 h-[2px]"
                  style={{ background: 'var(--ember)' }}
                />
              )}
            </button>
          );
        })}
      </div>
      {trailing && <div className="ml-3 shrink-0 pb-2">{trailing}</div>}
    </div>
  );
}
