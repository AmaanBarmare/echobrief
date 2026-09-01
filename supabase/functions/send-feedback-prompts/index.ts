/**
 * The early-access feedback sequence, sent daily by cron.
 *
 * Finds everyone on a live code-granted trial, works out which prompt is due
 * (see `_shared/feedback-prompts.ts`), claims a row in `feedback_prompts`
 * BEFORE calling Resend, then sends. The claim-then-send order is the same
 * pattern `send-meeting-email` uses and for the same reason: a duplicate
 * caller collides on 23505 and skips instead of sending a second copy. A cron
 * that double-fires must not double-mail a design partner.
 *
 * Service-role only. Nothing here is user-triggerable.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate, json } from "../_shared/auth.ts";
import {
  dueFeedbackPrompt,
  renderFeedbackPrompt,
} from "../_shared/feedback-prompts.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const REPLY_TO = Deno.env.get("FEEDBACK_REPLY_TO") ?? "hello@echobrief.in";
const DAY_MS = 86_400_000;

/** Whole days between two instants, floored — never negative. */
function daysBetween(from: string | null, to: Date): number {
  const t = from ? Date.parse(from) : NaN;
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((to.getTime() - t) / DAY_MS));
}

async function sendViaResend(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "EchoBrief <hello@echobrief.in>",
      reply_to: REPLY_TO,
      to,
      subject,
      html,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

serve(async (req) => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const caller = await authenticate(req, admin);
  if (!caller.ok) return caller.response;
  if (!caller.isService) return json({ error: "Service role only." }, 403);

  const now = new Date();
  const results = { considered: 0, sent: 0, skipped: 0, failed: 0 };

  try {
    // Everyone whose code-granted access is still live. `plan_override_expires_at
    // > now` is what distinguishes a trial from a permanent internal override —
    // internal accounts have a NULL expiry and are correctly excluded.
    const { data: profiles, error } = await admin
      .from("profiles")
      .select("user_id, email, full_name, plan_override, plan_override_expires_at")
      .not("plan_override", "is", null)
      .not("plan_override_expires_at", "is", null)
      .gt("plan_override_expires_at", now.toISOString());
    if (error) throw error;

    for (const p of profiles ?? []) {
      results.considered++;
      const userId = (p as Record<string, unknown>).user_id as string;
      const email = String((p as Record<string, unknown>).email ?? "").trim();
      if (!email) {
        results.skipped++;
        continue;
      }

      // When the trial started. The redemption row is the truth; fall back to
      // the grant window if a grant was made by hand without a code.
      const { data: redemption } = await admin
        .from("access_code_redemptions")
        .select("redeemed_at")
        .eq("user_id", userId)
        .order("redeemed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const expiresAt = String(
        (p as Record<string, unknown>).plan_override_expires_at ?? "",
      );
      const startedAt = redemption?.redeemed_at ?? null;
      if (!startedAt) {
        // A hand-made grant with no redemption row has no start date we can
        // trust, and guessing one would mail people at the wrong moment.
        results.skipped++;
        continue;
      }

      const { data: alreadySent } = await admin
        .from("feedback_prompts")
        .select("kind")
        .eq("user_id", userId);

      const kind = dueFeedbackPrompt({
        daysElapsed: daysBetween(startedAt, now),
        sent: (alreadySent ?? []).map((r: { kind: string }) => r.kind),
      });
      if (!kind) {
        results.skipped++;
        continue;
      }

      // Claim BEFORE sending. A 23505 means another tick got there first.
      const { error: claimError } = await admin
        .from("feedback_prompts")
        .insert({ user_id: userId, kind });
      if (claimError) {
        if (claimError.code !== "23505") {
          console.error(`[feedback] claim failed for ${userId}:`, claimError);
          results.failed++;
        } else {
          results.skipped++;
        }
        continue;
      }

      const { count } = await admin
        .from("meetings")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "completed");

      const copy = renderFeedbackPrompt(kind, {
        name: (p as Record<string, unknown>).full_name as string | null,
        meetingsRecorded: count ?? 0,
        daysLeft: Math.max(0, Math.ceil((Date.parse(expiresAt) - now.getTime()) / DAY_MS)),
        replyTo: REPLY_TO,
      });

      try {
        await sendViaResend(email, copy.subject, copy.html);
        results.sent++;
        console.log(`[feedback] ${kind} → ${userId}`);
      } catch (err) {
        // Release the claim so the next tick can retry — a send that never
        // happened must not be recorded as sent.
        await admin
          .from("feedback_prompts")
          .delete()
          .eq("user_id", userId)
          .eq("kind", kind);
        console.error(`[feedback] send failed for ${userId}:`, err);
        results.failed++;
      }
    }

    return json({ ok: true, ...results });
  } catch (err) {
    console.error("[feedback] unhandled:", err);
    return json({ error: String(err), ...results }, 500);
  }
});
