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

        // Check if transcript already exists for this meeting
        const { data: existingTranscript } = await supabase
          .from("transcripts")
          .select("id")
          .eq("meeting_id", meetingId)
          .single();

        if (!existingTranscript) {
          // Save transcript only if it doesn't exist
          await supabase.from("transcripts").insert({
            meeting_id: meetingId,
            content: transcript,
            speakers: [],
            word_timestamps: (transcription as any).words || [],
          });
        }
      } catch (transcribeError) {
        console.error("Transcription error:", transcribeError);
        // Continue with empty transcript if transcription fails
        transcript = "Transcription failed. Please check the audio file.";
      }
    }

    // Format attendees for the AI prompt
    const attendeesList = (meeting.attendees || [])
      .map((a: any) => a.displayName || a.email)
      .filter(Boolean);
    const attendeesContext = attendeesList.length > 0 
      ? `\n\nMEETING PARTICIPANTS:\n${attendeesList.join(', ')}`
      : '';

    // Generate AI insights
    const insightsPrompt = `Analyze the following meeting transcript and extract structured insights.

MEETING TITLE: ${meeting.title}${attendeesContext}

TRANSCRIPT:
${transcript || "No transcript available"}

Please provide:
1. A brief summary (2-3 sentences)
2. A detailed summary (1-2 paragraphs)
3. Key discussion points (bullet points)
4. Action items with owners if identifiable (use participant names when possible: ${attendeesList.join(', ') || 'Unknown participants'})
5. Decisions made
6. Risks or blockers mentioned
7. Follow-up items with assignees if identifiable

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

    // Check if insights already exist for this meeting
    const { data: existingInsights } = await supabase
      .from("meeting_insights")
      .select("id")
      .eq("meeting_id", meetingId)
      .single();

    if (!existingInsights) {
      // Save insights only if they don't exist
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
    }

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

    // Check if user has Slack connected and send message
    const { data: profile } = await supabase
      .from("profiles")
      .select("slack_connected, slack_channel_id")
      .eq("user_id", meeting.user_id)
      .single();

    let slackSent = false;
    console.log("Checking Slack connection:", { slack_connected: profile?.slack_connected, channel_id: profile?.slack_channel_id });
    
    if (profile?.slack_connected && profile?.slack_channel_id) {
      try {
        const slackToken = Deno.env.get("SLACK_BOT_TOKEN");
        console.log("Slack token exists:", !!slackToken);
        
        if (slackToken) {
          // Format and send Slack message directly
          const actionItems = (insights.action_items || [])
            .map((item: any) => `• ${item.task}${item.owner ? ` (@${item.owner})` : ""}`)
            .join("\n") || "None identified";

          const decisions = (insights.decisions || [])
            .map((d: string) => `• ${d}`)
            .join("\n") || "None identified";

          const keyPoints = (insights.key_points || [])
            .slice(0, 5)
            .map((p: string) => `• ${p}`)
            .join("\n") || "None identified";

          const durationMinutes = Math.round(durationSeconds / 60);

          const blocks = [
            {
              type: "header",
              text: { type: "plain_text", text: `📝 Meeting Summary: ${meeting.title}`, emoji: true },
            },
            {
              type: "section",
              text: { type: "mrkdwn", text: `*Duration:* ${durationMinutes} minutes\n*Date:* ${new Date(meeting.start_time).toLocaleDateString()}` },
            },
            { type: "divider" },
            { type: "section", text: { type: "mrkdwn", text: `*Summary*\n${insights.summary_short || "No summary available"}` } },
            { type: "section", text: { type: "mrkdwn", text: `*🎯 Key Points*\n${keyPoints}` } },
            { type: "section", text: { type: "mrkdwn", text: `*✅ Action Items*\n${actionItems}` } },
            { type: "section", text: { type: "mrkdwn", text: `*📋 Decisions*\n${decisions}` } },
          ];

          const slackResponse = await fetch("https://slack.com/api/chat.postMessage", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${slackToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              channel: profile.slack_channel_id,
              blocks,
              text: `Meeting Summary: ${meeting.title}`,
            }),
          });

          const slackResult = await slackResponse.json();
          console.log("Slack API response:", JSON.stringify(slackResult));
          slackSent = slackResult.ok;

          // Log Slack message
          await supabase.from("slack_messages").insert({
            meeting_id: meetingId,
            channel_id: profile.slack_channel_id,
            status: slackResult.ok ? "sent" : "failed",
            message_ts: slackResult.ts || null,
            sent_at: slackResult.ok ? new Date().toISOString() : null,
            error_message: slackResult.ok ? null : slackResult.error,
          });
        }
      } catch (slackError) {
        console.error("Slack notification error:", slackError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        meetingId,
        hasTranscript: !!transcript,
        hasInsights: true,
        slackSent,
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
