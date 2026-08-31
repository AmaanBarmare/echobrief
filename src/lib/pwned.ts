// Client-side leaked-password check against HaveIBeenPwned's Pwned Passwords
// range API, using the k-anonymity model.
//
// PRIVACY GUARANTEE: the full password NEVER leaves the browser. We SHA-1 the
// password locally and send only the FIRST 5 hex characters of the hash to
// api.pwnedpasswords.com; the API returns every known hash suffix for that
// prefix and the match is done locally. The `Add-Padding: true` header makes
// the API pad responses so the response size cannot leak how many real
// entries the prefix has.
//
// FAIL-OPEN: any network error, timeout (~3 s), or non-200 resolves to
// { breached: false, count: 0 } — an outage of the breach list must never
// block a legitimate signup or password change.
//
// Manual verification (2026-08-31), no test runner covers src/ so this was
// verified against the live API with curl + node:
//   - SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8; a curl of
//     /range/5BAA6 returned line 1E4C9B93F3F0682250B6CF8331B7EE68FD8:52372427,
//     and checkPwnedPassword("password") run in node (strip-types) against the
//     live API returned { breached: true, count: 52372427 }.
//   - A long random string returned { breached: false, count: 0 }; its padded
//     range body contained CRLF-terminated ":0" padding rows, and
//     parsePwnedRange of a padding row's own suffix returned 0 (never a hit).

const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const TIMEOUT_MS = 3000;

async function sha1Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/**
 * Pure helper: given a range-API response body and the 35-char hash suffix,
 * return the breach count (0 when absent). Padding rows have count 0, so a
 * matching padded row still correctly yields "not breached".
 */
export function parsePwnedRange(body: string, suffix: string): number {
  const wanted = suffix.toUpperCase();
  for (const line of body.split('\n')) {
    const [lineSuffix, countStr] = line.trim().split(':');
    if (lineSuffix && lineSuffix.toUpperCase() === wanted) {
      const count = parseInt(countStr ?? '', 10);
      return Number.isFinite(count) && count > 0 ? count : 0;
    }
  }
  return 0;
}

export async function checkPwnedPassword(
  password: string,
): Promise<{ breached: boolean; count: number }> {
  try {
    const hash = await sha1Hex(password);
    const prefix = hash.slice(0, 5); // only these 5 chars are ever sent
    const suffix = hash.slice(5);
    const res = await fetch(HIBP_RANGE_URL + prefix, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { breached: false, count: 0 };
    const count = parsePwnedRange(await res.text(), suffix);
    return { breached: count > 0, count };
  } catch {
    // Fail open — see header comment.
    return { breached: false, count: 0 };
  }
}
