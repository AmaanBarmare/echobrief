/**
 * Redirect-URI policy.
 *
 * Exact string match is the rule (OAuth 2.1 §7.12.2). The one exception is the
 * RFC 8252 loopback case: Claude Code binds an ephemeral port per session and
 * registers `http://localhost/callback` and `http://127.0.0.1/callback`, so the
 * port is ignored for those hosts and nothing else.
 */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function parse(uri: string): URL | null {
  try {
    return new URL(uri);
  } catch {
    return null;
  }
}

export function isLoopbackRedirectUri(uri: string): boolean {
  const url = parse(uri);
  return !!url && url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname === "::1" ? "[::1]" : url.hostname);
}

export function isRegistrableRedirectUri(uri: string): boolean {
  const url = parse(uri);
  if (!url || url.hash) return false;
  if (url.protocol === "https:") return true;
  return isLoopbackRedirectUri(uri);
}

export function redirectUriMatches(registered: readonly string[], candidate: string): boolean {
  if (registered.includes(candidate)) return true;
  if (!isLoopbackRedirectUri(candidate)) return false;
  const c = parse(candidate);
  if (!c) return false;
  return registered.some((r) => {
    if (!isLoopbackRedirectUri(r)) return false;
    const u = parse(r);
    return (
      !!u &&
      u.protocol === c.protocol &&
      u.hostname === c.hostname &&
      u.pathname === c.pathname &&
      u.search === c.search
    );
  });
}
