/**
 * The Slack HTTP client, with fetch mocked.
 *
 * Slack answers 200 with `{ok:false, error:"..."}` for real failures, so the
 * one thing that must never regress is that a 200 is not treated as success.
 * The other is pagination: `conversations.list` returns a cursor, and a client
 * that ignores it shows the user a truncated picker in which the channel they
 * want simply is not there — indistinguishable, from the UI, from not having
 * been invited to it.
 */
import { assertEquals, assertRejects } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { exchangeCode, listChannels, SlackError, FATAL_SLACK_ERRORS } from "../_shared/slack.ts";

type Reply = Record<string, unknown>;

/** Serve the queued replies in order, recording the requests that arrived. */
function mockFetch(replies: Reply[]) {
  const calls: Array<{ url: string; body: string }> = [];
  const original = globalThis.fetch;
  let i = 0;
  globalThis.fetch = ((url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? "") });
    const reply = replies[Math.min(i++, replies.length - 1)];
    return Promise.resolve(new Response(JSON.stringify(reply), { status: 200 }));
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

Deno.test("slack: exchangeCode maps the oauth.v2.access response", async () => {
  const mock = mockFetch([{
    ok: true,
    access_token: "xoxb-real",
    scope: "chat:write,channels:read",
    bot_user_id: "B1",
    team: { id: "T1", name: "Acme" },
    authed_user: { id: "U1" },
  }]);
  try {
    const tokens = await exchangeCode("cid", "csecret", "code-123", "https://example.test/cb");
    assertEquals(tokens.access_token, "xoxb-real");
    assertEquals(tokens.team_id, "T1");
    assertEquals(tokens.team_name, "Acme");
    assertEquals(tokens.bot_user_id, "B1");
    assertEquals(tokens.authed_user_id, "U1");
    // No rotation configured on the workspace: nothing to expire, nothing to refresh.
    assertEquals(tokens.expires_in, null);
    assertEquals(tokens.refresh_token, null);
    assertEquals(mock.calls[0].url.endsWith("/oauth.v2.access"), true);
  } finally {
    mock.restore();
  }
});

Deno.test("slack: a 200 carrying ok:false is an error, not a success", async () => {
  const mock = mockFetch([{ ok: false, error: "invalid_code" }]);
  try {
    const err = await assertRejects(
      () => exchangeCode("cid", "csecret", "bad", "https://example.test/cb"),
      SlackError,
    );
    assertEquals((err as SlackError).slackCode, "invalid_code");
  } finally {
    mock.restore();
  }
});

Deno.test("slack: listChannels follows the cursor and sorts by name", async () => {
  const mock = mockFetch([
    {
      ok: true,
      channels: [{ id: "C2", name: "product", is_private: false }],
      response_metadata: { next_cursor: "page2" },
    },
    {
      ok: true,
      channels: [{ id: "C1", name: "general", is_private: false }, { id: "C3", name: "secret-plans", is_private: true }],
      response_metadata: { next_cursor: "" },
    },
  ]);
  try {
    const channels = await listChannels("xoxb-real");
    assertEquals(channels.map((c) => c.id), ["C1", "C2", "C3"]);
    assertEquals(channels.find((c) => c.id === "C3")?.is_private, true);
    assertEquals(mock.calls.length, 2);
    // The second request must carry the cursor, or page two is page one again.
    assertEquals(mock.calls[1].body.includes("cursor=page2"), true);
  } finally {
    mock.restore();
  }
});

Deno.test("slack: listChannels stops at three pages rather than looping forever", async () => {
  // A cursor that never empties — a Slack bug or a workspace with thousands of
  // channels must not hang an edge function until it times out.
  const mock = mockFetch([{
    ok: true,
    channels: [{ id: "C1", name: "a", is_private: false }],
    response_metadata: { next_cursor: "always" },
  }]);
  try {
    const channels = await listChannels("xoxb-real");
    assertEquals(mock.calls.length, 3);
    assertEquals(channels.length, 3);
  } finally {
    mock.restore();
  }
});

Deno.test("slack: a revoked token is classified fatal, a missing channel is not", () => {
  // The delivery path flips needs_reconnect on the first set and clears the
  // channel on the second; conflating them either nags a healthy connection to
  // reconnect or silently never posts again.
  assertEquals(FATAL_SLACK_ERRORS.has("token_revoked"), true);
  assertEquals(FATAL_SLACK_ERRORS.has("invalid_auth"), true);
  assertEquals(FATAL_SLACK_ERRORS.has("channel_not_found"), false);
});
