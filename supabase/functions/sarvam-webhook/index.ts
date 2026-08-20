import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.20.1";
import {
  downloadAllSarvamResults,
  downloadSarvamResults,
} from "../_shared/sarvam.ts";
import { stitchChunkResults } from "../_shared/stitch.ts";
import {
  isLikelyHallucination,
  generateInsights,
  saveInsights,
  deliverResults,
  SpeakerSegment,
} from "../_shared/insights.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  try {
    const webhookSecret = Deno.env.get("SARVAM_WEBHOOK_SECRET");
    if (!webhookSecret) {
      console.error("SARVAM_WEBHOOK_SECRET not configured");
      return new Response("Server misconfigured", { status: 500 });
    }

    // Validate the callback token from Sarvam
    const authToken =
      req.headers.get("authorization")?.replace("Bearer ", "") ||
      req.headers.get("x-sarvam-job-callback-token") ||
      req.headers.get("auth_token");

    if (authToken !== webhookSecret) {
      console.error("Webhook auth mismatch");
      return new Response("Unauthorized", { status: 401 });
    }

    const payload = await req.json();
    const { job_id } = payload;
    // Sarvam sends "status" in their webhook callback, but our internal
    // trigger from check-recall-status sends "job_state". Support both.
    const rawState = payload.job_state || payload.status;

    if (!job_id) {
      return new Response("Missing job_id", { status: 400 });
    }

    const normalizedState = rawState?.toUpperCase();
    console.log(`Sarvam webhook: job=${job_id} state=${rawState} payload_keys=${Object.keys(payload).join(",")}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;
    const sarvamApiKey = Deno.env.get("SARVAM_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const openai = new OpenAI({ apiKey: openaiApiKey });

    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select("*")
      .eq("sarvam_job_id", job_id)
      .single();

    if (meetingError || !meeting) {
      console.error("No meeting found for sarvam_job_id:", job_id);
      return new Response("Meeting not found", { status: 404 });
    }

    // Idempotency guard: if the meeting already reached a terminal state
    // (completed / failed / cancelled) or is being transcribed by Whisper,
    // skip processing. This prevents cascade re-triggers.
    if (
      meeting.status === "completed" ||
      meeting.status === "failed" ||
      meeting.status === "cancelled" ||
      meeting.status === "transcribing"
    ) {
      console.log(`[sarvam-webhook] Meeting ${meeting.id} already ${meeting.status}, skipping`);
      return new Response(JSON.stringify({ success: true, skipped: true, reason: `already_${meeting.status}` }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const config = meeting.processing_config || {};

    if (normalizedState === "COMPLETED") {
      // Chunked path: audio was split into N chunks by the Vercel split-audio
      // function (one Sarvam job, N files). Download every chunk's output in
      // order, offset its timestamps by chunk_index * chunk_seconds, and merge
      // into a single result so everything downstream (hallucination check,
      // speaker mapping, insights) runs unchanged.
      const chunkCount = Number(config.chunk_count) || 0;
      const chunkSeconds = Number(config.chunk_seconds) || 300;
      const isChunked = config.split_method === "vercel-ffmpeg" && chunkCount >= 1;

      let result: Record<string, unknown>;
      let sttProvider = "sarvam";

      if (isChunked) {
        let chunkResults: Record<string, unknown>[] = [];
        // __harness_inline: test seam used by the pipeline harness to inject
        // ordered chunk results without creating a real Sarvam job. Production
        // callbacks never set it, so prod always downloads by output name
        // (guaranteed ordering) rather than trusting inline payload order.
        if (payload.__harness_inline && Array.isArray(payload.results?.transcripts)) {
          chunkResults = payload.results.transcripts;
          console.log(`[sarvam-webhook] Using ${chunkResults.length} inline chunk results (harness)`);
        } else {
          try {
            chunkResults = await downloadAllSarvamResults(sarvamApiKey, job_id);
          } catch (downloadErr) {
            const errMsg = downloadErr instanceof Error ? downloadErr.message : String(downloadErr);
            console.warn(
              `[sarvam-webhook] Chunked download failed for job ${job_id} (${errMsg}) — will fall back to Whisper`,
            );
            chunkResults = [];
          }
        }

        const stitched = stitchChunkResults(chunkResults, chunkSeconds);
        result = {
          transcript: stitched.transcript,
          language_code: stitched.language_code,
          diarized_transcript: stitched.diarized_transcript,
        };
        console.log(
          `[sarvam-webhook] Stitched ${chunkResults.length} chunks (${stitched.empty_chunks} empty) → ${stitched.transcript.length} chars, ${stitched.diarized_transcript.entries.length} diarized entries`,
        );

        // Chunk-wise Whisper fallback: if the whole chunked Sarvam job came
        // back empty, retry through the splitter's whisper mode. Each 300 s
        // chunk is ~1 MB, so this works for ANY meeting length — unlike the
        // legacy full-file forceWhisper path, which rejects >25 MB audio.
        if (!String((result as any).transcript || "").trim() && meeting.audio_url) {
          const splitUrl = Deno.env.get("SPLIT_AUDIO_URL");
          const splitSecret = Deno.env.get("SPLIT_AUDIO_SECRET");
          if (splitUrl && splitSecret) {
            console.warn(
              `[sarvam-webhook] Chunked job ${job_id} returned empty — retrying via chunk-wise Whisper`,
            );
            // Block concurrent re-entry while Whisper runs (same pattern as
            // the legacy fallback). Restored to the normal flow on success
            // because the completion update below sets status=completed.
            await supabase
              .from("meetings")
              .update({ status: "transcribing" })
              .eq("id", meeting.id);
            try {
              const storagePath = meeting.audio_url.replace(/^recordings\//, "");
              const { data: signed } = await supabase.storage
                .from("recordings")
                .createSignedUrl(storagePath, 3600);
              if (!signed?.signedUrl) throw new Error("could not sign audio URL");
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
              });
              if (!whisperRes.ok) {
                throw new Error(
                  `split-audio whisper mode returned ${whisperRes.status}: ${(await whisperRes.text()).substring(0, 200)}`,
                );
              }
              const w = await whisperRes.json();
              if (String(w.transcript || "").trim()) {
                result = {
                  transcript: w.transcript,
                  language_code: w.language_code || "unknown",
                  diarized_transcript: {
                    entries: (w.segments || []).map(
                      (s: { text: string; start: number; end: number }) => ({
                        speaker_id: "0",
                        transcript: s.text,
                        start_time_seconds: s.start,
                        end_time_seconds: s.end,
                      }),
                    ),
                  },
                };
                sttProvider = "whisper-chunked";
                console.log(
                  `[sarvam-webhook] Whisper-chunked fallback succeeded: ${String(w.transcript).length} chars, ${(w.segments || []).length} segments`,
                );
              }
              // Restore status so the normal completion flow (or the legacy
              // fallback below, if Whisper also returned empty) proceeds.
              await supabase
                .from("meetings")
                .update({ status: "processing" })
                .eq("id", meeting.id);
            } catch (whisperErr) {
              console.warn(
                "[sarvam-webhook] Whisper-chunked fallback failed, falling through to legacy path:",
                whisperErr,
              );
              await supabase
                .from("meetings")
                .update({ status: "processing" })
                .eq("id", meeting.id);
            }
          }
        }
      } else if (payload.results?.transcripts?.[0]) {
        result = payload.results.transcripts[0];
        console.log("Using results from webhook payload");
      } else {
        const fileName = config.audio_file_name || "audio.webm";
        const resultFileName = fileName.replace(/\.[^.]+$/, ".json");
        try {
          result = await downloadSarvamResults(
            sarvamApiKey,
            job_id,
            resultFileName,
          );
          console.log("Downloaded results from Sarvam API");
        } catch (downloadErr) {
          // Any download failure (missing output file, Sarvam server bug like
          // "KeyError: timestamps", 400/404, "no output file found", etc) means
          // Sarvam can't give us a transcript. Rather than throwing 500 and
          // getting retried forever by check-recall-status, set result to empty
          // so the downstream `!finalTranscript` branch triggers the Whisper
          // fallback automatically. The original error is logged for debugging.
          const errMsg = downloadErr instanceof Error ? downloadErr.message : String(downloadErr);
          console.warn(
            `[sarvam-webhook] Sarvam download failed for job ${job_id} (${errMsg}) — will fall back to Whisper`,
          );
          result = { transcript: "", language_code: "unknown", diarized_transcript: { entries: [] } };
        }
      }

      console.log("Result keys:", Object.keys(result).join(","));

      const transcript = (result as any).transcript || "";
      const languageCode = (result as any).language_code || "unknown";
      const diarizedEntries =
        (result as any).diarized_transcript?.entries || [];

      console.log(`Diarized entries count: ${diarizedEntries.length}`);
      if (diarizedEntries.length > 0) {
        console.log("First entry keys:", Object.keys(diarizedEntries[0]).join(","));
      }

      // Build initial speaker segments with acoustic labels
      const rawSegments: SpeakerSegment[] = diarizedEntries.map(
        (entry: any) => ({
          speaker: `SPEAKER_${String(entry.speaker_id || "0").padStart(2, "0")}`,
          text: entry.transcript || entry.text || "",
          start: entry.start_time_seconds ?? entry.start ?? 0,
          end: entry.end_time_seconds ?? entry.end ?? 0,
          speaker_id: entry.speaker_id || "0",
        }),
      );

      // Map each Sarvam segment to a real speaker name using Recall's timeline.
      // We match PER-SEGMENT (not per speaker_id) because Sarvam's diarization
      // in translate mode often assigns all segments to one speaker_id, even when
      // multiple people spoke. Recall knows exactly who spoke when.
      const recallTimeline: Array<{ speaker: string; start: number; end: number }> =
        config.recall_speaker_timeline || [];
      const recallParticipants: Array<{ id: number; name: string }> =
        config.recall_participants || [];
      const perSegmentSpeaker: (string | null)[] = rawSegments.map(() => null);

      // Fast path: if only one participant joined the meeting, every word
      // belongs to them. Recall's timeline has confidence-gated gaps (short
      // utterances like "hmm" fall outside speech_on/speech_off windows), so
      // relying on overlap alone spuriously creates a SPEAKER_01 phantom.
      if (recallParticipants.length === 1) {
        const soloName = recallParticipants[0].name;
        for (let i = 0; i < rawSegments.length; i++) {
          perSegmentSpeaker[i] = soloName;
        }
        console.log(
          `Speaker mapping: single-participant fast path → all segments attributed to "${soloName}"`,
        );
      } else if (recallTimeline.length > 0) {
        for (let i = 0; i < rawSegments.length; i++) {
          const seg = rawSegments[i];
          let bestOverlap = 0;
          let bestName = "";

          for (const rt of recallTimeline) {
            const overlapStart = Math.max(seg.start || 0, rt.start);
            const overlapEnd = Math.min(seg.end || 0, rt.end);
            const overlap = Math.max(0, overlapEnd - overlapStart);

            if (overlap > bestOverlap) {
              bestOverlap = overlap;
              bestName = rt.speaker;
            }
          }

          // If no overlap, fall back to nearest-in-time Recall entry instead
          // of SPEAKER_XX. A short utterance that slipped past Recall's speech
          // detection is still much more likely to be the nearest speaker than
          // a phantom diarization label.
          if (!bestName) {
            const segMid = ((seg.start || 0) + (seg.end || 0)) / 2;
            let bestDistance = Infinity;
            for (const rt of recallTimeline) {
              const rtMid = (rt.start + rt.end) / 2;
              const distance = Math.abs(segMid - rtMid);
              if (distance < bestDistance) {
                bestDistance = distance;
                bestName = rt.speaker;
              }
            }
          }

          if (bestName) {
            perSegmentSpeaker[i] = bestName;
          }
        }

        const namesFound = new Set(perSegmentSpeaker.filter(Boolean));
        console.log(
          `Speaker mapping (per-segment): ${namesFound.size} unique speakers found: ${[...namesFound].join(", ")}`,
        );
      }

      // Apply per-segment name mapping — fall back to acoustic label if no match
      const speakerSegments: SpeakerSegment[] = rawSegments.map((seg, i) => ({
        ...seg,
        speaker: perSegmentSpeaker[i] || seg.speaker,
      }));

      const hallucinated = isLikelyHallucination(transcript);
      if (hallucinated) {
        console.warn("Hallucinated Sarvam transcript, discarding:", transcript);
      }

      const finalTranscript = hallucinated ? "" : transcript;

      // If Sarvam returned empty/hallucinated transcript, fall back to Whisper
      // instead of saving "no clear speech" — the audio may be fine but Sarvam
      // couldn't handle it.
      if (!finalTranscript) {
        console.warn(`Sarvam returned empty transcript for job ${job_id}, falling back to Whisper`);

        // Mark meeting as "transcribing" to prevent check-recall-status from
        // re-triggering this webhook while Whisper is running.
        await supabase
          .from("meetings")
          .update({ status: "transcribing" })
          .eq("id", meeting.id);

        try {
          const fallbackUrl = `${supabaseUrl}/functions/v1/process-meeting`;
          const fallbackRes = await fetch(fallbackUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              meetingId: meeting.id,
              sendEmail: config.sendEmail,
              forceWhisper: true,
            }),
          });
          const fallbackResult = await fallbackRes.json().catch(() => ({}));
          console.log(`[sarvam-webhook] Whisper fallback response: ${fallbackRes.status}`, JSON.stringify(fallbackResult).substring(0, 300));

          return new Response(JSON.stringify({ success: true, fallback: "whisper", reason: "empty_sarvam_transcript" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (fallbackError) {
          console.error("Whisper fallback failed after empty Sarvam transcript:", fallbackError);
          await supabase
            .from("meetings")
            .update({ status: "failed", error_message: "Transcription failed: both Sarvam and Whisper could not process this recording." })
            .eq("id", meeting.id);
          return new Response(JSON.stringify({ success: false, error: "Both Sarvam and Whisper failed" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      const { data: existingTranscript } = await supabase
        .from("transcripts")
        .select("id")
        .eq("meeting_id", meeting.id)
        .single();

      if (!existingTranscript) {
        await supabase.from("transcripts").insert({
          meeting_id: meeting.id,
          content: finalTranscript,
          speakers: speakerSegments,
          word_timestamps: (result as any).timestamps || [],
          stt_provider: sttProvider,
          language_detected: languageCode,
        });
      }

      const insights = await generateInsights(
        openai,
        meeting,
        finalTranscript,
        speakerSegments,
      );
      await saveInsights(supabase, meeting.id, insights);

      const endTime = new Date();
      const startTime = new Date(meeting.start_time);
      // Prefer the real audio duration (persisted by the split path), then the
      // last transcript segment's end time, and only then wall-clock — which is
      // inflated by processing time and wildly wrong for recovered meetings.
      const audioDuration = Number(config.audio_duration_seconds) || 0;
      const lastSegmentEnd = speakerSegments.reduce(
        (max, seg) => Math.max(max, Number(seg.end) || 0),
        0,
      );
      const durationSeconds = Math.round(
        audioDuration ||
          lastSegmentEnd ||
          (endTime.getTime() - startTime.getTime()) / 1000,
      );

      await supabase
        .from("meetings")
        .update({
          status: "completed",
          end_time: endTime.toISOString(),
          duration_seconds: durationSeconds,
        })
        .eq("id", meeting.id);

      await deliverResults(supabase, meeting, insights, {
        sendEmail: config.sendEmail,
        supabaseUrl,
        supabaseServiceKey,
      });

      console.log(`Meeting ${meeting.id} completed via Sarvam`);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (normalizedState === "FAILED") {
      console.error(`Sarvam job ${job_id} failed, falling back to Whisper`);

      try {
        const fallbackUrl = `${supabaseUrl}/functions/v1/process-meeting`;
        await fetch(fallbackUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            meetingId: meeting.id,
            sendEmail: config.sendEmail,
            forceWhisper: true,
          }),
        });
      } catch (fallbackError) {
        console.error("Whisper fallback also failed:", fallbackError);
        await supabase
          .from("meetings")
          .update({ status: "failed" })
          .eq("id", meeting.id);
      }

      return new Response(JSON.stringify({ success: true, fallback: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Other states (Accepted, Pending, Running) — acknowledge and wait
    console.log(`Sarvam job ${job_id} in state ${rawState}, no action needed`);
    return new Response(JSON.stringify({ acknowledged: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Sarvam webhook error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});
