import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.20.1";
import {
  downloadAllSarvamResults,
  downloadSarvamResults,
} from "../_shared/sarvam.ts";
import { stitchChunkResults } from "../_shared/stitch.ts";
import { computeConversationMetrics, mergeMeetingMetrics } from "../_shared/metrics.ts";
import { fetchSpeakerContext } from "../_shared/recall-pipeline.ts";
import {
  isLikelyHallucination,
  generateInsights,
  saveInsights,
  deliverResults,
  SpeakerSegment,
} from "../_shared/insights.ts";
import {
  isLongMeeting,
  transcribeViaSplitAudio,
} from "../_shared/whisper-chunked.ts";
import { annotateZones, computeBoundaries, meetingZone } from "../_shared/zones.ts";
import { annotateLanguages, languageMix } from "../_shared/language.ts";
import { translateLeakedSegments } from "../_shared/translate-leaks.ts";
import { buildVocabulary, correctEntities } from "../_shared/vocab.ts";
import { generateCoaching } from "../_shared/coaching.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  // Set once this invocation owns the in-flight claim below; released if the
  // run then throws, so an immediate retry can pick the meeting back up instead
  // of waiting out the staleness window.
  let claimedMeetingId: string | null = null;
  let claimReleaser: any = null;

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
    claimReleaser = supabase;
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

    // Atomic in-flight claim. Sarvam re-fires the SAME callback every ~8 s while
    // this handler is still working (it answers only after download → stitch →
    // GPT insights → email, ~20 s), and the status guard above cannot stop those
    // retries: each one reads the row before any of them writes `completed`. On
    // 2026-08-21 three callbacks for one job each ran the full pipeline and each
    // sent a summary email. Claims older than CLAIM_STALE_MS are re-claimable so
    // an invocation that dies mid-way never strands the meeting.
    const CLAIM_STALE_MS = 10 * 60 * 1000;
    const isTerminalCallback =
      normalizedState === "COMPLETED" || normalizedState === "FAILED";

    if (isTerminalCallback) {
      const staleBefore = new Date(Date.now() - CLAIM_STALE_MS).toISOString();
      const { data: claimed } = await supabase
        .from("meetings")
        .update({ sarvam_webhook_claimed_at: new Date().toISOString() })
        .eq("id", meeting.id)
        .or(
          `sarvam_webhook_claimed_at.is.null,sarvam_webhook_claimed_at.lt.${staleBefore}`,
        )
        .select("id")
        .maybeSingle();

      if (!claimed) {
        console.log(
          `[sarvam-webhook] Meeting ${meeting.id} is already being processed by another invocation — skipping duplicate ${normalizedState} callback`,
        );
        return new Response(
          JSON.stringify({ success: true, skipped: true, reason: "already_in_flight" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      claimedMeetingId = meeting.id;
    }

    if (normalizedState === "COMPLETED" || normalizedState === "FAILED") {
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

      if (normalizedState === "FAILED") {
        // Job-level failure still has the archived audio. Do not jump to
        // whole-file Whisper — that path rejects anything over 25 MB.
        console.error(`Sarvam job ${job_id} failed — will try chunk-wise Whisper`);
        result = { transcript: "", language_code: "unknown", diarized_transcript: { entries: [] } };
      } else if (isChunked) {
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

      // Chunk-wise Whisper fallback: whenever Sarvam hands back nothing —
      // whether the chunked job stitched to empty or a whole-file submission hit
      // the long-audio bug — retry through the splitter's whisper mode. Each
      // chunk is ~1 MB, so this works for ANY meeting length, unlike the legacy
      // full-file forceWhisper path which rejects >25 MB audio outright. This
      // runs for the direct-fallback path too: that is exactly the case where a
      // 70-minute meeting used to end up "completed" with no transcript.
      if (!String((result as any).transcript || "").trim() && meeting.audio_url) {
        console.warn(
          `[sarvam-webhook] Job ${job_id} returned an empty transcript (split_method=${config.split_method || "none"}) — retrying via chunk-wise Whisper`,
        );
        // Block concurrent re-entry while Whisper runs (same pattern as
        // the legacy fallback). Restored to the normal flow on success
        // because the completion update below sets status=completed.
        await supabase
          .from("meetings")
          .update({ status: "transcribing" })
          .eq("id", meeting.id);
        try {
          const w = await transcribeViaSplitAudio(supabase, meeting.audio_url);
          result = {
            transcript: w.transcript,
            language_code: w.language_code,
            diarized_transcript: w.diarized_transcript,
          };
          sttProvider = "whisper-chunked";
          console.log(
            `[sarvam-webhook] Whisper-chunked fallback succeeded: ${w.transcript.length} chars, ${w.diarized_transcript.entries.length} segments`,
          );
          await supabase
            .from("meetings")
            .update({ status: "processing" })
            .eq("id", meeting.id);
        } catch (whisperErr) {
          console.warn(
            "[sarvam-webhook] Whisper-chunked fallback failed:",
            whisperErr,
          );
          await supabase
            .from("meetings")
            .update({ status: "processing" })
            .eq("id", meeting.id);
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
      let recallTimeline: Array<{ speaker: string; start: number; end: number }> =
        config.recall_speaker_timeline || [];
      let recallParticipants: Array<{ id: number; name: string }> =
        config.recall_participants || [];

      // Second attempt at the Recall transcript. Bots use recallai_streaming in
      // "prioritize_accuracy" mode, which Recall documents as delayed by 3-10
      // minutes, but recall-pipeline asks for it the moment audio_mixed.done
      // fires — usually far too early, so the timeline was stored as null and
      // every speaker fell back to SPEAKER_XX. Measured 2026-08-20: only 1 of
      // the last 25 recall meetings had a timeline. Sarvam has since spent
      // minutes transcribing, so by now it is normally available.
      const botId = config.recall_bot_id;
      if (recallTimeline.length === 0 && botId) {
        try {
          const ctx = await fetchSpeakerContext(botId);
          if (ctx.timeline.length > 0) {
            recallTimeline = ctx.timeline;
            if (ctx.participants.length > 0) recallParticipants = ctx.participants;
            // Persist so reruns and the evals see the same attribution.
            await supabase
              .from("meetings")
              .update({
                processing_config: {
                  ...config,
                  recall_speaker_timeline: recallTimeline,
                  recall_participants: recallParticipants,
                },
              })
              .eq("id", meeting.id);
            console.log(
              `[sarvam-webhook] Recovered Recall speaker context on retry: ${recallTimeline.length} entries, ${recallParticipants.length} participants`,
            );
          } else {
            console.warn(
              `[sarvam-webhook] Recall transcript still unavailable for bot ${botId} — speakers will stay generic`,
            );
          }
        } catch (err) {
          console.warn("[sarvam-webhook] Recall speaker-context retry failed:", err);
        }
      }
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
        // Long recordings cannot use in-edge whole-file Whisper (25 MB / ~15 MB
        // OOM). Chunk-wise already ran above; falling through would only rewrite
        // the meeting as "Audio file too large for Whisper".
        if (isLongMeeting(config)) {
          const errMsg =
            "Transcription failed: Sarvam returned an empty transcript and chunk-wise Whisper did not produce one. Whole-file Whisper is skipped for long recordings.";
          console.error(`[sarvam-webhook] ${errMsg} job=${job_id}`);
          await supabase
            .from("meetings")
            .update({ status: "failed", error_message: errMsg })
            .eq("id", meeting.id);
          return new Response(
            JSON.stringify({ success: false, error: errMsg, fallback: "whisper-chunked" }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

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

      // ---- Production-quality passes (2026-08-31 plan) -------------------
      // 1. Entity-spelling correction: vocabulary from the calendar + the
      //    user's custom list; every change is logged, never a rewrite.
      const { data: ownerProfile } = await supabase
        .from("profiles")
        .select("custom_vocabulary")
        .eq("user_id", meeting.user_id)
        .maybeSingle();
      const vocabulary = buildVocabulary(
        meeting.attendees ?? [],
        ownerProfile?.custom_vocabulary ?? [],
      );
      // Language tags + the meeting-level mix reflect what was SPOKEN, so
      // they are computed before the leaked-Devanagari translation pass.
      const languageTagged = annotateLanguages(speakerSegments);
      const languages = languageMix(languageTagged);
      const translatedSegments = await translateLeakedSegments(openai, languageTagged);

      const entityCorrections: Array<{ from: string; to: string }> = [];
      const correctedSegments = translatedSegments.map((seg) => {
        const fixed = correctEntities(seg.text, vocabulary);
        entityCorrections.push(...fixed.corrections);
        return { ...seg, text: fixed.text };
      });
      if (entityCorrections.length > 0) {
        console.log(
          `[sarvam-webhook] Entity corrections: ${entityCorrections.slice(0, 10).map((c) => `${c.from}→${c.to}`).join(", ")}${entityCorrections.length > 10 ? ` (+${entityCorrections.length - 10} more)` : ""}`,
        );
      }

      // 2. Boundary zones (privacy trim). The stored transcript content is
      //    rebuilt from the translated/corrected segments so it matches them.
      const boundaries = computeBoundaries(meeting.attendees ?? [], recallTimeline);
      const zonedSegments = annotateZones(correctedSegments, boundaries);
      const correctedTranscript = zonedSegments.length > 0
        ? zonedSegments.map((s) => s.text).join(" ")
        : correctEntities(finalTranscript, vocabulary).text;
      const insightSegments = meetingZone(zonedSegments);
      const trimmedCount = zonedSegments.length - insightSegments.length;
      if (trimmedCount > 0) {
        console.log(
          `[sarvam-webhook] Boundary trim: ${trimmedCount} of ${zonedSegments.length} segments are internal pre/post chatter (window ${boundaries.first_external_join_ts}s–${boundaries.last_external_leave_ts}s)`,
        );
      }
      const insightTranscript = insightSegments.length > 0
        ? insightSegments.map((s) => s.text).join(" ")
        : correctedTranscript;
      // --------------------------------------------------------------------

      const { data: existingTranscript } = await supabase
        .from("transcripts")
        .select("id")
        .eq("meeting_id", meeting.id)
        .single();

      if (!existingTranscript) {
        await supabase.from("transcripts").insert({
          meeting_id: meeting.id,
          content: correctedTranscript,
          speakers: zonedSegments,
          word_timestamps: (result as any).timestamps || [],
          stt_provider: sttProvider,
          language_detected: languageCode,
        });
      }

      const endTime = new Date();
      const startTime = new Date(meeting.start_time);
      // Prefer the real audio duration (persisted by the split path), then the
      // last transcript segment's end time, and only then wall-clock — which is
      // inflated by processing time and wildly wrong for recovered meetings.
      // Computed before saveInsights because silence_percentage is measured
      // against this duration.
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

      // Insights and metrics see the MEETING zone only — pre-call chatter and
      // the post-call debrief must never leak into a summary a prospect can
      // read. Metrics timestamps are shifted to the zone window so silence
      // and lead-in are measured against the external-facing call, not the
      // bot's whole recording.
      const insights = await generateInsights(
        openai,
        meeting,
        insightTranscript,
        insightSegments,
        { vocabulary },
      );
      const zoneStart = boundaries.first_external_join_ts ?? 0;
      const zoneEnd = boundaries.last_external_leave_ts !== null
        ? Math.min(boundaries.last_external_leave_ts, durationSeconds || Infinity)
        : durationSeconds;
      const metricsDuration = Math.max(0, Math.round((zoneEnd || durationSeconds) - zoneStart)) || durationSeconds;
      const metricsSegments = insightSegments.map((s) => ({
        ...s,
        start: Math.max(0, Number(s.start ?? 0) - zoneStart),
        end: Math.max(0, Number(s.end ?? 0) - zoneStart),
      }));
      // Whitelist merge: only sentiment_score survives from the model.
      insights.meeting_metrics = mergeMeetingMetrics(
        insights.meeting_metrics,
        computeConversationMetrics(metricsSegments, metricsDuration),
      );
      insights.coaching = await generateCoaching(
        openai,
        meeting,
        insights.facts ?? null,
        insights.meeting_metrics,
        insightSegments,
      );
      await saveInsights(supabase, meeting.id, insights);

      await supabase
        .from("meetings")
        .update({
          status: "completed",
          end_time: endTime.toISOString(),
          duration_seconds: durationSeconds,
          languages: Object.keys(languages).length > 0 ? languages : null,
          boundaries,
          processing_config: {
            ...config,
            ...(recallTimeline.length > 0 ? { recall_speaker_timeline: recallTimeline } : {}),
            ...(recallParticipants.length > 0 ? { recall_participants: recallParticipants } : {}),
            ...(entityCorrections.length > 0
              ? { entity_corrections: entityCorrections.slice(0, 50) }
              : {}),
          },
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

    // Other states (Accepted, Pending, Running) — acknowledge and wait
    console.log(`Sarvam job ${job_id} in state ${rawState}, no action needed`);
    return new Response(JSON.stringify({ acknowledged: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Sarvam webhook error:", error);
    if (claimedMeetingId && claimReleaser) {
      await claimReleaser
        .from("meetings")
        .update({ sarvam_webhook_claimed_at: null })
        .eq("id", claimedMeetingId);
      console.log(`[sarvam-webhook] Released in-flight claim on ${claimedMeetingId} after error`);
    }
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
