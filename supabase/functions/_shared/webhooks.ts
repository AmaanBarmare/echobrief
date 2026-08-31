/**
 * Outbound automation webhook: `meeting.insights_ready` (and
 * `meeting.insights_regenerated`) to the user's endpoint — n8n, Make, Zapier,
 * a CRM bridge. Signed with Standard Webhooks headers (`webhook-id`,
 * `webhook-timestamp`, `webhook-signature: v1,<base64 hmac-sha256>` over
 * `${id}.${timestamp}.${body}`) — the same scheme Dodo and Recall use inbound,
 * so a receiver can verify with any standard library. Every attempt is logged
 * to `webhook_events`. Never throws: a dead endpoint must not cost a summary.
 */

export async function signWebhook(
  secret: string,
  msgId: string,
  timestamp: number,
  body: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${msgId}.${timestamp}.${body}`),
  );
  return `v1,${btoa(String.fromCharCode(...new Uint8Array(sig)))}`;
}

/** The compact, stable payload an automation receives. No transcript body. */
export function buildWebhookPayload(
  eventType: string,
  meeting: Record<string, any>,
  insights: Record<string, any>,
  appUrl: string,
): Record<string, unknown> {
  const facts = insights.facts ?? {};
  return {
    event: eventType,
    occurred_at: new Date().toISOString(),
    meeting: {
      id: meeting.id,
      title: meeting.title,
      start_time: meeting.start_time,
      end_time: meeting.end_time ?? null,
      duration_seconds: meeting.duration_seconds ?? null,
      attendees: meeting.attendees ?? [],
      languages: meeting.languages ?? null,
      url: `${appUrl}/meeting/${meeting.id}`,
    },
    summary_short: insights.summary_short ?? "",
    action_items: insights.action_items ?? [],
    decisions: insights.decisions ?? [],
    facts: {
      meeting_type: facts.meeting_type ?? null,
      numbers: facts.numbers ?? [],
      commitments: facts.commitments ?? [],
      explicit_asks: facts.explicit_asks ?? [],
      objections: facts.objections ?? [],
    },
    coaching_summary: insights.coaching?.summary ?? null,
  };
}

export async function dispatchWebhook(
  supabase: any,
  args: {
    userId: string;
    meetingId: string | null;
    url: string;
    secret: string;
    eventType: string;
    payload: Record<string, unknown>;
  },
): Promise<{ delivered: boolean; status: number | null }> {
  const body = JSON.stringify(args.payload);
  const msgId = `msg_${crypto.randomUUID().replace(/-/g, "")}`;
  const timestamp = Math.floor(Date.now() / 1000);
  let status: number | null = null;
  let error: string | null = null;
  try {
    const signature = await signWebhook(args.secret, msgId, timestamp, body);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(args.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "webhook-id": msgId,
        "webhook-timestamp": String(timestamp),
        "webhook-signature": signature,
        "User-Agent": "EchoBrief-Webhooks/1.0",
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    status = res.status;
    if (!res.ok) error = `HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  try {
    await supabase.from("webhook_events").insert({
      user_id: args.userId,
      meeting_id: args.meetingId,
      event_type: args.eventType,
      payload: args.payload,
      status_code: status,
      error,
      delivered_at: status !== null && status >= 200 && status < 300 ? new Date().toISOString() : null,
    });
  } catch (logErr) {
    console.warn("[webhooks] could not log delivery:", logErr);
  }
  if (error) console.warn(`[webhooks] ${args.eventType} → ${args.url} failed: ${error}`);
  return { delivered: !error, status };
}

/** Fire the user's automation webhook for a meeting, if one is configured. */
export async function notifyInsightsReady(
  supabase: any,
  meeting: Record<string, any>,
  insights: Record<string, any>,
  eventType = "meeting.insights_ready",
): Promise<void> {
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("webhook_url, webhook_secret")
      .eq("user_id", meeting.user_id)
      .maybeSingle();
    if (!profile?.webhook_url || !profile?.webhook_secret) return;
    const appUrl = Deno.env.get("APP_URL") || "https://www.echobrief.in";
    await dispatchWebhook(supabase, {
      userId: meeting.user_id,
      meetingId: meeting.id,
      url: profile.webhook_url,
      secret: profile.webhook_secret,
      eventType,
      payload: buildWebhookPayload(eventType, meeting, insights, appUrl),
    });
  } catch (err) {
    console.warn("[webhooks] notifyInsightsReady failed (non-fatal):", err);
  }
}
