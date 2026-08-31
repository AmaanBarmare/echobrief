/**
 * Manual speaker re-label. Renames a speaker across the transcript segments,
 * insights (owners, highlights, timeline, metrics, facts, coaching), the Recall
 * timeline/participants, and records the override in
 * processing_config.speaker_overrides so a later regeneration keeps it.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate, CORS_HEADERS, json } from "../_shared/auth.ts";
import { renameInDecisions, renameSpeakerDeep } from "../_shared/rename.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const caller = await authenticate(req, supabase);
  if (!caller.ok) return caller.response;

  const body = await req.json().catch(() => ({}));
  const meetingId = String(body.meeting_id ?? "");
  const from = String(body.from ?? "").trim();
  const to = String(body.to ?? "").trim().replace(/\s+/g, " ");
  if (!/^[0-9a-f-]{36}$/i.test(meetingId)) return json({ error: "meeting_id must be a uuid" }, 400);
  if (!from) return json({ error: "from is required" }, 400);
  if (to.length < 1 || to.length > 80) return json({ error: "to must be 1–80 characters" }, 400);
  if (from.toLowerCase() === to.toLowerCase()) return json({ success: true, unchanged: true });

  let meetingQuery = supabase.from("meetings").select("id, user_id, processing_config").eq("id", meetingId);
  if (!caller.isService) meetingQuery = meetingQuery.eq("user_id", caller.userId);
  const { data: meeting } = await meetingQuery.maybeSingle();
  if (!meeting) return json({ error: "Meeting not found" }, 404);

  const { data: transcript } = await supabase
    .from("transcripts").select("id, speakers").eq("meeting_id", meetingId).maybeSingle();
  const { data: insights } = await supabase
    .from("meeting_insights")
    .select("id, action_items, decisions, speaker_highlights, timeline_entries, meeting_metrics, facts, coaching, follow_ups")
    .eq("meeting_id", meetingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let segmentsRenamed = 0;
  if (transcript && Array.isArray(transcript.speakers)) {
    const before = transcript.speakers as Array<{ speaker?: string }>;
    segmentsRenamed = before.filter((s) => String(s.speaker ?? "").trim().toLowerCase() === from.toLowerCase()).length;
    await supabase
      .from("transcripts")
      .update({ speakers: renameSpeakerDeep(before, from, to) })
      .eq("id", transcript.id);
  }

  if (insights) {
    await supabase
      .from("meeting_insights")
      .update({
        action_items: renameSpeakerDeep(insights.action_items, from, to),
        decisions: renameInDecisions(insights.decisions, from, to),
        speaker_highlights: renameSpeakerDeep(insights.speaker_highlights, from, to),
        timeline_entries: renameSpeakerDeep(insights.timeline_entries, from, to),
        meeting_metrics: renameSpeakerDeep(insights.meeting_metrics, from, to),
        facts: renameSpeakerDeep(insights.facts, from, to),
        coaching: renameSpeakerDeep(insights.coaching, from, to),
        follow_ups: renameSpeakerDeep(insights.follow_ups, from, to),
      })
      .eq("id", insights.id);
  }

  const config = meeting.processing_config || {};
  const overrides: Record<string, string> = { ...(config.speaker_overrides || {}) };
  // Chain: if "from" was itself the target of an earlier override, repoint it.
  for (const [k, v] of Object.entries(overrides)) {
    if (String(v).toLowerCase() === from.toLowerCase()) overrides[k] = to;
  }
  overrides[from] = to;
  // A rename back to the original leaves no-op entries behind — drop them.
  for (const [k, v] of Object.entries(overrides)) {
    if (k.trim().toLowerCase() === String(v).trim().toLowerCase()) delete overrides[k];
  }
  await supabase
    .from("meetings")
    .update({
      processing_config: {
        ...config,
        speaker_overrides: overrides,
        ...(Array.isArray(config.recall_speaker_timeline)
          ? { recall_speaker_timeline: renameSpeakerDeep(config.recall_speaker_timeline, from, to) }
          : {}),
        ...(Array.isArray(config.recall_participants)
          ? { recall_participants: renameSpeakerDeep(config.recall_participants, from, to) }
          : {}),
      },
    })
    .eq("id", meetingId);

  return json({ success: true, meeting_id: meetingId, from, to, segments_renamed: segmentsRenamed });
});
