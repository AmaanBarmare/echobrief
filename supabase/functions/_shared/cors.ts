// Shared CORS configuration for all Edge Functions
// Only allows requests from the production app and local development

const ALLOWED_ORIGINS = [
  "https://echobrief.in",
  "https://www.echobrief.in",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:8080",
];

// Vercel preview deployments for THIS project only.
//
// This used to be `origin.endsWith(".vercel.app")`, which trusts a namespace we
// do not own: anyone can deploy to vercel.app and be handed a permissive
// Access-Control-Allow-Origin. Not directly exploitable — a cross-origin call
// still needs the user's bearer token — but it is a defence layer given away
// for convenience an exact pattern provides just as well.
//
// Vercel preview hosts are `<project>-<hash>-<scope>.vercel.app` and
// `<project>-git-<branch>-<scope>.vercel.app`, so anchoring on the project
// name plus a separator is enough to exclude everyone else's deployments.
const VERCEL_PREVIEW = /^https:\/\/echobrief-[a-z0-9-]+\.vercel\.app$/;

export function getCorsHeaders(origin: string | null): Record<string, string> {
  const isAllowed = origin && (
    ALLOWED_ORIGINS.includes(origin) ||
    VERCEL_PREVIEW.test(origin)
  );
  const allowedOrigin = isAllowed ? origin : ALLOWED_ORIGINS[0];
  
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

export function handleCorsPrelight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    const origin = req.headers.get("origin");
    return new Response(null, { headers: getCorsHeaders(origin) });
  }
  return null;
}
