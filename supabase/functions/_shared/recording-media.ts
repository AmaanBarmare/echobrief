/**
 * Resolve a short-lived playback URL for one meeting's recording.
 *
 * Lifted out of `get-recording-media` when share links learned to carry the
 * recording: the owner's dashboard and an anonymous share page need exactly the
 * same resolution (Recall's signed mp4, else the archived mp3, else nothing) and
 * differ only in how the caller earned the right to ask. Authorisation stays in
 * the call sites — this module is handed a meeting row and never decides who
 * may see it.
 */
import { getRecallBot, getVideoDownloadUrl } from "./recall-pipeline.ts";

// Recall's signed URLs last ~5 h. Report a shorter life so the client refreshes
// well before the link dies mid-playback.
export const VIDEO_URL_TTL_SECONDS = 4 * 60 * 60;
export const AUDIO_URL_TTL_SECONDS = 60 * 60;

export interface RecordingMeetingRow {
  recall_bot_id?: string | null;
  audio_url?: string | null;
}

export interface RecordingMedia {
  kind: "video" | "audio" | "none";
  url?: string;
  content_type?: string;
  video_status?: string;
  expires_at?: string;
}

/** `supabase` is a service-role client; the caller has already authorised this read. */
// deno-lint-ignore no-explicit-any
export async function resolveRecordingMedia(
  supabase: any,
  meeting: RecordingMeetingRow,
): Promise<RecordingMedia> {
  // 1. Video from Recall.
  let videoStatus = "missing";
  if (meeting.recall_bot_id) {
    try {
      const botData = await getRecallBot(meeting.recall_bot_id);
      const video = await getVideoDownloadUrl(botData);
      videoStatus = video.status;
      if (video.url) {
        return {
          kind: "video",
          url: video.url,
          content_type: "video/mp4",
          video_status: videoStatus,
          expires_at: new Date(Date.now() + VIDEO_URL_TTL_SECONDS * 1000).toISOString(),
        };
      }
    } catch (err) {
      // A Recall outage must not cost the viewer their audio fallback.
      console.warn("[recording-media] Recall lookup failed:", err);
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
      return {
        kind: "audio",
        url: signed.signedUrl,
        content_type: "audio/mpeg",
        video_status: videoStatus,
        expires_at: new Date(Date.now() + AUDIO_URL_TTL_SECONDS * 1000).toISOString(),
      };
    }
    console.warn("[recording-media] Signing archived audio failed:", signError);
  }

  // "processing" means the mp4 is still rendering and a retry will work;
  // anything else means there is nothing left to play.
  return { kind: "none", video_status: videoStatus };
}
