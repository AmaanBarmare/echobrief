/**
 * Claim the right to upload a recording, before a single byte is sent.
 *
 * Upload ingest exists because not every meeting is a bot meeting — a phone
 * call, an in-person conversation, a recording made by someone else. The file
 * never touches Supabase Storage: the project caps a single object at 50 MiB
 * (~55 minutes at 128 kbps) against a 1 GB bucket, so the long recordings that
 * most need transcribing are exactly the ones Storage refuses. The browser
 * uploads straight to a private Vercel Blob and `split-audio` reads it from
 * there.
 *
 * THIS FUNCTION IS THE ENTITLEMENT GATE. Every path that spends transcription
 * money runs `checkRecordingAllowed` first — `start-recall-recording` returns
 * 402, `auto-join-meetings` skips the event. An upload path that skipped it
 * would not be a missing feature, it would be a way around the plan: a free
 * account could hand us unlimited audio simply by not using a bot. The gate has
 * to be here, before the token is issued, because once the client holds an
 * upload token the bytes are already paid for.
 *
 * `verify_jwt = true` and a user JWT only: an upload belongs to the person who
 * made it, and a service bearer has no user to bill.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { authenticate } from "../_shared/auth.ts";
import { checkRecordingAllowed, PLANS, recordUsage } from "../_shared/entitlements.ts";
import { checkRateLimit, createRateLimitResponse, RATE_LIMITS } from "../_shared/rate-limit.ts";
import { captureError, withObservability } from "../_shared/observability.ts";

/** What we accept. Sarvam decodes by content type, so this is not cosmetic. */
const ALLOWED_CONTENT_TYPES = [
  "audio/mpeg", "audio/mp3", "audio/mp4", "audio/m4a", "audio/x-m4a",
  "audio/wav", "audio/x-wav", "audio/webm", "audio/ogg", "audio/flac",
  "video/mp4", "video/webm", "video/quicktime",
];

/**
 * A ceiling no plan may exceed, independent of entitlements. The per-plan
 * `maxMeetingSeconds` bounds DURATION, but duration is not knowable until the
 * bytes arrive and ffprobe has run — by which point the transfer is already
 * paid for. This bounds the transfer itself.
 */
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

serve(withObservability("prepare-upload", async (req) => {
  const preflight = handleCorsPrelight(req);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const caller = await authenticate(req, admin, corsHeaders);
    if (!caller.ok) return caller.response;
    if (caller.isService || !caller.userId) {
      return json({ error: "An upload belongs to a signed-in user." }, 403);
    }
    const userId = caller.userId;

    const limit = await checkRateLimit(`prepare-upload:${userId}`, RATE_LIMITS.API);
    if (!limit.allowed) return createRateLimitResponse(limit, corsHeaders);

    const body = await req.json().catch(() => ({}));
    const filename = String(body?.filename ?? "").trim().slice(0, 200);
    const contentType = String(body?.content_type ?? "").trim().toLowerCase();
    const sizeBytes = Number(body?.size_bytes ?? 0);

    if (!filename) return json({ error: "A filename is required." }, 400);
    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      return json({
        error: "That file type isn't supported. Upload an audio or video recording.",
        allowed: ALLOWED_CONTENT_TYPES,
      }, 415);
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      return json({ error: "A file size is required." }, 400);
    }
    if (sizeBytes > MAX_UPLOAD_BYTES) {
      return json({ error: "That file is too large to process.", max_bytes: MAX_UPLOAD_BYTES }, 413);
    }

    // The gate. Identical to the bot path, deliberately — one plan, one meaning.
    const entitlement = await checkRecordingAllowed(admin, userId);
    if (!entitlement.allowed) {
      return json({
        error: entitlement.reason,
        code: entitlement.code,
        plan: entitlement.plan,
        usage: entitlement.usage,
      }, 402);
    }

    // `uploading` is a non-terminal status the monitor already treats as
    // in-flight. The row exists before the bytes do so that an upload the user
    // abandons is visible as an abandoned meeting rather than as nothing —
    // and so `ingest-upload` has something to attach the Sarvam job to.
    const { data: meeting, error: insertError } = await admin
      .from("meetings")
      .insert({
        user_id: userId,
        title: filename.replace(/\.[^.]+$/, "").slice(0, 200) || "Uploaded recording",
        source: "upload",
        status: "uploading",
        start_time: new Date().toISOString(),
        processing_config: {
          upload: {
            filename,
            content_type: contentType,
            size_bytes: sizeBytes,
            requested_at: new Date().toISOString(),
          },
        },
      })
      .select("id")
      .single();

    if (insertError || !meeting) {
      throw new Error(`Could not create the meeting row: ${insertError?.message}`);
    }

    // Ledger the start now, exactly as the bot path does. The seconds are
    // ledgered later by the pipeline once the duration is actually known.
    await recordUsage(admin, {
      userId,
      meetingId: meeting.id,
      kind: "meeting_started",
      plan: entitlement.plan,
    });

    return json({
      meeting_id: meeting.id,
      plan: entitlement.plan,
      max_meeting_seconds: PLANS[entitlement.plan].maxMeetingSeconds,
      max_bytes: MAX_UPLOAD_BYTES,
      allowed_content_types: ALLOWED_CONTENT_TYPES,
    });
  } catch (err) {
    await captureError(err, { fn: "prepare-upload" });
    return json({ error: "Could not start the upload right now." }, 500);
  }
}));
