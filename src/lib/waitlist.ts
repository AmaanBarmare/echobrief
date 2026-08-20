/**
 * Signups are closed, so every landing CTA funnels into the waitlist form that
 * lives in the bottom CTA section instead of linking to /auth.
 *
 * Each CTA reports where the click came from ('hero', 'navbar', 'pricing:Pro')
 * so the stored lead records which pitch converted. The form listens for the
 * event rather than taking a prop, which keeps the CTAs scattered across the
 * page from having to thread state through Landing.tsx.
 */
export const WAITLIST_ANCHOR = 'waitlist';

const EVENT = 'waitlist:open';

export function openWaitlist(source: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { source } }));
  document
    .getElementById(WAITLIST_ANCHOR)
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function onWaitlistOpen(handler: (source: string) => void) {
  const listener = (e: Event) => handler((e as CustomEvent<{ source: string }>).detail.source);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
