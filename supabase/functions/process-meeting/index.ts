import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.20.1";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import {
  createSarvamJob,
  uploadToSarvamJob,
  startSarvamJob,
} from "../_shared/sarvam.ts";
import {
  isLikelyHallucination,
  generateInsights,
  saveInsights,
  deliverResults,
  SpeakerSegment,
} from "../_shared/insights.ts";
import { computeConversationMetrics, mergeMeetingMetrics } from "../_shared/metrics.ts";

async function whisperTranscribe(
  openai: OpenAI,
  supabase: any,
  meeting: Record<string, any>,
  meetingId: string,
  sendEmail: boolean,
  supabaseUrl: string,
  supabaseServiceKey: string,
): Promise<{
  success: boolean;
  hasTranscript: boolean;
  hasInsights: boolean;
  hasSpeakerSegments: boolean;
  noAudioDetected: boolean;
  emailSent: boolean;
}> {
  let transcript = "";
  let speakerSegments: SpeakerSegment[] = [];
  let wordTimestamps: any[] = [];

  if (meeting.audio_url) {
    try {
      const { data: audioData, error: downloadError } =
        await supabase.storage
          .from("recordings")
          .download(meeting.audio_url.replace("recordings/", ""));

      if (downloadError) {
        console.error("Audio download error:", downloadError);
        throw new Error("Failed to download audio file");
      }

      const audioSizeMB = audioData.size / 1024 / 1024;
      const isMP3 = meeting.audio_url.includes(".mp3");
      const fileName = isMP3 ? "audio.mp3" : "audio.webm";
      const mimeType = isMP3 ? "audio/mpeg" : "audio/webm";
      console.log(`[whisper] Audio size: ${audioSizeMB.toFixed(2)} MB, format: ${fileName}`);

      // Whisper API has a 25MB file size limit.
      // Splitting compressed audio (MP3/WebM) at arbitrary byte boundaries produces
      // invalid audio that Whisper can't decode, so we don't attempt chunking.
      const WHISPER_SIZE_LIMIT = 24.5 * 1024 * 1024; // 24.5 MB with safety margin

      if (audioData.size > WHISPER_SIZE_LIMIT) {
        console.error(`[whisper] Audio file (${audioSizeMB.toFixed(1)} MB) exceeds Whisper 25MB limit — cannot transcribe`);
        throw new Error(`Audio file too large for Whisper (${audioSizeMB.toFixed(1)} MB). Whisper supports up to 25 MB.`);
      }

      const audioFile = new File([audioData], fileName, { type: mimeType });
      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
        language: "en",
        response_format: "verbose_json",
      });

      transcript = transcription.text;
      wordTimestamps = transcription.words || [];

      const hallucinated = isLikelyHallucination(transcript);
      if (hallucinated) {
        console.warn(
          "Hallucinated transcript detected, discarding:",
          transcript,
        );
        transcript = "";
        wordTimestamps = [];
      }

      if (!hallucinated) {
        const segments = (transcription as any).segments || [];
        const attendeesList = (meeting.attendees || [])
          .map((a: any) => a.displayName || a.email?.split("@")[0])
          .filter(Boolean);

        if (segments.length > 0 && attendeesList.length > 0) {
          const speakerPrompt = `Given a meeting with these participants: ${attendeesList.join(", ")}

Analyze these transcript segments and identify which participant is most likely speaking in each segment based on context, speaking style, and content. If you can't confidently identify a speaker, use "Speaker 1", "Speaker 2", etc.

Segments:
${segments.map((s: any, i: number) => `[${i}] "${s.text}"`).join("\n")}

Respond with a JSON array where each element has:
- "segment_index": the segment number
- "speaker": the participant name or "Speaker N"
- "confidence": "high", "medium", or "low"

Only include segments where you can make a reasonable attribution.`;

          try {
            const speakerAttribution =
              await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                  {
                    role: "system",
                    content:
                      "You are an expert at identifying speakers in meeting transcripts. Be conservative - only attribute speakers when you're reasonably confident.",
                  },
                  { role: "user", content: speakerPrompt },
                ],
                response_format: { type: "json_object" },
              });

            const attributionText =
              speakerAttribution.choices[0]?.message?.content || "{}";
            const attributions = JSON.parse(attributionText);
            const attributionMap = new Map();

            if (Array.isArray(attributions.speakers)) {
              attributions.speakers.forEach((a: any) => {
                if (a.confidence !== "low") {
                  attributionMap.set(a.segment_index, a.speaker);
                }
              });
            }

            speakerSegments = segments.map((s: any, i: number) => ({
              speaker:
                attributionMap.get(i) || `Speaker ${(i % 2) + 1}`,
              text: s.text,
              start: s.start,
              end: s.end,
            }));
          } catch (speakerError) {
            console.error("Speaker attribution error:", speakerError);
            speakerSegments = segments.map((s: any, i: number) => ({
              speaker: `Speaker ${(i % 2) + 1}`,
              text: s.text,
              start: s.start,
              end: s.end,
            }));
          }
        }
      }

      const { data: existingTranscript } = await supabase
        .from("transcripts")
        .select("id")
        .eq("meeting_id", meetingId)
        .single();

      // Only persist a transcript when there is something to persist. Writing a
      // placeholder "no clear speech" row made a failed transcription look like a
      // successful one to every downstream reader (and to the evals).
      if (!existingTranscript && transcript.trim()) {
        await supabase.from("transcripts").insert({
          meeting_id: meetingId,
          content: transcript,
          speakers: speakerSegments,
          word_timestamps: wordTimestamps,
          stt_provider: "whisper",
        });
      }
    } catch (transcribeError) {
      const errMsg = transcribeError instanceof Error ? transcribeError.message : String(transcribeError);
      console.error("Transcription error:", errMsg);
      // If the file is too large for Whisper, save a clear error instead of
      // proceeding with an empty transcript that produces "no speech detected".
      if (errMsg.includes("too large")) {
        await supabase
          .from("meetings")
          .update({ status: "failed", error_message: errMsg })
          .eq("id", meetingId);
        return {
          success: false,
          hasTranscript: false,
          hasInsights: false,
          hasSpeakerSegments: false,
          noAudioDetected: false,
          emailSent: false,
        };
      }
      transcript = "";
    }
  }

  const noUsableTranscript = !transcript || transcript.trim().length < 20;
  const endTime = new Date();

  // A meeting with no usable transcript is a FAILURE, not a completion.
  // Writing status="completed" here is how 66-72 min meetings ended up in the
  // dashboard looking fine while their insights read "No clear speech detected"
  // — a terminal status the stuck-meeting monitor never inspects, so nobody was
  // ever told. Mark it failed so the monitor and the user both see it, and skip
  // insight generation + delivery (there is nothing to summarise or send).
  if (noUsableTranscript) {
    console.error(
      `[whisper] No usable transcript for meeting ${meetingId} — marking failed instead of completed`,
    );
    await supabase
      .from("meetings")
      .update({
        status: "failed",
        end_time: endTime.toISOString(),
        error_message:
          "No usable transcript could be produced from this recording. The audio may have been silent, or both Sarvam and Whisper failed to transcribe it.",
      })
      .eq("id", meetingId);

    return {
      success: false,
      hasTranscript: false,
      hasInsights: false,
      hasSpeakerSegments: speakerSegments.length > 0,
      noAudioDetected: true,
      emailSent: false,
    };
  }

  const startTime = new Date(meeting.start_time);
  // Same precedence as sarvam-webhook: real audio duration (written by the
  // split path) first, then the last transcript segment's end time, and only
  // then wall-clock — which counts processing time and is wildly wrong for
  // meetings recovered hours later. Computed before saveInsights because
  // silence_percentage is measured against this duration.
  const audioDuration =
    Number(meeting.processing_config?.audio_duration_seconds) || 0;
  const lastSegmentEnd = speakerSegments.reduce(
    (max, seg) => Math.max(max, Number(seg.end) || 0),
    0,
  );
  const durationSeconds = Math.round(
    audioDuration ||
      lastSegmentEnd ||
      (endTime.getTime() - startTime.getTime()) / 1000,
  );

  const insights = await generateInsights(
    openai,
    meeting,
    transcript,
    speakerSegments,
  );
  // Whitelist merge: only sentiment_score survives from the model.
  insights.meeting_metrics = mergeMeetingMetrics(
    insights.meeting_metrics,
    computeConversationMetrics(speakerSegments, durationSeconds),
  );
  await saveInsights(supabase, meetingId, insights);

  await supabase
    .from("meetings")
    .update({
      status: "completed",
      end_time: endTime.toISOString(),
      duration_seconds: durationSeconds,
    })
    .eq("id", meetingId);

  const { emailSent } = await deliverResults(
    supabase,
    meeting,
    insights,
    { sendEmail, supabaseUrl, supabaseServiceKey },
  );

  return {
    success: true,
    hasTranscript: true,
    hasInsights: true,
    hasSpeakerSegments: speakerSegments.length > 0,
    noAudioDetected: false,
    emailSent,
  };
}

serve(async (req) => {
  const corsResponse = handleCorsPrelight(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    const { meetingId, sendEmail, forceWhisper } = await req.json();

    if (!meetingId) {
      return new Response(
        JSON.stringify({ error: "Meeting ID is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    const sarvamApiKey = Deno.env.get("SARVAM_API_KEY");
    const sarvamWebhookSecret = Deno.env.get("SARVAM_WEBHOOK_SECRET");

    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const openai = new OpenAI({ apiKey: openaiApiKey });

    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select("*")
      .eq("id", meetingId)
      .single();

    if (meetingError || !meeting) {
      return new Response(
        JSON.stringify({ error: "Meeting not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    await supabase
      .from("meetings")
      .update({ status: "processing" })
      .eq("id", meetingId);

    // --- Sarvam path (default, skipped when forceWhisper is set) ---
    if (!forceWhisper && sarvamApiKey && sarvamWebhookSecret && meeting.audio_url) {
      try {
        const { data: audioData, error: downloadError } =
          await supabase.storage
            .from("recordings")
            .download(meeting.audio_url.replace("recordings/", ""));

        if (downloadError) throw new Error("Failed to download audio file");

        const callbackUrl = `${supabaseUrl}/functions/v1/sarvam-webhook`;

        const job = await createSarvamJob(
          sarvamApiKey,
          callbackUrl,
          sarvamWebhookSecret,
        );
        console.log("Sarvam job created:", job.job_id);

        const fileName = "audio.webm";
        await uploadToSarvamJob(
          sarvamApiKey,
          job.job_id,
          fileName,
          audioData,
        );
        console.log("Audio uploaded to Sarvam job");

        await startSarvamJob(sarvamApiKey, job.job_id);
        console.log("Sarvam job started:", job.job_id);

        // MERGE, never overwrite: processing_config carries the Recall speaker
        // timeline, participant list and chunk metadata written by
        // recall-pipeline. A blind overwrite here silently destroys speaker-name
        // resolution and chunk stitching for the meeting.
        await supabase
          .from("meetings")
          .update({
            sarvam_job_id: job.job_id,
            processing_config: {
              ...(meeting.processing_config || {}),
              sendEmail: sendEmail ?? meeting.processing_config?.sendEmail ?? false,
              audio_file_name: fileName,
            },
          })
          .eq("id", meetingId);

        return new Response(
          JSON.stringify({
            success: true,
            meetingId,
            provider: "sarvam",
            sarvamJobId: job.job_id,
            message: "Audio submitted to Sarvam for processing. Results will arrive via webhook.",
          }),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        );
      } catch (sarvamError) {
        console.error(
          "Sarvam submission failed, falling back to Whisper:",
          sarvamError,
        );
      }
    }

    // --- Whisper fallback ---
    const result = await whisperTranscribe(
      openai,
      supabase,
      meeting,
      meetingId,
      sendEmail,
      supabaseUrl,
      supabaseServiceKey,
    );

    return new Response(
      JSON.stringify({ ...result, provider: "whisper", meetingId }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Process meeting error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
