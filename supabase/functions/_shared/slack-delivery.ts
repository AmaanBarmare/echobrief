/**
 * Post a finished meeting's summary to the owner's Slack channel.
 *
 * Called from `afterInsightsSaved`, which runs on EVERY completion path —
 * Sarvam, the Whisper fallback, and regeneration. That last one is why this
 * claims a row in `slack_deliveries` before calling Slack: regenerating
 * insights on a meeting from three weeks ago must not re-post it to the team
 * channel, and Sarvam has been observed replaying a single callback three
 * times. A duplicate email is a minor annoyance in one inbox; a duplicate Slack
 * message is visible to everyone in the room and cannot be unsent.
 *
 * NEVER THROWS. Delivery is the last step of a meeting that has already
 * succeeded — a Slack outage, a revoked token or a deleted channel must not
 * fail the meeting or lose the insights that are already saved.
 */
import {
  buildSummaryMessage,
  postMessage,
  SlackError,
  FATAL_SLACK_ERRORS,
  CHANNEL_ERRORS,
} from "./slack.ts";
import { openConnectionTokens } from "./oauth-tokens.ts";

export async function deliverToSlack(
  supabase: any,
  meeting: Record<string, any>,
  insights: Record<string, any>,
): Promise<{ posted: boolean; reason?: string }> {
  try {
    const { data: rawConn } = await supabase
      .from("slack_connections")
      .select("*")
      .eq("user_id", meeting.user_id)
      .maybeSingle();

    if (!rawConn) return { posted: false, reason: "not_connected" };
    // A channel is chosen separately from connecting the workspace. Until one
    // is picked there is no safe default — posting to #general uninvited is
    // exactly the kind of surprise that gets an app removed.
    if (!rawConn.channel_id) return { posted: false, reason: "no_channel" };
    if (rawConn.needs_reconnect) return { posted: false, reason: "needs_reconnect" };

    // Harness meetings must not post into a real channel, for the same reason
    // their summary emails are suppressed.
    if (String(meeting.title || "").startsWith("[harness]")) {
      return { posted: false, reason: "harness_meeting" };
    }

    const conn = await openConnectionTokens(rawConn);
    if (!conn?.access_token) return { posted: false, reason: "no_token" };

    // Claim BEFORE posting. A racing or replayed caller collides on the unique
    // (meeting_id, channel_id) index and returns here instead of posting again.
    const { error: claimError } = await supabase.from("slack_deliveries").insert({
      meeting_id: meeting.id,
      user_id: meeting.user_id,
      channel_id: conn.channel_id,
    });
    if (claimError) {
      if (claimError.code === "23505") return { posted: false, reason: "already_posted" };
      console.error("[slack] could not claim delivery:", claimError);
      return { posted: false, reason: "claim_failed" };
    }

    const appUrl = Deno.env.get("APP_URL") ?? "https://www.echobrief.in";
    const message = buildSummaryMessage(
      { id: String(meeting.id), title: meeting.title ?? null },
      insights,
      appUrl,
    );

    try {
      const { ts } = await postMessage(conn.access_token, conn.channel_id, message);
      await supabase.from("slack_deliveries")
        .update({ message_ts: ts })
        .eq("meeting_id", meeting.id)
        .eq("channel_id", conn.channel_id);
      await supabase.from("slack_connections")
        .update({ last_posted_at: new Date().toISOString() })
        .eq("id", conn.id);
      return { posted: true };
    } catch (err) {
      const code = err instanceof SlackError ? err.slackCode : "unknown";
      // Record why on the claim row rather than releasing it. Releasing would
      // let the next regeneration try again forever against a channel that is
      // never coming back; the row is the evidence, and reconnecting or
      // re-picking a channel is a deliberate user action.
      await supabase.from("slack_deliveries")
        .update({ error: `${code}: ${String(err).slice(0, 200)}` })
        .eq("meeting_id", meeting.id)
        .eq("channel_id", conn.channel_id);

      if (FATAL_SLACK_ERRORS.has(code)) {
        // The grant is gone. Flag it so the UI asks for a reconnect instead of
        // silently never posting again — the failure mode of the old Slack
        // integration, which nobody noticed had stopped working.
        await supabase.from("slack_connections")
          .update({ needs_reconnect: true })
          .eq("id", conn.id);
      } else if (CHANNEL_ERRORS.has(code)) {
        // The workspace is fine; the destination is not. Clearing the channel
        // turns "silently not posting" into a visible "pick a channel" state.
        await supabase.from("slack_connections")
          .update({ channel_id: null, channel_name: null })
          .eq("id", conn.id);
      }
      console.error(`[slack] post failed for meeting ${meeting.id}: ${code}`);
      return { posted: false, reason: code };
    }
  } catch (err) {
    console.error("[slack] delivery error:", err);
    return { posted: false, reason: "error" };
  }
}
