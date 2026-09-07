/**
 * Turn a finished upload into a Sarvam job.
 *
 * Called by `api/upload.ts` (Vercel) once Vercel Blob reports the client upload
 * complete. The bytes are in a PRIVATE blob and never pass through Supabase
 * Storage — see `prepare-upload` for why — so the splitter is told
 * `audioSource: "blob"` and reads them with the store token.
 *
 * This is the upload twin of `processRecallAudio`, and deliberately reuses its
 * shape: hand the file to the Vercel splitter, keep the returned Sarvam job id
 * and chunk metadata on the meeting, and let `sarvam-webhook` do the rest. The
 * whole post-transcription sequence downstream is then identical to a bot
 * meeting, which is the point — an uploaded meeting should be indistinguishable
 * from a recorded one once it has a transcript.
 *
 * There is NO whole-file fallback here, unlike the Recall path. That fallback
 * exists because a bot meeting has already been recorded and a degraded
 * transcript beats none. An upload has not been consumed yet: if the splitter
 * is unavailable, failing loudly leaves the user a file they can re-upload,
 * whereas a whole-file submission of long audio returns an EMPTY transcript
 * from saaras:v3 and silently burns their quota.
 *
 * Service-role only: the caller is our own Vercel function, and the user was
 * already authenticated when the upload token was issued.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { authenticate } from "../_shared/auth.ts";
import { captureError, withObservability } from "../_shared/observability.ts";

serve(withObservability("ingest-upload", async (req) => {
  const preflight = handleCorsPrelight(req);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const caller = await authenticate(req, admin, corsHeaders);
  if (!caller.ok) return caller.response;
  if (!caller.isService) return json({ error: "Service only." }, 403);

  const body = await req.json().catch(() => ({}));
  const meetingId = String(body?.meeting_id ?? "");
  const blobUrl = String(body?.blob_url ?? "");
  if (!meetingId || !blobUrl) {
    return json({ error: "meeting_id and blob_url are required" }, 400);
  }

  const { data: meeting } = await admin
    .from("meetings")
    .select("id, user_id, status, sarvam_job_id, processing_config")
    .eq("id", meetingId)
    .maybeSingle();
  if (!meeting) return json({ error: "Meeting not found" }, 404);

  // Vercel Blob can retry its completion callback. A meeting that already has a
  // job must not get a second one: two jobs on one meeting means two Sarvam
  // callbacks, and the second would overwrite a good transcript with whichever
  // finished last.
  if (meeting.sarvam_job_id) {
    return json({ skipped: true, reason: "already_submitted", job_id: meeting.sarvam_job_id });
  }

  const splitUrl = Deno.env.get("SPLIT_AUDIO_URL");
  const splitSecret = Deno.env.get("SPLIT_AUDIO_SECRET");
  const sarvamWebhookSecret = Deno.env.get("SARVAM_WEBHOOK_SECRET")!;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  if (!splitUrl || !splitSecret) {
    const reason = "SPLIT_AUDIO_URL / SPLIT_AUDIO_SECRET not configured";
    await admin.from("meetings")
      .update({ status: "failed", error_message: `Upload ingest: ${reason}` })
      .eq("id", meetingId);
    return json({ error: reason }, 503);
  }

  try {
    // Leave `uploading` behind the moment the splitter is engaged, so an
    // upload that dies mid-split is not mistaken for one that never arrived.
    await admin.from("meetings").update({ status: "processing" }).eq("id", meetingId);

    const splitRes = await fetch(splitUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${splitSecret}` },
      body: JSON.stringify({
        audioUrl: blobUrl,
        audioSource: "blob",
        callbackUrl: `${supabaseUrl}/functions/v1/sarvam-webhook`,
        callbackToken: sarvamWebhookSecret,
      }),
    });
    if (!splitRes.ok) {
      throw new Error(
        `split-audio returned ${splitRes.status}: ${(await splitRes.text()).slice(0, 300)}`,
      );
    }
    const splitData = await splitRes.json();
    if (!splitData?.job_id) throw new Error("split-audio returned no job_id");

    // MERGE, never overwrite: processing_config already carries the upload
    // metadata prepare-upload wrote, and sarvam-webhook reads chunk_* from here
    // to stitch the results back together in order.
    const { error: updateError } = await admin
      .from("meetings")
      .update({
        sarvam_job_id: splitData.job_id,
        // STAYS `processing`. `transcribing` is reserved: sarvam-webhook sets
        // it while the chunk-wise Whisper fallback runs, and skips any meeting
        // already in it. Setting it here meant Sarvam's callback arrived,
        // matched that guard and was discarded — the job completed, both chunks
        // succeeded, and the meeting sat in `transcribing` forever. The Recall
        // path leaves `processing` for exactly this reason.
        status: "processing",
        duration_seconds: Math.round(splitData.duration_seconds ?? 0) || null,
        processing_config: {
          ...(meeting.processing_config || {}),
          split_method: "vercel-ffmpeg",
          split_source: "blob",
          chunk_count: splitData.chunk_count,
          chunk_seconds: splitData.chunk_seconds,
          audio_duration_seconds: splitData.duration_seconds,
        },
      })
      .eq("id", meetingId);
    if (updateError) throw new Error(`Could not save the job id: ${updateError.message}`);

    console.log(
      `[ingest-upload] meeting=${meetingId} job=${splitData.job_id} ${splitData.chunk_count} chunk(s) x ${splitData.chunk_seconds}s (duration ${splitData.duration_seconds}s)`,
    );
    return json({
      ok: true,
      meeting_id: meetingId,
      job_id: splitData.job_id,
      chunk_count: splitData.chunk_count,
      duration_seconds: splitData.duration_seconds,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await captureError(err, { fn: "ingest-upload", meetingId });
    await admin.from("meetings")
      .update({ status: "failed", error_message: `Upload ingest failed: ${message}`.slice(0, 500) })
      .eq("id", meetingId);
    return json({ error: message }, 502);
  }
}));
