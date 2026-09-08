/**
 * Attach a finished meeting's note to the matching Zoho CRM records.
 *
 * Called from `afterInsightsSaved` alongside the Slack post, and subject to the
 * same rule: it NEVER THROWS. The insights are already saved by the time this
 * runs, and a Zoho outage, an expired grant or a deleted record must not fail a
 * meeting that succeeded.
 *
 * Who it writes to: the external attendees of the meeting, using
 * `deriveContacts` — the same definition of "external" (email domain ≠ the
 * owner's) that `contacts` and the privacy zones use. Meetings started manually
 * from the dashboard carry no attendee list at all, so this correctly does
 * nothing for them; roughly half of completed meetings are calendar-sourced and
 * have invitees.
 *
 * What it writes: ONE note per matched record, claimed in `zoho_deliveries`
 * before the write. `afterInsightsSaved` runs on regeneration too, and a CRM
 * record carrying four identical notes is worse than one carrying none — it
 * discredits every other thing the product writes.
 */
import { deriveContacts } from "./contacts.ts";
import { formatISTDate } from "./time.ts";
import {
  buildNote,
  createNote,
  findRecordByEmail,
  refreshAccessToken,
  FATAL_ZOHO_ERRORS,
  ZohoError,
} from "./zoho.ts";
import { openConnectionTokens, sealConnectionTokens } from "./oauth-tokens.ts";

/** A meeting with a crowd of externals must not spray notes across the CRM. */
const MAX_RECORDS = 5;

export interface ZohoDeliveryResult {
  written: number;
  reason?: string;
}

export async function deliverToZoho(
  supabase: any,
  meeting: Record<string, any>,
  insights: Record<string, any>,
): Promise<ZohoDeliveryResult> {
  try {
    const { data: rawConn } = await supabase
      .from("zoho_connections")
      .select("*")
      .eq("user_id", meeting.user_id)
      .maybeSingle();

    if (!rawConn) return { written: 0, reason: "not_connected" };
    if (rawConn.needs_reconnect) return { written: 0, reason: "needs_reconnect" };
    if (String(meeting.title || "").startsWith("[harness]")) {
      return { written: 0, reason: "harness_meeting" };
    }

    const emails = deriveContacts(meeting.attendees ?? []).map((c) => c.email);
    if (!emails.length) return { written: 0, reason: "no_external_attendees" };

    const conn = await openConnectionTokens(rawConn);
    if (!conn?.refresh_token && !conn?.access_token) return { written: 0, reason: "no_token" };

    const token = await usableAccessToken(supabase, conn);
    if (!token) return { written: 0, reason: "refresh_failed" };

    const appUrl = Deno.env.get("APP_URL") ?? "https://www.echobrief.in";
    const note = buildNote(
      { id: String(meeting.id), title: meeting.title ?? null },
      insights,
      appUrl,
      meeting.start_time ? formatISTDate(meeting.start_time, { month: "short", day: "numeric", year: "numeric" }) : "",
    );

    let written = 0;
    for (const email of emails.slice(0, MAX_RECORDS)) {
      try {
        const record = await findRecordByEmail(conn.api_domain, token, email);
        // Not everyone in a meeting is in the CRM. That is the single most
        // common outcome here and it is not an error.
        if (!record) continue;

        const { error: claimError } = await supabase.from("zoho_deliveries").insert({
          meeting_id: meeting.id,
          user_id: meeting.user_id,
          module: record.module,
          record_id: record.id,
          matched_email: email,
        });
        if (claimError) {
          if (claimError.code !== "23505") {
            console.error("[zoho] could not claim delivery:", claimError);
          }
          continue;
        }

        try {
          const noteId = await createNote(
            conn.api_domain, token, record.module, record.id, note.title, note.content,
          );
          await supabase.from("zoho_deliveries")
            .update({ note_id: noteId })
            .eq("meeting_id", meeting.id)
            .eq("record_id", record.id);
          written++;
        } catch (err) {
          const code = err instanceof ZohoError ? err.code : "unknown";
          await supabase.from("zoho_deliveries")
            .update({ error: `${code}: ${String(err).slice(0, 200)}` })
            .eq("meeting_id", meeting.id)
            .eq("record_id", record.id);
          if (FATAL_ZOHO_ERRORS.has(code)) {
            await supabase.from("zoho_connections")
              .update({ needs_reconnect: true }).eq("id", conn.id);
            return { written, reason: code };
          }
        }
      } catch (err) {
        const code = err instanceof ZohoError ? err.code : "unknown";
        if (FATAL_ZOHO_ERRORS.has(code)) {
          // The grant is gone; every remaining lookup would fail the same way.
          await supabase.from("zoho_connections")
            .update({ needs_reconnect: true }).eq("id", conn.id);
          return { written, reason: code };
        }
        console.error(`[zoho] lookup failed for a meeting attendee: ${code}`);
      }
    }

    if (written) {
      await supabase.from("zoho_connections")
        .update({ last_synced_at: new Date().toISOString() }).eq("id", conn.id);
    }
    return written ? { written } : { written: 0, reason: "no_match" };
  } catch (err) {
    console.error("[zoho] delivery error:", err);
    return { written: 0, reason: "error" };
  }
}

/**
 * A token that will still be valid for the next few calls, refreshing if not.
 *
 * Zoho access tokens last an hour — shorter than the gap between most people's
 * meetings — so refreshing is the normal path, not an edge case. A refresh
 * never returns a new refresh token, so only the access token and its expiry
 * are written back.
 */
async function usableAccessToken(
  supabase: any,
  conn: Record<string, any>,
): Promise<string | null> {
  const expiry = conn.token_expiry ? new Date(conn.token_expiry).getTime() : 0;
  // A minute of headroom: a token that expires mid-request is a failure we can
  // see coming.
  if (conn.access_token && expiry > Date.now() + 60_000) return conn.access_token;

  const clientId = Deno.env.get("ZOHO_CLIENT_ID");
  const clientSecret = Deno.env.get("ZOHO_CLIENT_SECRET");
  if (!clientId || !clientSecret || !conn.refresh_token) return conn.access_token ?? null;

  try {
    const fresh = await refreshAccessToken(clientId, clientSecret, conn.refresh_token, conn.location);
    const sealed = await sealConnectionTokens({ access_token: fresh.access_token });
    await supabase.from("zoho_connections").update({
      access_token: sealed.access_token,
      token_expiry: new Date(Date.now() + fresh.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", conn.id);
    return fresh.access_token;
  } catch (err) {
    const code = err instanceof ZohoError ? err.code : "unknown";
    if (FATAL_ZOHO_ERRORS.has(code)) {
      await supabase.from("zoho_connections")
        .update({ needs_reconnect: true }).eq("id", conn.id);
    }
    console.error(`[zoho] token refresh failed: ${code}`);
    return null;
  }
}
