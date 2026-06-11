/** Shared fetch-mocking helpers for the unit harness. */

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Replace globalThis.fetch with a URL-router. Returns a restore function.
 * Router receives the URL string; throwing inside it fails the test loudly.
 */
export function mockFetch(
  router: (url: string, init?: RequestInit) => Response | Promise<Response>,
): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: Request | URL | string, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    return Promise.resolve(router(url, init));
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}
