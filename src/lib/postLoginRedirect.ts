/**
 * Where to send the user after they sign in, when they arrived at a page that
 * needed a session. sessionStorage, not the URL, so the value cannot be
 * planted by a link — and only same-origin paths are ever honoured.
 */
const KEY = 'eb_post_login_redirect';

export function rememberPostLoginRedirect(path: string): void {
  if (!path.startsWith('/') || path.startsWith('//')) return;
  try { sessionStorage.setItem(KEY, path); } catch { /* private mode */ }
}

export function consumePostLoginRedirect(): string | null {
  try {
    const value = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return value && value.startsWith('/') && !value.startsWith('//') ? value : null;
  } catch {
    return null;
  }
}
