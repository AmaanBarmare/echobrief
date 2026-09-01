/**
 * Plan-aware retention.
 *
 * The pricing page promises 14-day retention on Free, 30 on Starter and 90 on
 * Pro. Nothing enforced it: `prune-recordings` deletes archived mp3s at a flat
 * 30 days for everyone, and transcripts, insights, facts and coaching reports
 * were kept forever. A user who read the pricing page believed their words were
 * gone at day 14 while they sat in Postgres indefinitely.
 *
 * This deletes the CONTENT — transcript, insights, archived audio — and keeps
 * the `meetings` row, stamped with `content_pruned_at`, so the user's history
 * still shows that the meeting happened and the UI can explain why it is empty.
 * Deleting the meeting row outright would also silently destroy the usage
 * ledger's link and the calendar dedup guard.
 *
 * Cron-only (service role). Scheduled daily at 03:45 UTC by migration
 * 20260901120100 — deliberately clear of prune-job-logs (03:15) and
 * prune-recordings (03:30) so the three never contend for the same IO tick.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate, json } from "../_shared/auth.ts";
import { PLANS, PlanKey, planForProfile } from "../_shared/entitlements.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Postgres `IN` lists are cheap but not free, and a URL-encoded filter has a
// practical length limit in PostgREST. Chunk every id list.
const CHUNK = 200;

function chunked<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const caller = await authenticate(req, supabase);
    if (!caller.ok) return caller.response;
    if (!caller.isService) return json({ error: "Service only" }, 403);

    // ?dry_run=1 reports what would go without deleting anything.
    const dryRun = new URL(req.url).searchParams.get("dry_run") === "1";

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("user_id, subscription_status, subscription_product_id, subscription_renews_at, plan_override");
    if (profilesError) throw new Error(`profile scan failed: ${profilesError.message}`);

    // Group users by plan so the work is four queries, not one per user.
    const byPlan = new Map<PlanKey, string[]>();
    for (const profile of profiles ?? []) {
      const plan = planForProfile(profile);
      const bucket = byPlan.get(plan) ?? [];
      bucket.push(profile.user_id);
      byPlan.set(plan, bucket);
    }

    const summary: Record<string, unknown>[] = [];

    for (const [plan, userIds] of byPlan) {
      const retainDays = PLANS[plan].retentionDays;
      const cutoff = new Date(Date.now() - retainDays * 86_400_000).toISOString();

      const expired: Array<{ id: string; audio_url: string | null }> = [];
      for (const ids of chunked(userIds)) {
        const { data, error } = await supabase
          .from("meetings")
          .select("id, audio_url")
          .in("user_id", ids)
          .lt("created_at", cutoff)
          .is("content_pruned_at", null);
        if (error) throw new Error(`expired scan failed for ${plan}: ${error.message}`);
        expired.push(...(data ?? []));
      }

      summary.push({ plan, retain_days: retainDays, users: userIds.length, expiring: expired.length });
      if (dryRun || expired.length === 0) continue;

      const meetingIds = expired.map((m) => m.id);
      const audioPaths = expired
        .map((m) => m.audio_url)
        .filter((u): u is string => typeof u === "string" && u.length > 0)
        .map((u) => u.replace(/^recordings\//, ""));

      for (const ids of chunked(meetingIds)) {
        // Insights before transcripts: if the run dies between the two, the
        // meeting is left without derived content rather than with insights
        // that quote a transcript nobody can read.
        const { error: insightsError } = await supabase
          .from("meeting_insights").delete().in("meeting_id", ids);
        if (insightsError) throw new Error(`insight delete failed: ${insightsError.message}`);

        const { error: transcriptError } = await supabase
          .from("transcripts").delete().in("meeting_id", ids);
        if (transcriptError) throw new Error(`transcript delete failed: ${transcriptError.message}`);
      }

      if (audioPaths.length > 0) {
        for (const paths of chunked(audioPaths, 100)) {
          const { error: rmError } = await supabase.storage.from("recordings").remove(paths);
          // A missing object is not a failure — prune-recordings may have taken
          // it already. Log and keep going; the DB stamp is what matters.
          if (rmError) console.warn("[prune-content] storage remove:", rmError.message);
        }
      }

      const now = new Date().toISOString();
      for (const ids of chunked(meetingIds)) {
        const { error: stampError } = await supabase
          .from("meetings")
          .update({ content_pruned_at: now, audio_url: null })
          .in("id", ids);
        if (stampError) throw new Error(`stamp failed: ${stampError.message}`);
      }
    }

    const result = { dry_run: dryRun, plans: summary };
    console.log("[prune-content]", JSON.stringify(result));
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[prune-content] error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
