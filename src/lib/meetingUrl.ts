/**
 * Which platform a meeting URL belongs to, decided in the browser.
 *
 * A deliberate mirror of `parseMeetingUrl` in
 * `supabase/functions/_shared/validation.ts`, which is the authority — the
 * server re-validates every URL and is what actually refuses one. This copy
 * exists so the Record dialog can name the platform as you type and reject a
 * bad link without a round trip. Keep the two in step.
 */

export type MeetingPlatform = 'google_meet' | 'zoom' | 'teams';

export const PLATFORM_LABELS: Record<MeetingPlatform, string> = {
  google_meet: 'Google Meet',
  zoom: 'Zoom',
  teams: 'Microsoft Teams',
};

/**
 * One flat shape rather than a discriminated union: this project compiles with
 * `strict: false`, so `strictNullChecks` is off and TypeScript will not narrow
 * `{ok: true} | {ok: false}` on the `ok` field. A union here type-checks at the
 * definition and fails at every call site.
 */
export interface MeetingUrlResult {
  ok: boolean;
  platform: MeetingPlatform | null;
  error: string | null;
}

export function parseMeetingUrl(raw: string): MeetingUrlResult {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    return { ok: false, platform: null, error: 'Paste the meeting link to record.' };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return {
      ok: false,
      platform: null,
      error: "That is not a link. It should start with 'https://'.",
    };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, platform: null, error: "The link should start with 'https://'." };
  }

  const host = url.hostname.toLowerCase();
  // Subdomains count: Zoom tenants live on hosts like us02web.zoom.us.
  const matches = (domain: string) => host === domain || host.endsWith(`.${domain}`);

  if (matches('meet.google.com')) return { ok: true, platform: 'google_meet', error: null };
  if (matches('zoom.us')) return { ok: true, platform: 'zoom', error: null };
  if (matches('teams.microsoft.com') || matches('teams.live.com')) {
    return { ok: true, platform: 'teams', error: null };
  }
  return {
    ok: false,
    platform: null,
    error: 'That link is not one we can join. Use a Google Meet, Zoom or Microsoft Teams link.',
  };
}
