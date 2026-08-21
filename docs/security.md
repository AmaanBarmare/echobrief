# Security Model

> What protects what, where the boundaries are, and the two places where getting it
> wrong would leak another user's meeting content.

- [Threat model in one paragraph](#threat-model-in-one-paragraph)
- [Authentication](#authentication)
- [Row Level Security](#row-level-security)
- [Edge Function authentication](#edge-function-authentication)
- [Webhook verification](#webhook-verification)
- [Secrets](#secrets)
- [CORS and rate limiting](#cors-and-rate-limiting)
- [Data handling](#data-handling)

---

## Threat model in one paragraph

EchoBrief stores the full text of private conversations. The realistic threats are, in
order: (1) one authenticated user reading another user's meetings, (2) an unauthenticated
caller reaching an Edge Function that assumes it was called by the platform, (3) a
forged webhook injecting a fake transcript or status, and (4) credential leakage
between the two hosting accounts. Everything below exists for one of those four.

---

## Authentication

Supabase Auth issues JWTs. The frontend holds a session; `ProtectedRoute` gates every
authenticated page. New signups are currently **disabled** in production — access is
via the `waitlist` table and manual invitation.

**Password recovery** is the one flow with a routing subtlety. `isPasswordRecovery`
lives in `AuthContext` and is the single source of truth: it is set synchronously from
URL params on init — *before* Supabase clears the hash — and also on the
`PASSWORD_RECOVERY` auth event. Supabase's recovery token exchange auto-authenticates
the user, so any routing logic must check recovery state **before** checking for an
active session. Otherwise the user is redirected straight to the dashboard and never
sees the "set new password" form.

---

## Row Level Security

Every user-scoped table enforces `auth.uid() = user_id`. The anon key is shipped to
the browser by design — **RLS is the actual access control**, not a second layer.

`monitor_events` is service-role only, with no user-facing policy.

---

## Edge Function authentication

`verify_jwt` is declared per function in [`supabase/config.toml`](../supabase/config.toml).

**Only `chat-transcripts` sets `verify_jwt = true`.** Every other function either:

- verifies a webhook signature (`recall-webhook`),
- validates a callback token issued at job-creation time (`sarvam-webhook`),
- requires a shared bearer secret (`split-audio`),
- is called with the service-role key by another function, or
- reads and validates the caller's JWT in its own body.

This is a real attack surface and should be audited whenever a function is added.
The rule of thumb: **if the operation is user-scoped, use the caller's token and let
RLS do the work.** A service-role function that filters by `user_id` in application
code is one forgotten `.eq()` away from a cross-tenant leak.

`chat-transcripts` is the worked example. It builds its client from the caller's
`Authorization` header and the **anon** key:

```ts
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_ANON_KEY")!,
  { global: { headers: { Authorization: authHeader } } },
);
```

Chat is the one feature where a scoping bug hands one user another user's private
transcripts, so the guarantee belongs in Postgres rather than in code.

---

## Webhook verification

| Source | Verification |
|---|---|
| Recall.ai | Signature checked against the **raw body** before `JSON.parse`. Parsing first would allow a body that verifies but deserialises differently. |
| Sarvam | `auth_token` supplied in the `callback` object at job creation and checked on receipt. |
| `split-audio` | `Authorization: Bearer ${SPLIT_AUDIO_SECRET}`. Returns 401 with no auth, 400 on an empty body — both asserted by a harness scenario, because a `500` there means the Vercel env vars went missing. |

Webhooks are also **idempotent by construction**: `sarvam-webhook` skips meetings
already `completed`, and `saveInsights` only inserts. A replayed callback cannot
produce a duplicate transcript or a second summary email.

---

## Secrets

Credentials live in three places and must agree:

```
.env  ──►  Supabase secrets  (Edge Functions)
  └────►  Vercel project env (SPA + split-audio)
```

`.env` is the source of truth. Rotating a key means propagating to **both** targets
and then verifying — not assuming. Supabase secret digests are `sha256`, so a
deployed secret can be checked against `.env` without overwriting it.

`SPLIT_AUDIO_SECRET` must be byte-identical on both sides or the splitter 401s and the
pipeline silently degrades to the empty-transcript path.

---

## CORS and rate limiting

[`_shared/cors.ts`](../supabase/functions/_shared/cors.ts) enforces an **origin
allowlist** rather than `*`, and handles preflight centrally.

[`_shared/rate-limit.ts`](../supabase/functions/_shared/rate-limit.ts) provides an
in-memory sliding-window limiter with per-endpoint configs in `RATE_LIMITS`.

> **Limitation worth stating plainly:** the limiter is per-isolate and in-memory. It
> throttles a single caller hitting a warm instance; it is not a distributed rate
> limit and will not stop a determined distributed abuser. Treat it as a guard rail,
> not a control.

---

## Data handling

- **Audio** is archived to the `recordings` bucket and **deleted after 30 days** by
  the `prune-recordings` cron (7 days when the bucket is near cap). The transcript and
  insights are the product; the mp3 is an archive.
- **Transcripts and insights** are retained indefinitely and are what chat retrieves.
- **Third parties that see meeting content:** Recall.ai (audio + its own transcript),
  Sarvam AI (audio chunks), OpenAI (transcript text for insights, chat, Whisper audio),
  Resend (summary email bodies).
- **Google OAuth tokens** are stored in `user_oauth_tokens` under RLS and revoked by
  `disconnect-google`.

Deleting a meeting removes the row; cascading behaviour for transcripts and insights
follows the foreign keys declared in the migrations.
