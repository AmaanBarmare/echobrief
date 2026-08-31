/**
 * Regenerate a completed meeting's insights from its STORED transcript —
 * no re-transcription. Runs the shared post-transcription sequence
 * (translation, entity fix, zones, two-pass insights, metrics, coaching,
 * contacts, webhook) and replaces the meeting_insights row. This is how
 * meetings processed before 2026-08-31 get facts/coaching, and how a manual
 * speaker re-label propagates.
 *
 * Auth: user JWT (scoped to the caller's meetings) or service role (backfills).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.20.1";
import { authenticate, CORS_HEADERS, json } from "../_shared/auth.ts";
import { saveInsights, SpeakerSegment } from "../_shared/insights.ts";
import { afterInsightsSaved, meetingPatch, runPostTranscription } from "../_shared/post-transcription.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const caller = await authenticate(req, supabase);
  if (!caller.ok) return caller.response;

  const body = await req.json().catch(() => ({}));
  const meetingId = String(body.meeting_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(meetingId)) return json({ error: "meeting_id must be a uuid" }, 400);

  let meetingQuery = supabase.from("meetings").select("*").eq("id", meetingId);
  if (!caller.isService) meetingQuery = meetingQuery.eq("user_id", caller.userId);
  const { data: meeting } = await meetingQuery.maybeSingle();
  if (!meeting) return json({ error: "Meeting not found" }, 404);
  if (meeting.status !== "completed") return json({ error: `Meeting is ${meeting.status}, not completed` }, 409);

  const { data: transcript } = await supabase
    .from("transcripts")
    .select("id, content, speakers")
    .eq("meeting_id", meetingId)
    .maybeSingle();
  if (!transcript || !String(transcript.content ?? "").trim()) {
    return json({ error: "Meeting has no transcript to regenerate from" }, 409);
  }

  const segments: SpeakerSegment[] = (Array.isArray(transcript.speakers) ? transcript.speakers : [])
    .map((s: any) => ({
      speaker: String(s.speaker ?? "Unknown"),
      // Re-run from the ORIGINAL ASR text when we have it so translation and
      // corrections are applied fresh rather than stacked.
      text: String(s.original_text ?? s.text ?? ""),
      start: Number(s.start ?? 0),
      end: Number(s.end ?? 0),
      ...(s.speaker_id ? { speaker_id: s.speaker_id } : {}),
    }));

  const config = meeting.processing_config || {};
  const lastEnd = segments.reduce((m, s) => Math.max(m, Number(s.end) || 0), 0);
  const durationSeconds = Number(meeting.duration_seconds) || Math.round(lastEnd) || 0;
  const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

  try {
    const result = await runPostTranscription({
      supabase,
      openai,
      meeting,
      transcript: transcript.content,
      segments,
      recallTimeline: config.recall_speaker_timeline || [],
      durationSeconds,
    });

    // Replace, never stack: saveInsights is insert-only by design.
    await supabase.from("meeting_insights").delete().eq("meeting_id", meetingId);
    await saveInsights(supabase, meetingId, result.insights);
    await supabase
      .from("transcripts")
      .update({ content: result.correctedTranscript, speakers: result.zonedSegments })
      .eq("id", transcript.id);
    await supabase
      .from("meetings")
      .update(meetingPatch(result, config, { regenerated_at: new Date().toISOString() }))
      .eq("id", meetingId);
    await afterInsightsSaved(supabase, meeting, result.insights, "meeting.insights_regenerated");

    return json({
      success: true,
      meeting_id: meetingId,
      languages: result.languages,
      boundaries: result.boundaries,
      entity_corrections: result.entityCorrections.length,
      facts: {
        meeting_type: result.insights.facts?.meeting_type ?? null,
        numbers: result.insights.facts?.numbers?.length ?? 0,
        commitments: result.insights.facts?.commitments?.length ?? 0,
      },
      coaching: !!result.insights.coaching,
    });
  } catch (err) {
    console.error("[regenerate-insights] failed:", err);
    return json({ error: err instanceof Error ? err.message : "Regeneration failed" }, 500);
  }
});
