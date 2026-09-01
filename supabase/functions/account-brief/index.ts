/**
 * Rolling account brief for a contact: where the deal stands, open
 * commitments both ways, unresolved objections, and what to prepare for the
 * next call — written from the facts of every meeting with that contact. The
 * two-minute read before the next call. Cached on contacts.account_brief;
 * `force: true` rewrites.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.20.1";
import { authenticate, CORS_HEADERS, json } from "../_shared/auth.ts";
import { checkRateLimit, createRateLimitResponse, RATE_LIMITS } from "../_shared/rate-limit.ts";
import { formatISTDate } from "../_shared/time.ts";

function str(v: unknown): string { return String(v ?? "").trim(); }
function list(v: unknown): string[] {
  return (Array.isArray(v) ? v : []).map((x) => str(typeof x === "object" && x ? (x as any).text ?? JSON.stringify(x) : x)).filter(Boolean).slice(0, 10);
}

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
    const limit = await checkRateLimit(`account-brief:${caller.userId}`, RATE_LIMITS.LLM_HEAVY);
    if (!limit.allowed) return createRateLimitResponse(limit, CORS_HEADERS);
  }

  const body = await req.json().catch(() => ({}));
  const contactId = String(body.contact_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(contactId)) return json({ error: "contact_id must be a uuid" }, 400);

  let contactQuery = supabase.from("contacts").select("*").eq("id", contactId);
  if (!caller.isService) contactQuery = contactQuery.eq("user_id", caller.userId);
  const { data: contact } = await contactQuery.maybeSingle();
  if (!contact) return json({ error: "Contact not found" }, 404);
  if (contact.account_brief && body.force !== true) {
    return json({ success: true, cached: true, brief: contact.account_brief });
  }

  const { data: links } = await supabase
    .from("meeting_contacts").select("meeting_id").eq("contact_id", contactId);
  const meetingIds = (links ?? []).map((l: any) => l.meeting_id);
  if (meetingIds.length === 0) return json({ error: "No meetings with this contact yet" }, 409);

  const { data: meetings } = await supabase
    .from("meetings")
    .select("id, title, start_time, meeting_insights(summary_short, action_items, facts, created_at)")
    .in("id", meetingIds)
    .order("start_time", { ascending: false })
    .limit(8);

  const history = (meetings ?? []).map((m: any) => {
    const ins = Array.isArray(m.meeting_insights)
      ? [...m.meeting_insights].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0]
      : m.meeting_insights;
    const f = ins?.facts ?? {};
    return {
      date: formatISTDate(m.start_time),
      title: m.title,
      summary: ins?.summary_short ?? "",
      commitments: f.commitments ?? [],
      objections: f.objections ?? [],
      explicit_asks: f.explicit_asks ?? [],
      numbers: f.numbers ?? [],
      buying_signals: f.buying_signals ?? [],
      action_items: ins?.action_items ?? [],
    };
  });

  const prompt = `Write the account brief a rep reads for two minutes before the next call with ${contact.name || contact.email}${contact.company ? ` (${contact.company})` : ""}. ${history.length} meeting(s) so far, newest first.

MEETING HISTORY (facts only — your ONLY source):
${JSON.stringify(history)}

RULES
- Only what the facts support. Never invent status, sentiment or promises.
- Open commitments: anything committed that has no evidence of being done. Split by side.
- Unresolved objections: pushback that was never addressed.
- next_call_prep: 3–5 concrete things to bring or ask, tied to their explicit asks and numbers.

JSON: {"where_it_stands": "2–3 sentences", "open_commitments_ours": [""], "open_commitments_theirs": [""], "unresolved_objections": [""], "key_numbers": [""], "next_call_prep": [""]}`;

  const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    max_tokens: 900,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });
  const raw = JSON.parse(completion.choices[0]?.message?.content || "{}");
  const brief = {
    where_it_stands: str(raw.where_it_stands),
    open_commitments_ours: list(raw.open_commitments_ours),
    open_commitments_theirs: list(raw.open_commitments_theirs),
    unresolved_objections: list(raw.unresolved_objections),
    key_numbers: list(raw.key_numbers),
    next_call_prep: list(raw.next_call_prep),
    meetings_considered: history.length,
    generated_at: new Date().toISOString(),
  };
  if (!brief.where_it_stands) return json({ error: "The model returned an empty brief" }, 502);

  await supabase
    .from("contacts")
    .update({ account_brief: brief, account_brief_at: brief.generated_at })
    .eq("id", contactId);
  return json({ success: true, cached: false, brief });
});
