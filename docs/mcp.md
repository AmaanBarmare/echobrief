# MCP server

EchoBrief exposes a user's own meetings to Claude Code, Claude Desktop, Cursor and any
other MCP client through one endpoint:

```
https://www.echobrief.in/api/mcp
```

- [Connecting](#connecting)
- [Authentication](#authentication)
- [Tools](#tools)
- [Limits](#limits)
- [Untrusted content](#untrusted-content)
- [Testing](#testing)

---

## Connecting

Mint a token at **Settings → Developer**. It is shown once.

**Claude Code:**

```bash
claude mcp add --transport http echobrief https://www.echobrief.in/api/mcp \
  --header "Authorization: Bearer eb_live_..."
```

**Claude Desktop / Cursor** — in the MCP config file:

```json
{
  "mcpServers": {
    "echobrief": {
      "type": "http",
      "url": "https://www.echobrief.in/api/mcp",
      "headers": { "Authorization": "Bearer eb_live_..." }
    }
  }
}
```

claude.ai **web** custom connectors require OAuth, which this server does not implement.
Everything else — Claude Code, Claude Desktop, Cursor — supports bearer headers and works.

---

## Authentication

A personal access token is `eb_live_` plus 32 random bytes base64url. Only its sha256
digest is stored; the plaintext is unrecoverable after creation.

The request chain:

1. `sha256(token)` → `api_tokens.token_hash` → `user_id` (the only service-role query).
2. Mint a 60-second Supabase user JWT with `sub = user_id`, `role = authenticated`.
3. Build the Supabase client with that JWT. **Every tool query runs through RLS.**

That middle step is the security design. A PAT is not a Supabase credential, so the
obvious implementation is a service-role client plus a `user_id` filter on every query —
the pattern [`database.md`](database.md#row-level-security) warns about, where one
forgotten filter leaks another user's meetings. Minting a user JWT means a tool that
forgets a filter returns nothing rather than somebody else's data.

The project signs with the legacy symmetric secret (its anon and service-role keys decode
to `alg: HS256`), so `SUPABASE_JWT_SECRET` is the signing input. If the project is ever
migrated to asymmetric signing keys, `mintUserJwt()` in
[`api/_mcp/jwt.ts`](../api/_mcp/jwt.ts) is the only place that changes.

Revocation takes effect on the next request; there is no cache to invalidate.

---

## Tools

| Tool | Arguments | Returns |
|---|---|---|
| `list_meetings` | `status?`, `from?`, `to?`, `query?`, `limit` (≤100) | Metadata rows. No bodies. |
| `get_meeting` | `meeting_id` | Metadata, `summary_short`, counts |
| `get_meeting_insights` | `meeting_id` | Full analysis and metrics |
| `search_meetings` | `query`, `limit` (≤25) | Ranked snippets with `meeting_id` |
| `get_transcript` | `meeting_id`, `format`, `speaker?`, `offset?`, `limit?` | Transcript text or segments, paged |
| `get_action_items` | `meeting_id?`, `status`, `from?`, `to?`, `limit` | Items addressed `(meeting_id, index)` |
| `complete_action_item` | `meeting_id`, `index`, `completed` | The new completion state |

**No tool returns an unbounded blob.** `search_meetings` returns pointers and the agent
fetches one document. `get_transcript` caps a response at 40,000 characters and reports
`truncated: true` with a `next_offset` — it never truncates silently.

Search is Postgres full-text over `GENERATED` `tsvector` columns on `transcripts.content`
and `meeting_insights.summary_detailed`, through the `SECURITY INVOKER` RPC
`search_meetings()`. Generated columns mean no sync step and no backfill — the same
reasoning that kept [chat](chat-and-analytics.md) off embeddings.

Action items have no identity of their own — they live in the `meeting_insights.action_items`
JSONB array — so they are addressed by the `(meeting_id, index)` pair that
`action_item_completions` already uses. `complete_action_item` validates the index against
the real array, so a hallucinated or injected index fails loudly rather than writing a row
that addresses nothing.

Failures come back as `isError: true` tool content, never as JSON-RPC protocol errors: a
protocol error aborts the model's turn, while a tool error lets it read the message and
recover.

---

## Limits

- 60 requests per minute per token, in-memory per Vercel instance — approximate rather
  than a hard global cap, which is the right trade for a caller who is already
  identified and revocable.
- 10 active tokens per user.
- `last_used_at` is written at most once per token per hour. A write per request would
  be exactly the churn that consumed 94.4% of database execution time in the cron
  incident ([`engineering-notes.md`](engineering-notes.md) #22).

---

## Untrusted content

A transcript is words a stranger spoke into a meeting, flowing straight into a model's
context. Two mitigations, neither a guarantee:

1. Transcript and snippet payloads are wrapped in a delimited block prefaced with a
   notice that the content is untrusted and instructions inside it are not directives.
   A body that tries to close the block early, or a label that tries to escape the
   attribute, is neutralised.
2. The blast radius is small by construction. The only write toggles a boolean in
   `action_item_completions` — reversible, free, visible in the UI. Nothing here spends
   money, dispatches a bot, or deletes anything. That is why bot control is out of
   scope rather than merely deferred.

---

## Testing

```bash
npm run test:mcp            # tsc over api/ + node:test unit tests
MCP_TOKEN=eb_live_... npm run test:mcp:contract
```

`npm run test:mcp` also typechecks `api/` via `tsconfig.api.json`, which `npm run build`
does not do — Vite strips types with esbuild without checking them.

One consequence of running under Node's strip-only type stripping: **TypeScript parameter
properties are not allowed in `api/_mcp/`.** esbuild on Vercel accepts them, so the code
would deploy fine and only fail when something tried to test it. Write a plain field and
assign it in the constructor.

### Manual cross-user scoping test

The property that matters most — a token for user A cannot read user B's meetings —
needs two accounts, which the single-account pipeline harness cannot express. **Run this
before launch and after any change to `mintUserJwt()` or `api/_mcp/auth.ts`.**

1. Mint a token as user A. Note a `meeting_id` belonging to user **B** (from the
   Supabase dashboard).
2. As user A's token, call each of these against B's meeting id:

```bash
for TOOL in get_meeting get_meeting_insights get_transcript; do
  curl -s -X POST https://www.echobrief.in/api/mcp \
    -H "Authorization: Bearer $TOKEN_A" -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"$TOOL\",\"arguments\":{\"meeting_id\":\"$B_MEETING_ID\"}}}"
done
```

3. **Every one must return `isError: true`** with a not-found message. Any response
   containing B's content is a critical failure — revoke all tokens and stop.
4. Call `complete_action_item` against B's meeting id. It must also fail.
