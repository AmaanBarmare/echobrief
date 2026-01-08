import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { channelId, channelName } = await req.json();

    if (!channelId) {
      return new Response(
        JSON.stringify({ error: "Channel ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const slackToken = Deno.env.get("SLACK_BOT_TOKEN");
    if (!slackToken) {
      return new Response(
        JSON.stringify({ error: "Slack bot token not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send test message to Slack
    const blocks = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "🎉 EchoBrief Connected!",
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Your Slack integration is working perfectly! Meeting summaries will be sent to this channel.",
        },
      },
      {
        type: "divider",
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*What happens next?*\nAfter each meeting recording, you'll receive:\n• 📝 Meeting summary\n• 🎯 Key points\n• ✅ Action items with owners\n• 📋 Decisions made",
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Sent from EchoBrief • ${new Date().toLocaleString()}`,
          },
        ],
      },
    ];

    const slackResponse = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${slackToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: channelId,
        blocks,
        text: "EchoBrief is now connected! Meeting summaries will be sent here.",
      }),
    });

    const slackResult = await slackResponse.json();

    if (!slackResult.ok) {
      return new Response(
        JSON.stringify({ error: `Slack error: ${slackResult.error}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: "Test message sent successfully!" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Test Slack connection error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
