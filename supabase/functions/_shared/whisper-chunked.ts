/**
 * Chunk-wise Whisper via the Vercel splitter.
 *
 * Whole-file Whisper rejects uploads over 25 MB and OOMs the edge function
 * around 15 MB. Long Recall recordings are ~1 MB per 5 minutes at 128 kbps,
 * so a 50-minute call is ~49 MB — guaranteed to fail on the in-edge path.
 * `api/split-audio?transcribe=whisper` cuts the same file into 300 s chunks
 * (~1 MB each) and transcribes them off-edge.
 */

export const LONG_MEETING_SECONDS = 360; // matches split-audio SINGLE_FILE_MAX_SECONDS
export const WHISPER_WHOLE_FILE_MAX_BYTES = 24.5 * 1024 * 1024;
export const SPLIT_AUDIO_WHISPER_TIMEOUT_MS = 270_000;

export type ChunkedWhisperEntry = {
  speaker_id: string;
  transcript: string;
  start_time_seconds: number;
  end_time_seconds: number;
};

export type ChunkedWhisperResult = {
  transcript: string;
  language_code: string;
  diarized_transcript: { entries: ChunkedWhisperEntry[] };
  duration_seconds?: number;
};

export function isLongMeeting(
  config: Record<string, unknown> | null | undefined,
): boolean {
  const c = config || {};
  const duration = Number(c.audio_duration_seconds) || 0;
  const chunkCount = Number(c.chunk_count) || 0;
  const split = String(c.split_method || "");
  if (duration > LONG_MEETING_SECONDS) return true;
  if (split === "vercel-ffmpeg" && chunkCount > 1) return true;
  return false;
}

export function splitAudioConfigured(): boolean {
  return !!(Deno.env.get("SPLIT_AUDIO_URL") && Deno.env.get("SPLIT_AUDIO_SECRET"));
}

export function splitAudioResultToSarvamShape(w: {
  transcript?: string;
  language_code?: string;
  segments?: Array<{ text?: string; start?: number; end?: number }>;
  duration_seconds?: number;
}): ChunkedWhisperResult {
  const transcript = String(w.transcript || "").trim();
  const entries: ChunkedWhisperEntry[] = (w.segments || [])
    .map((s) => ({
      speaker_id: "0",
      transcript: String(s.text || "").trim(),
      start_time_seconds: Number(s.start || 0),
      end_time_seconds: Number(s.end || 0),
    }))
    .filter((e) => e.transcript);
  return {
    transcript,
    language_code: w.language_code || "unknown",
    diarized_transcript: { entries },
    duration_seconds: w.duration_seconds,
  };
}

/**
 * Sign the stored audio and transcribe it through split-audio whisper mode.
 * Throws if the splitter is not configured, the call fails, or the transcript
 * is empty. Never downloads the audio into this isolate.
 */
export async function transcribeViaSplitAudio(
  supabase: any,
  audioUrl: string,
): Promise<ChunkedWhisperResult> {
  const splitUrl = Deno.env.get("SPLIT_AUDIO_URL");
  const splitSecret = Deno.env.get("SPLIT_AUDIO_SECRET");
  if (!splitUrl || !splitSecret) {
    throw new Error("SPLIT_AUDIO_URL or SPLIT_AUDIO_SECRET not configured");
  }
  const storagePath = audioUrl.replace(/^recordings\//, "");
  const { data: signed } = await supabase.storage
    .from("recordings")
    .createSignedUrl(storagePath, 3600);
  if (!signed?.signedUrl) throw new Error("could not sign audio URL");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SPLIT_AUDIO_WHISPER_TIMEOUT_MS);
  try {
    const whisperRes = await fetch(splitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${splitSecret}`,
      },
      body: JSON.stringify({
        audioUrl: signed.signedUrl,
        transcribe: "whisper",
      }),
      signal: controller.signal,
    });
    if (!whisperRes.ok) {
      throw new Error(
        `split-audio whisper mode returned ${whisperRes.status}: ${(await whisperRes.text()).substring(0, 200)}`,
      );
    }
    const w = await whisperRes.json();
    const shaped = splitAudioResultToSarvamShape(w);
    if (!shaped.transcript) {
      throw new Error("split-audio whisper mode returned an empty transcript");
    }
    return shaped;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(
        `split-audio whisper mode timed out after ${SPLIT_AUDIO_WHISPER_TIMEOUT_MS / 1000}s`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
