/**
 * Serve a shared meeting to somebody with no account.
 *
 * `verify_jwt = false`: the reader is anonymous by definition. The token in the
 * URL is the entire credential, which is why this function is deliberately
 * narrow about what it returns.
 *
 * What a share link shows: the meeting-zone summary, decisions and action
 * items. What it never shows, whatever the URL says: the transcript, the
 * pre/post-meeting chatter that `zones.ts` works to exclude, attendee email
 * addresses, coaching notes, facts, or anything about the owner's other
 * meetings. A forwarded link cannot leak more than the sender could see on the
 * card they shared.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { checkRateLimit, createRateLimitResponse, getClientIdentifier, RATE_LIMITS } from "../_shared/rate-limit.ts";
import { hashShareToken, looksLikeShareToken } from "../_shared/share-token.ts";

serve(async (req) => {
  const corsResponse = handleCorsPrelight(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  // Anonymous endpoint: rate limit by IP, since there is no account to key on.
  const limit = await checkRateLimit(`share-view:${getClientIdentifier(req)}`, RATE_LIMITS.PUBLIC);
  if (!limit.allowed) return createRateLimitResponse(limit, corsHeaders);

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token")
      || (await req.json().catch(() => ({})))?.token;

    // Rejected before hashing: a Supabase JWT or an eb_live_ PAT pasted here
    // must not be put through a lookup built for a different credential.
    if (!looksLikeShareToken(token)) {
      return json({ error: "This link is not valid." }, 404);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: share } = await supabase
      .from("meeting_shares")
      .select("id, meeting_id, expires_at, revoked_at, view_count")
      .eq("token_hash", await hashShareToken(token))
      .eq("scope", "link")
      .maybeSingle();

    // One message for "never existed", "revoked" and "expired". Distinguishing
    // them tells a stranger whether a link was ever real, which is a small
    // enumeration oracle for no user benefit.
    const gone = !share
      || share.revoked_at !== null
      || (share.expires_at !== null && Date.parse(share.expires_at) <= Date.now());
    if (gone) {
      return json({ error: "This link has expired or been revoked." }, 404);
    }

    const { data: meeting } = await supabase
      .from("meetings")
      .select("id, title, start_time, duration_seconds, languages, content_pruned_at")
      .eq("id", share.meeting_id)
      .maybeSingle();
    if (!meeting) return json({ error: "This meeting is no longer available." }, 404);

    // Retention removed the content, but the share row survives; say so plainly
    // rather than rendering an empty page.
    if (meeting.content_pruned_at) {
      return json({ error: "This meeting's content has passed its retention window." }, 404);
    }

    const { data: insights } = await supabase
      .from("meeting_insights")
      .select("summary_short, summary_detailed, key_points, action_items, decisions")
      .eq("meeting_id", share.meeting_id)
      .maybeSingle();

    // Best-effort view accounting; a failure here must not cost the reader the
    // page they came for.
    await supabase
      .from("meeting_shares")
      .update({
        view_count: (share.view_count ?? 0) + 1,
        last_viewed_at: new Date().toISOString(),
      })
      .eq("id", share.id);

    return json({
      meeting: {
        title: meeting.title,
        start_time: meeting.start_time,
        duration_seconds: meeting.duration_seconds,
        languages: meeting.languages ?? null,
      },
      insights: {
        summary_short: insights?.summary_short ?? null,
        summary_detailed: insights?.summary_detailed ?? null,
        key_points: insights?.key_points ?? [],
        action_items: insights?.action_items ?? [],
        decisions: insights?.decisions ?? [],
      },
    });
  } catch (err) {
    console.error("[get-shared-meeting]", err);
    return json({ error: "Something went wrong loading this meeting." }, 500);
  }
});
