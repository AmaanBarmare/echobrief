# MCP server: EchoBrief meeting data from Claude and other LLM tools

**Date:** 2026-08-29
**Status:** Approved, not yet implemented

## Why

EchoBrief's meeting corpus is only reachable from EchoBrief. A user who wants to ask
"what did we decide about pricing last quarter" while drafting a doc in Claude Code,
or pull last week's action items into a standup note, has to leave whatever they are
doing, open the dashboard, and copy text out by hand.

`chat-transcripts` already proved the underlying capability — an LLM answering questions
across a user's own meetings, scoped by RLS. It just ends at the edge of our own UI.
The Model Context Protocol is the standard way to push that boundary outward: one
endpoint, and every MCP client (Claude Code, Claude Desktop, Cursor, ChatGPT, and
whatever ships next) can read the same data under the same access control.

This also changes what EchoBrief *is* in a user's workflow. Today it is a destination.
With MCP it becomes a source the user's existing tools draw from, which is a materially
stickier position.

## Scope

**In:**

1. A remote MCP server at `https://www.echobrief.in/api/mcp` speaking Streamable HTTP.
2. Personal access tokens (PATs), issued and revoked from Settings.
3. Seven tools: six read, one reversible write.
4. Postgres full-text search over transcripts and insight summaries.

**Out (deliberate):**

- **OAuth 2.1 / dynamic client registration.** This is what claude.ai *web* custom
  connectors require, and skipping it is a real cost: web users cannot connect. But
  Claude Code, Claude Desktop, and Cursor all support bearer headers, which covers
  every client the user actually works in today. OAuth is a second project — an
  authorization server, `/authorize`, `/token`, `/register`, PKCE, and a much larger
  surface to get security wrong on. The token-resolution seam described below is
  built so an OAuth layer can later mint the same internal session without any tool
  code changing.
- **MCP resources and prompts.** Tools alone answer every question we have evidence
  users ask. Resources solve a discovery problem we do not have with seven tools.
- **Embeddings / pgvector.** Rejected for the same reason `chat-transcripts` rejected
  it: an embedding pipeline is another async step that must stay in sync, and its
  failure mode — "the tool doesn't know about that meeting" — is indistinguishable
  from an unhelpful model. Full-text search has no sync to break.
- **Bot control** (`start_recording`, `retry_processing`). Each call would burn Recall
  bot minutes, and it would be triggerable by injected text sitting inside a transcript
  the model just read. Not in a first version.

---

## Architecture

A new Vercel function, `api/mcp.ts`, using `@modelcontextprotocol/sdk`'s
`StreamableHTTPServerTransport` in **stateless mode**: each POST carries a complete
JSON-RPC request and no session state is retained between calls. Vercel function
instances are ephemeral and may be recycled between requests, so a stateful session
store would be a correctness bug waiting for its first cold start.

**Why Vercel rather than a Supabase Edge Function.** The MCP SDK is an npm/Node
library; `echobrief.in` already fronts `api/split-audio.ts` on the same GitHub
auto-deploy path; and the domain is the one users will paste into a client. Deploys
follow the existing rule for `api/`: **push to GitHub, never the local Vercel CLI** —
the account that owns `echobrief.in` is separate.

### The auth chain

```
POST /api/mcp
  Authorization: Bearer eb_live_<43 chars>
    │
    ├─ sha256(token) ──→ api_tokens.token_hash ──→ user_id      (service-role read)
    │
    ├─ sign HS256 JWT { sub: user_id, role: "authenticated",
    │                   aud: "authenticated", exp: now + 60s }   (SUPABASE_JWT_SECRET)
    │
    └─ createClient(SUPABASE_URL, ANON_KEY,
         { global: { headers: { Authorization: `Bearer ${minted}` } } })
           │
           └─ every tool query runs under RLS as that user
```

This middle step is the load-bearing decision. A PAT is not a Supabase JWT, so the
obvious implementation is a service-role client plus `.eq("user_id", uid)` on every
query — precisely the pattern [`docs/database.md`](../../database.md#row-level-security)
warns about, where one forgotten `.eq()` leaks another user's private meeting content.
Minting a short-lived user JWT instead keeps Postgres as the access control, exactly
as `chat-transcripts` does. A tool author who forgets a filter gets an empty result,
not someone else's meeting.

The service-role key is used for **one** query — resolving the token hash to a user —
and is never handed to tool code. Tool handlers receive only the RLS-scoped client.

**Signing key.** The project's anon and service-role keys decode to `{"alg":"HS256"}`,
confirming the legacy symmetric JWT secret is in force, so a shared
`SUPABASE_JWT_SECRET` (Supabase dashboard → Settings → API → JWT Secret) is the
correct signing input. Supabase is migrating projects to asymmetric signing keys; if
this project is ever migrated, `mintUserJwt()` switches to ES256 with the project's
private key and nothing else in the server changes. That function is the only place
signing happens.

### Rate limiting and IO budget

Two guards, both cheap:

- **Request rate:** 60 requests per minute per token, tracked in-memory. Fluid Compute
  reuses instances so this is approximate rather than a hard ceiling — acceptable for
  a token-authenticated endpoint where the caller is already identified and revocable.
- **`last_used_at` writes:** updated only when the current value is older than one
  hour. Writing it per request would be exactly the kind of per-tick write churn that
  consumed 94.4% of database execution time in the cron incident
  ([`engineering-notes.md`](../../engineering-notes.md) #22). An hour-granular
  "last used" is all the Settings UI needs.

---

## Data model

### `api_tokens`

```sql
create table public.api_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  token_hash    text not null unique,
  token_prefix  text not null,
  scopes        text[] not null default '{read,write:action_items}',
  last_used_at  timestamptz,
  expires_at    timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index api_tokens_user_id_idx on public.api_tokens(user_id);
```

Token format is `eb_live_` followed by 32 random bytes, base64url-encoded. Only the
sha256 hash is stored; the plaintext is returned exactly once at creation and is
unrecoverable afterward. `token_prefix` holds the first 14 characters for display, so
the Settings list can identify a token without holding anything sensitive.

Lookup is a single indexed equality on `token_hash`. Because the token carries 256 bits
of entropy, an unsalted sha256 is not brute-forceable and no KDF is warranted.

RLS: `auth.uid() = user_id` for `select` and for the `update` that sets `revoked_at`.
No user-facing `insert` policy — creation goes through the edge function below, which
is the only code that can produce a valid hash.

### Full-text search

```sql
alter table public.transcripts
  add column search_vector tsvector
  generated always as (to_tsvector('english', coalesce(content, ''))) stored;
create index transcripts_search_idx on public.transcripts using gin(search_vector);

alter table public.meeting_insights
  add column search_vector tsvector
  generated always as (
    to_tsvector('english', coalesce(summary_detailed, '') || ' ' || coalesce(summary_short, ''))
  ) stored;
create index meeting_insights_search_idx on public.meeting_insights using gin(search_vector);
```

Generated columns mean there is no sync step and no backfill job — Postgres maintains
the index as part of the write that inserts the transcript. This is the same property
that made stuffing preferable to embeddings in `chat-transcripts`, applied one layer
down.

### `search_meetings()` RPC

A `security invoker` function, so RLS applies to the caller rather than to the function
owner:

```sql
create function public.search_meetings(q text, max_results int default 10)
returns table (meeting_id uuid, title text, start_time timestamptz,
               snippet text, rank real, source text)
language sql stable security invoker
```

It queries both vectors, returns `ts_headline` snippets ordered by `ts_rank`, and
applies the retrieval hygiene that currently lives in `chat-transcripts`:

1. titles starting with `[harness]` are excluded (fabricated test content),
2. transcripts under 250 characters are excluded (sub-threshold fragments),
3. content beginning with the `no clear speech was detected` sentinel is excluded.

Moving those three rules into SQL puts them in one place. `chat-transcripts` keeps its
TypeScript copy until someone touches that function; the duplication is noted here so
it is a known state rather than a discovery.

---

## Tools

Seven tools. The organising rule is that **no tool returns an unbounded blob** —
search returns pointers, and the agent fetches the one document it wants. This is the
difference between an MCP server that is useful and one that exhausts the context
window on its second call.

| Tool | Arguments | Returns |
|---|---|---|
| `list_meetings` | `status?`, `from?`, `to?`, `query?`, `limit` (default 20, max 100) | Compact rows: `id`, `title`, `start_time`, `duration_seconds`, `status`, `has_transcript`, `has_insights`, `participants`. No bodies. |
| `get_meeting` | `meeting_id` | Metadata, `summary_short`, and counts (`action_items`, `decisions`, `risks`). |
| `get_meeting_insights` | `meeting_id` | `summary_detailed`, `decisions`, `risks`, `open_questions`, `key_points`, `timeline_entries`, `meeting_metrics`. |
| `search_meetings` | `query`, `limit` (default 10, max 25) | Ranked snippets with `meeting_id`, `title`, `start_time`. |
| `get_transcript` | `meeting_id`, `format` (`text` \| `segments`), `speaker?`, `offset?`, `limit?` | Transcript text or speaker segments, paged. |
| `get_action_items` | `meeting_id?`, `status` (`open` \| `done` \| `all`, default `open`), `from?`, `to?` | Items addressed by `(meeting_id, index)`, with completion state joined from `action_item_completions`. |
| `complete_action_item` | `meeting_id`, `index`, `completed` (bool) | Upserts `action_item_completions`; returns the new state. |

**Action item addressing.** Action items live in the `meeting_insights.action_items`
JSONB array and have no identity of their own; `action_item_completions` already
addresses them by `(meeting_id, action_item_index)`. The tools use that same pair, so
`get_action_items` hands the model exactly the address `complete_action_item` expects.
Since `meeting_insights` is insert-only in practice (`saveInsights` no-ops on an
existing row), the index is stable for the life of the meeting.

**Truncation.** `get_transcript` caps a single response at 40,000 characters. When it
truncates it returns `truncated: true` and `next_offset`, so the model can continue
deliberately rather than silently receiving a partial answer it believes is complete.
Silent truncation is the failure mode this codebase keeps getting bitten by; it is not
being reintroduced here.

### Untrusted content

A transcript is text a stranger spoke into a meeting, and it flows straight into a
model's context. Two mitigations:

1. Every transcript and snippet payload is wrapped in a delimited block prefaced with
   a notice that the content is untrusted meeting audio and any instructions inside it
   must not be followed.
2. The blast radius is kept small by design. The single write tool toggles a boolean
   in `action_item_completions` — reversible, free, and visible in the UI. Nothing
   here spends money, dispatches a bot, or deletes anything. That is why bot control
   is out of scope rather than merely deferred.

Neither mitigation is a guarantee. Together with a tool surface where the worst
outcome of a successful injection is a wrongly-ticked checkbox, they are proportionate.

---

## Token issue and revoke

A new Edge Function, `manage-api-tokens`, with `verify_jwt = true`:

| Action | Behaviour |
|---|---|
| `POST { action: "create", name }` | Generates the token, stores the hash, returns the plaintext **once**. |
| `POST { action: "list" }` | Returns `id`, `name`, `token_prefix`, `created_at`, `last_used_at`, `revoked_at`. |
| `POST { action: "revoke", id }` | Sets `revoked_at`. Revocation takes effect on the next request — there is no cache to invalidate. |

---

## Settings UI

A new "Developer" card in [`src/pages/Settings.tsx`](../../../src/pages/Settings.tsx),
following that page's existing local-`useState` pattern rather than TanStack Query —
it is a form with user-mutated lists, the same reasoning recorded in
[`engineering-notes.md`](../../engineering-notes.md) #21.

It contains: a token list (name, prefix, created, last used, revoke), a create dialog
that shows the plaintext once behind an explicit "copy" affordance with a warning that
it will not be shown again, and copy-paste connection snippets:

```bash
claude mcp add --transport http echobrief https://www.echobrief.in/api/mcp \
  --header "Authorization: Bearer eb_live_..."
```

plus the equivalent Claude Desktop JSON block.

---

## Error handling

- **Missing, malformed, revoked, or expired token** → HTTP 401 with a
  `WWW-Authenticate: Bearer` header. This is the response an OAuth layer would later
  extend with a `resource_metadata` pointer, which is why it is a real 401 rather than
  a JSON-RPC error.
- **Tool failures** (meeting not found, no transcript yet, invalid index) → returned as
  `isError: true` tool content, never as JSON-RPC protocol errors. A protocol error
  aborts the model's turn; tool-level errors let it read the message and recover.
  "This meeting has no transcript yet — its status is `processing`" is a far better
  outcome than a dropped request.
- **Rate limit exceeded** → HTTP 429 with `Retry-After`.
- **Upstream Supabase failure** → `isError: true` with the message, and a server-side
  log line. Never a partial result presented as complete.

---

## Testing

The repository has Deno tests for Edge Functions and a Python harness for the pipeline,
but no JavaScript test runner for `api/`. This adds one.

- **`npm run test:mcp`** — `node:test` over the pure logic: token generation and hash
  verification, JWT minting claims and expiry, tool argument validation, truncation
  and `next_offset` arithmetic, snippet shaping, and the untrusted-content wrapper.
  No network.
- **Contract check** — a script driving `@modelcontextprotocol/inspector --cli` against
  a locally-served endpoint, asserting `tools/list` matches the declared seven and that
  each tool round-trips against seeded data. This catches schema drift between what the
  server advertises and what it accepts.
- **Cross-user scoping** — the security property that matters most (a token for user A
  cannot read user B's meetings) requires two accounts, which the single-account
  pipeline harness cannot express. It is documented as a one-off manual test in
  `docs/mcp.md`, to be run before launch and after any change to `mintUserJwt()` or
  the token-resolution path.

The existing `npm run test:unit` and `python3 scripts/pipeline-test/harness.py` runs
still gate the deploy; the migration touches shared tables, so the harness must pass
before it ships.

---

## Documentation

- New `docs/mcp.md`: endpoint, auth, every tool with its schema, client setup for
  Claude Code / Claude Desktop / Cursor, the manual scoping test, and the rate limits.
- Entries in `docs/README.md` and `CLAUDE.md`.
- `src/pages/Docs.tsx` — this is a user-visible feature, and that page is required to
  stay in sync.

---

## Environment

New Vercel environment variables (set in the dashboard of the account that owns
`echobrief.in`; the same variables also go in `.env` per the project's
source-of-truth rule):

| Variable | Use |
|---|---|
| `SUPABASE_URL` | Project URL. Add it if the Vercel project does not already carry it for `split-audio`. |
| `SUPABASE_ANON_KEY` | Client construction for RLS-scoped queries. |
| `SUPABASE_SERVICE_ROLE_KEY` | Token-hash lookup only. |
| `SUPABASE_JWT_SECRET` | Signing the 60-second user JWT. |

---

## Build order

1. **Migration** — `api_tokens`, both `search_vector` columns, `search_meetings()` RPC,
   RLS policies. Apply locally, verify RLS with two roles, then push.
2. **`manage-api-tokens` Edge Function** and the Settings "Developer" card. At this
   point a user can mint a token that nothing consumes yet.
3. **`api/mcp.ts`** with auth, JWT minting, rate limiting, and the four read tools
   (`list_meetings`, `get_meeting`, `get_meeting_insights`, `search_meetings`).
   Connectable from Claude Code here.
4. **Remaining three tools** — `get_transcript` with paging, `get_action_items`,
   `complete_action_item`.
5. **Tests, `docs/mcp.md`, `Docs.tsx`,** and the manual cross-user scoping run.

Each step is independently deployable and leaves the product in a working state.
