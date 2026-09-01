/**
 * Draft the follow-up email from the facts object: thank-you, recap of
 * commitments both ways, the customer's own words for what they asked for,
 * confirmation of the follow-up time. Facts only — nothing invented. The
 * draft is cached on meeting_insights.followup_draft; `force: true` redrafts.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.20.1";
import { authenticate, CORS_HEADERS, json } from "../_shared/auth.ts";
import { checkRateLimit, createRateLimitResponse, RATE_LIMITS } from "../_shared/rate-limit.ts";
import { externalAttendees, ownerDomain } from "../_shared/zones.ts";
import { formatResolvedDate } from "../_shared/dates.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const caller = await authenticate(req, supabase);
  if (!caller.ok) return caller.response;

  // This endpoint calls OpenAI on every request. Service callers are us
  // (backfills, other functions) and are not limited; users are, keyed on the
  // user id rather than the IP — an office shares an IP and an attacker rotates
  // one, but the account is the thing actually spending our money.
  if (!caller.isService) {
    const limit = await checkRateLimit(`draft-followup:${caller.userId}`, RATE_LIMITS.LLM);
    if (!limit.allowed) return createRateLimitResponse(limit, CORS_HEADERS);
  }

  const body = await req.json().catch(() => ({}));
  const meetingId = String(body.meeting_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(meetingId)) return json({ error: "meeting_id must be a uuid" }, 400);

  let meetingQuery = supabase.from("meetings").select("id, title, start_time, attendees, user_id").eq("id", meetingId);
  if (!caller.isService) meetingQuery = meetingQuery.eq("user_id", caller.userId);
  const { data: meeting } = await meetingQuery.maybeSingle();
  if (!meeting) return json({ error: "Meeting not found" }, 404);

  const { data: insights } = await supabase
    .from("meeting_insights")
    .select("id, summary_short, action_items, facts, followup_draft")
    .eq("meeting_id", meetingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!insights) return json({ error: "No insights yet for this meeting" }, 409);
  if (insights.followup_draft && body.force !== true) return json({ success: true, cached: true, draft: insights.followup_draft });
  if (!insights.facts) return json({ error: "This meeting has no extracted facts. Regenerate insights first." }, 409);

  const { data: profile } = await supabase
    .from("profiles").select("full_name, email").eq("user_id", meeting.user_id).maybeSingle();
  const guests = externalAttendees(meeting.attendees ?? [], ownerDomain(meeting.attendees ?? []))
    .map((a) => a.displayName || a.email).filter(Boolean);
  const facts = insights.facts;
  const nextDue = ((insights.action_items ?? []) as Array<{ due_date_resolved?: string }>)
    .map((a) => a.due_date_resolved).filter(Boolean)[0];

  const prompt = `Draft a short follow-up email from ${profile?.full_name || "the sender"} to ${guests.join(", ") || "the client"} after the meeting "${meeting.title}".

FACTS (verbatim quotes with timestamps — your ONLY source):
${JSON.stringify({
    explicit_asks: facts.explicit_asks, pain_points: facts.pain_points, commitments: facts.commitments,
    numbers: facts.numbers, objections: facts.objections, decisions: facts.decisions,
  })}
${nextDue ? `The follow-up is on ${formatResolvedDate(nextDue)}.` : ""}

RULES
- Thank them, reflect back what THEY said they need (use their own words from explicit_asks), acknowledge the top pain point, recap the commitments on both sides, confirm the follow-up time if one exists.
- Plain, warm, specific. No marketing language, no invented detail, no promises that are not in commitments. 120–180 words.
- Sign off with the sender's first name.

JSON: {"subject": "", "body": ""}`;

  const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    max_tokens: 700,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });
  const raw = JSON.parse(completion.choices[0]?.message?.content || "{}");
  const draft = {
    subject: String(raw.subject ?? "").trim().slice(0, 200) || `Following up on ${meeting.title}`,
    body: String(raw.body ?? "").trim(),
    to: guests,
    generated_at: new Date().toISOString(),
  };
  if (!draft.body) return json({ error: "The model returned an empty draft" }, 502);

  await supabase.from("meeting_insights").update({ followup_draft: draft }).eq("id", insights.id);
  return json({ success: true, cached: false, draft });
});
