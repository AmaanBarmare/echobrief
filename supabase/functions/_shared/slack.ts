/**
 * Slack client and message builder.
 *
 * Slack was in this product once and was removed on 2026-08-20 because it was
 * never really built: a single global SLACK_BOT_TOKEN posted for everyone, the
 * UI asked for a raw channel ID, and Disconnect did nothing. The token now
 * belongs to a per-user connection row, sealed at rest, and everything below
 * takes it as an argument — there is deliberately no module-level token to fall
 * back on, because that is precisely how one workspace's token came to serve
 * every customer.
 *
 * WHAT MAY BE POSTED. A Slack channel is a room full of people, which makes it
 * the least forgiving delivery surface in the product. Only the summary,
 * decisions and action items go out — the fields the pipeline already computes
 * from the MEETING ZONE ONLY (`_shared/zones.ts`), so internal pre/post-meeting
 * speech cannot reach it. The transcript never goes to Slack, and neither does
 * anything derived from the internal zones: coaching, facts, attendee emails.
 */

const SLACK_API = "https://slack.com/api";

export interface SlackTokens {
  access_token: string;
  refresh_token?: string | null;
  expires_in?: number | null;
  scope?: string | null;
  team_id: string;
  team_name?: string | null;
  bot_user_id?: string | null;
  authed_user_id?: string | null;
}

export class SlackError extends Error {
  constructor(readonly slackCode: string, message: string) {
    super(message);
    this.name = "SlackError";
  }
}

/**
 * Slack answers 200 with `{ok: false, error: "..."}` for real failures, so the
 * HTTP status tells you almost nothing. Every call goes through here.
 */
async function call(
  method: string,
  token: string | null,
  body: Record<string, unknown>,
  form = false,
): Promise<Record<string, any>> {
  const headers: Record<string, string> = {
    "Content-Type": form
      ? "application/x-www-form-urlencoded"
      : "application/json; charset=utf-8",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${SLACK_API}/${method}`, {
    method: "POST",
    headers,
    body: form
      ? new URLSearchParams(body as Record<string, string>).toString()
      : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!data?.ok) {
    throw new SlackError(
      String(data?.error ?? `http_${res.status}`),
      `Slack ${method} failed: ${data?.error ?? res.status}`,
    );
  }
  return data;
}

/** Exchange the OAuth code for a bot token. */
export async function exchangeCode(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
): Promise<SlackTokens> {
  const data = await call("oauth.v2.access", null, {
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  }, true);

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? null,
    expires_in: data.expires_in ?? null,
    scope: data.scope ?? null,
    team_id: data.team?.id ?? "",
    team_name: data.team?.name ?? null,
    bot_user_id: data.bot_user_id ?? null,
    authed_user_id: data.authed_user?.id ?? null,
  };
}

/**
 * Channels the bot can post to. Public channels plus any private channel the
 * bot has been invited to — Slack only returns private channels the token can
 * actually see, so this list is exactly "where this will work", which is the
 * whole point of a picker over a pasted ID.
 */
export async function listChannels(
  token: string,
  limit = 200,
): Promise<Array<{ id: string; name: string; is_private: boolean }>> {
  const out: Array<{ id: string; name: string; is_private: boolean }> = [];
  let cursor = "";
  // Bounded: three pages is 600 channels, past which a picker is the wrong UI
  // anyway and the user should be typing a name.
  for (let page = 0; page < 3; page++) {
    const data = await call("conversations.list", token, {
      types: "public_channel,private_channel",
      exclude_archived: true,
      limit,
      ...(cursor ? { cursor } : {}),
    }, true);
    for (const c of data.channels ?? []) {
      out.push({ id: c.id, name: c.name, is_private: !!c.is_private });
    }
    cursor = data.response_metadata?.next_cursor ?? "";
    if (!cursor) break;
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function truncate(text: string, max: number): string {
  const clean = (text ?? "").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trimEnd() + "…";
}

/** Slack rejects any single text block over 3000 characters. */
const BLOCK_LIMIT = 3000;

function asLines(items: unknown, max: number): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        const task = String(o.task ?? o.text ?? o.title ?? "").trim();
        const owner = String(o.owner ?? "").trim();
        const due = String(o.due_date ?? o.due ?? "").trim();
        if (!task) return "";
        const suffix = [owner, due].filter(Boolean).join(", ");
        return suffix ? `${task} — ${suffix}` : task;
      }
      return "";
    })
    .filter(Boolean)
    .slice(0, max);
}

/**
 * Build the Slack message. Pure, so it is unit-tested against the shapes the
 * pipeline actually emits — action items have been a string in some meetings
 * and an object in others since the two-pass rewrite, and a delivery path that
 * assumes one of them posts "[object Object]" into somebody's team channel.
 */
export function buildSummaryMessage(
  meeting: { id: string; title?: string | null },
  insights: Record<string, any>,
  appUrl: string,
): { text: string; blocks: unknown[] } {
  const title = truncate(String(meeting.title || "Meeting"), 150);
  const summary = truncate(
    String(insights?.summary_short || insights?.summary || "").trim(),
    BLOCK_LIMIT - 100,
  );
  const actions = asLines(insights?.action_items, 10);
  const decisions = asLines(insights?.decisions, 10);
  const link = `${appUrl.replace(/\/$/, "")}/meetings/${meeting.id}`;

  const blocks: unknown[] = [
    {
      type: "header",
      text: { type: "plain_text", text: truncate(title, 150), emoji: true },
    },
  ];

  if (summary) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: summary },
    });
  }

  if (decisions.length) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: truncate(
          `*Decisions*\n${decisions.map((d) => `• ${d}`).join("\n")}`,
          BLOCK_LIMIT,
        ),
      },
    });
  }

  if (actions.length) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: truncate(
          `*Action items*\n${actions.map((a) => `• ${a}`).join("\n")}`,
          BLOCK_LIMIT,
        ),
      },
    });
  }

  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: `<${link}|Open in EchoBrief>` }],
  });

  // `text` is the notification preview and the accessible fallback; a message
  // with blocks but no text shows as a blank line in the sidebar.
  const text = summary ? `${title} — ${truncate(summary, 200)}` : title;
  return { text, blocks };
}

export async function postMessage(
  token: string,
  channel: string,
  message: { text: string; blocks: unknown[] },
): Promise<{ ts: string }> {
  const data = await call("chat.postMessage", token, {
    channel,
    text: message.text,
    blocks: message.blocks,
    unfurl_links: false,
  });
  return { ts: String(data.ts ?? "") };
}

/**
 * Errors that mean the connection is dead rather than the request being bad.
 * These flip `needs_reconnect` so the UI can ask for a reconnect instead of
 * failing quietly forever.
 */
export const FATAL_SLACK_ERRORS = new Set([
  "invalid_auth",
  "token_revoked",
  "account_inactive",
  "token_expired",
  "not_authed",
]);

/** Errors the user can fix in Slack without reconnecting. */
export const CHANNEL_ERRORS = new Set([
  "channel_not_found",
  "not_in_channel",
  "is_archived",
  "restricted_action",
]);

/**
 * Revoke the bot token in Slack.
 *
 * Disconnect deletes our row either way — the old integration's Disconnect
 * button never wrote to the database at all, and "connected" must mean "a row
 * exists" and nothing else. This is the courtesy half: without it the app stays
 * installed in the workspace with a live token that nothing will ever use.
 * Best-effort by design; the caller must not fail a disconnect on it.
 */
export async function revokeToken(token: string): Promise<void> {
  await call("auth.revoke", token, {}, true);
}
