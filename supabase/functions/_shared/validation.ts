/**
 * Pure request-validation helpers shared by the user-facing edge functions.
 * Unit-tested in tests/validation_test.ts.
 */

export type MeetingPlatform = "zoom" | "google_meet" | "teams";

export type MeetingUrlResult =
  | { ok: true; url: URL; platform: MeetingPlatform }
  | { ok: false; error: string };

/**
 * A meeting URL we are willing to send a Recall bot to: http(s), and hosted on
 * a known Zoom / Google Meet / Microsoft Teams domain (or a subdomain of one —
 * Zoom tenants live on hosts like us02web.zoom.us).
 */
export function parseMeetingUrl(raw: unknown): MeetingUrlResult {
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, error: "meeting_url is required" };
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: "meeting_url is not a valid URL" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, error: "meeting_url must be an http(s) URL" };
  }
  const host = url.hostname.toLowerCase();
  const matches = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  if (matches("meet.google.com")) return { ok: true, url, platform: "google_meet" };
  if (matches("zoom.us")) return { ok: true, url, platform: "zoom" };
  if (matches("teams.microsoft.com") || matches("teams.live.com")) {
    return { ok: true, url, platform: "teams" };
  }
  return { ok: false, error: "meeting_url must be a Zoom, Google Meet or Microsoft Teams link" };
}

/**
 * Deliberately simple email shape check — non-empty local part, one @, a dot
 * in the domain, no whitespace. Gates user-supplied recipient addresses.
 */
export function isValidEmail(raw: unknown): boolean {
  return typeof raw === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim());
}
