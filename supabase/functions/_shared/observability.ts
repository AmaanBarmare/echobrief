/**
 * Backend error visibility.
 *
 * Sentry has been watching the frontend for months. The 44 edge functions —
 * where the pipeline, the billing webhook and every credential path live — had
 * nothing: an unhandled exception became a 500 with a stack trace in a log
 * nobody reads, and the first sign of trouble was a customer noticing their
 * meeting never processed, or the stuck-meeting cron catching it fifteen
 * minutes later. That cron only sees meetings, so a failure in billing, share
 * links, or calendar sync was invisible entirely.
 *
 * Three sinks, deliberately, because each covers the others' blind spot:
 *
 *   1. `console.error` with a structured prefix — always, and free. Survives
 *      even when the database is the thing that is broken.
 *   2. `function_errors` — a queryable history in Postgres. This is what makes
 *      "has this happened before?" answerable, and it is the evidence a SOC 2
 *      auditor asks for under monitoring. Errors only, never requests: the
 *      Disk IO budget is the binding constraint on this instance (see
 *      engineering-notes #22), and write churn is what depletes it.
 *   3. Sentry, if SENTRY_DSN is set. Optional on purpose — the module must not
 *      require a paid account to be useful, and a missing DSN is a no-op, not
 *      a second error inside the error handler.
 *
 * NOTHING IN HERE MAY THROW. An observability layer that can fail the request
 * it is observing is worse than no observability layer. Every sink is wrapped.
 */

/** Never let a credential reach a log line. Mirrors scripts/secret-log-check.mjs. */
const SECRET_PATTERN =
  /\b(eyJ[A-Za-z0-9_-]{10,}|sbp_[A-Za-z0-9]{8,}|sk-[A-Za-z0-9_-]{8,}|ya29\.[A-Za-z0-9._-]{8,}|1\/\/[A-Za-z0-9._-]{8,}|whsec_[A-Za-z0-9_-]{8,}|eb_live_[A-Za-z0-9_-]{8,}|ebs_live_[A-Za-z0-9_-]{8,}|v\d+\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,})\b/g;

export function redact(text: string): string {
  return text.replace(SECRET_PATTERN, "[redacted]");
}

export interface ErrorContext {
  /** The function reporting, e.g. "sarvam-webhook". */
  fn: string;
  /** Subject of the work, when there is one. Ids only — never content. */
  meetingId?: string;
  userId?: string;
  /** Anything else worth having at 3am. Keep it small and free of content. */
  extra?: Record<string, unknown>;
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

async function toSentry(err: unknown, ctx: ErrorContext): Promise<void> {
  const dsn = Deno.env.get("SENTRY_DSN");
  if (!dsn) return;
  // https://<key>@<host>/<project_id>
  const match = dsn.match(/^https:\/\/([^@]+)@([^/]+)\/(.+)$/);
  if (!match) return;
  const [, key, host, projectId] = match;
  const event = {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: new Date().toISOString(),
    platform: "javascript",
    level: "error",
    server_name: ctx.fn,
    environment: Deno.env.get("SENTRY_ENVIRONMENT") ?? "production",
    tags: { fn: ctx.fn },
    user: ctx.userId ? { id: ctx.userId } : undefined,
    extra: { meeting_id: ctx.meetingId, ...ctx.extra },
    exception: {
      values: [{
        type: err instanceof Error ? err.name : "Error",
        value: redact(messageOf(err)),
        stacktrace: err instanceof Error && err.stack
          ? { frames: [{ function: ctx.fn, context_line: redact(err.stack).slice(0, 2000) }] }
          : undefined,
      }],
    },
  };
  const envelope = [
    JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString() }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n");

  await fetch(
    `https://${host}/api/${projectId}/envelope/?sentry_key=${key}&sentry_version=7`,
    { method: "POST", headers: { "Content-Type": "application/x-sentry-envelope" }, body: envelope },
  );
}

async function toDatabase(err: unknown, ctx: ErrorContext): Promise<void> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return;
  // PostgREST directly rather than the JS client: this module is imported by
  // every function, and it must not drag a client dependency into ones that
  // never needed it.
  await fetch(`${url}/rest/v1/function_errors`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      function_name: ctx.fn,
      message: redact(messageOf(err)).slice(0, 2000),
      stack: err instanceof Error && err.stack ? redact(err.stack).slice(0, 8000) : null,
      meeting_id: ctx.meetingId ?? null,
      user_id: ctx.userId ?? null,
      context: ctx.extra ? JSON.parse(redact(JSON.stringify(ctx.extra))) : null,
    }),
  });
}

/**
 * Report an error to every configured sink. Never throws, never rejects.
 *
 * Await it where you can — the isolate may be frozen the moment the response
 * is returned, and an un-awaited report is a report that sometimes vanishes.
 */
export async function captureError(err: unknown, ctx: ErrorContext): Promise<void> {
  try {
    console.error(`[${ctx.fn}] ${redact(messageOf(err))}`, {
      meeting_id: ctx.meetingId,
      user_id: ctx.userId,
      ...(ctx.extra ?? {}),
    });
  } catch { /* a failed log must not mask the error being logged */ }

  const sinks = await Promise.allSettled([toDatabase(err, ctx), toSentry(err, ctx)]);
  for (const sink of sinks) {
    if (sink.status === "rejected") {
      // One line, no recursion: reporting a reporting failure through
      // captureError would loop.
      try {
        console.error(`[observability] sink failed for ${ctx.fn}: ${sink.reason}`);
      } catch { /* nothing left to do */ }
    }
  }
}

/**
 * Wrap a request handler so no exception escapes unreported.
 *
 * The response shape is deliberately unchanged from what these functions
 * already return on failure — a 500 with `{ error }` — so wrapping a function
 * is observability only and never a behaviour change its callers can see.
 */
export function withObservability(
  fn: string,
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    try {
      return await handler(req);
    } catch (err) {
      await captureError(err, { fn, extra: { method: req.method, path: new URL(req.url).pathname } });
      return new Response(
        JSON.stringify({ error: "Internal error" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  };
}
