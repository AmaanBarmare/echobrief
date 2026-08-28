/**
 * Returns a short-lived playback URL for one meeting's recording, so the
 * dashboard can play it back on the meeting page.
 *
 * Two sources, in order:
 *   1. Recall's mixed mp4 (`video_mixed_mp4` in the bot's recording_config).
 *      Streamed straight from Recall — a 720p hour is 750 MB-1 GB, which the
 *      1 GB Supabase bucket cannot hold (see prune-recordings for what a full
 *      bucket did to the pipeline on 2026-08-14). Recall signs the URL and it
 *      expires in a few hours, so it is fetched per view and never stored.
 *   2. The archived mp3 in the `recordings` bucket, as a signed URL. Older
 *      meetings have no video artifact at all, and prune-recordings clears
 *      this audio a few days after transcription — hence `kind: "none"`.
 *
 * Auth: the caller's JWT is required and the meeting is read scoped to that
 * user, so one user can never mint a playback URL for another user's meeting.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { getRecallBot, getVideoDownloadUrl } from "../_shared/recall-pipeline.ts";

// Recall's signed URLs last ~5 h. Report a shorter life so the client refreshes
// well before the link dies mid-playback.
const VIDEO_URL_TTL_SECONDS = 4 * 60 * 60;
const AUDIO_URL_TTL_SECONDS = 60 * 60;

serve(async (req) => {
  const corsResponse = handleCorsPrelight(req);
  if (corsResponse) return corsResponse;

  const corsHeaders = getCorsHeaders(req.headers.get("origin"));
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }
    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }

    const { meeting_id } = await req.json();
    if (!meeting_id) {
      return new Response(JSON.stringify({ error: "Missing meeting_id" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const { data: meeting } = await supabase
      .from("meetings")
      .select("id, recall_bot_id, audio_url")
      .eq("id", meeting_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!meeting) {
      return new Response(JSON.stringify({ error: "Meeting not found" }), {
        status: 404,
        headers: jsonHeaders,
      });
    }

    // 1. Video from Recall.
    let videoStatus: string = "missing";
    if (meeting.recall_bot_id) {
      try {
        const botData = await getRecallBot(meeting.recall_bot_id);
        const video = await getVideoDownloadUrl(botData);
        videoStatus = video.status;
        if (video.url) {
          return new Response(
            JSON.stringify({
              kind: "video",
              url: video.url,
              content_type: "video/mp4",
              expires_at: new Date(Date.now() + VIDEO_URL_TTL_SECONDS * 1000).toISOString(),
            }),
            { headers: jsonHeaders },
          );
        }
      } catch (err) {
        // A Recall outage must not cost the user their audio fallback.
        console.warn("[get-recording-media] Recall lookup failed:", err);
        videoStatus = "unknown";
      }
    }

    // 2. Archived audio from Storage.
    if (meeting.audio_url) {
      const path = String(meeting.audio_url).replace(/^recordings\//, "");
      const { data: signed, error: signError } = await supabase.storage
        .from("recordings")
        .createSignedUrl(path, AUDIO_URL_TTL_SECONDS);
      if (!signError && signed?.signedUrl) {
        return new Response(
          JSON.stringify({
            kind: "audio",
            url: signed.signedUrl,
            content_type: "audio/mpeg",
            video_status: videoStatus,
            expires_at: new Date(Date.now() + AUDIO_URL_TTL_SECONDS * 1000).toISOString(),
          }),
          { headers: jsonHeaders },
        );
      }
      console.warn("[get-recording-media] Signing archived audio failed:", signError);
    }

    return new Response(
      JSON.stringify({
        kind: "none",
        // "processing" means the mp4 is still rendering and a retry will work;
        // anything else means there is nothing left to play.
        video_status: videoStatus,
      }),
      { headers: jsonHeaders },
    );
  } catch (error) {
    console.error("[get-recording-media] error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || "Failed to resolve recording" }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
