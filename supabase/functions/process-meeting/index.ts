import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.20.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { meetingId } = await req.json();
    
    if (!meetingId) {
      return new Response(
        JSON.stringify({ error: "Meeting ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const openai = new OpenAI({ apiKey: openaiApiKey });

    // Get meeting details
    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select("*")
      .eq("id", meetingId)
      .single();

    if (meetingError || !meeting) {
      return new Response(
        JSON.stringify({ error: "Meeting not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update status to processing
    await supabase
      .from("meetings")
      .update({ status: "processing" })
      .eq("id", meetingId);

    let transcript = "";

    // If there's an audio file, transcribe it
    if (meeting.audio_url) {
      try {
        // Download the audio file
        const { data: audioData, error: downloadError } = await supabase.storage
          .from("recordings")
          .download(meeting.audio_url.replace("recordings/", ""));

        if (downloadError) {
          console.error("Audio download error:", downloadError);
          throw new Error("Failed to download audio file");
        }

        // Convert to File for OpenAI
        const audioFile = new File([audioData], "audio.webm", { type: "audio/webm" });

        // Transcribe with Whisper
        const transcription = await openai.audio.transcriptions.create({
          file: audioFile,
          model: "whisper-1",
          language: "en",
          response_format: "verbose_json",
        });

        transcript = transcription.text;

        // Save transcript
        await supabase.from("transcripts").insert({
          meeting_id: meetingId,
          content: transcript,
          speakers: [],
          word_timestamps: (transcription as any).words || [],
        });
      } catch (transcribeError) {
        console.error("Transcription error:", transcribeError);
        // Continue with empty transcript if transcription fails
        transcript = "Transcription failed. Please check the audio file.";
      }
    }

    // Generate AI insights
    const insightsPrompt = `Analyze the following meeting transcript and extract structured insights.

TRANSCRIPT:
${transcript || "No transcript available"}

Please provide:
1. A brief summary (2-3 sentences)
2. A detailed summary (1-2 paragraphs)
3. Key discussion points (bullet points)
4. Action items with owners if identifiable
5. Decisions made
6. Risks or blockers mentioned
7. Follow-up items

Format your response as JSON with the following structure:
{
  "summary_short": "Brief summary here",
  "summary_detailed": "Detailed summary here",
  "key_points": ["point 1", "point 2"],
  "action_items": [{"task": "task description", "owner": "person name or null", "priority": "high/medium/low"}],
  "decisions": ["decision 1", "decision 2"],
  "risks": ["risk 1", "risk 2"],
  "follow_ups": [{"description": "follow up description", "assignee": "person or null"}]
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert meeting analyst. Extract actionable insights from meeting transcripts. Always respond with valid JSON.",
        },
        { role: "user", content: insightsPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const insightsText = completion.choices[0]?.message?.content || "{}";
    let insights;
    
    try {
      insights = JSON.parse(insightsText);
    } catch {
      insights = {
        summary_short: "Unable to generate summary",
        summary_detailed: "",
        key_points: [],
        action_items: [],
        decisions: [],
        risks: [],
        follow_ups: [],
      };
    }

    // Save insights
    await supabase.from("meeting_insights").insert({
      meeting_id: meetingId,
      summary_short: insights.summary_short || "",
      summary_detailed: insights.summary_detailed || "",
      key_points: insights.key_points || [],
      action_items: insights.action_items || [],
      decisions: insights.decisions || [],
      risks: insights.risks || [],
      follow_ups: insights.follow_ups || [],
    });

    // Calculate duration if we have end_time
    const endTime = new Date();
    const startTime = new Date(meeting.start_time);
    const durationSeconds = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);

    // Update meeting status to completed
    await supabase
      .from("meetings")
      .update({
        status: "completed",
        end_time: endTime.toISOString(),
        duration_seconds: durationSeconds,
      })
      .eq("id", meetingId);

    return new Response(
      JSON.stringify({
        success: true,
        meetingId,
        hasTranscript: !!transcript,
        hasInsights: true,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Process meeting error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
