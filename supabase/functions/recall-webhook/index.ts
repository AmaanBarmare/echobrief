import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createSarvamJob,
  uploadToSarvamJob,
  startSarvamJob,
} from "../_shared/sarvam.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  try {
    const event = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const recallApiKey = Deno.env.get("RECALL_API_KEY")!;
    const sarvamApiKey = Deno.env.get("SARVAM_API_KEY")!;
    const sarvamWebhookSecret = Deno.env.get("SARVAM_WEBHOOK_SECRET")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("[recall-webhook] Event received:", JSON.stringify(event));

    // Recall sends { event: "bot.status_change", data: { bot_id, status: { code, ... } } }
    const botId = event.data?.bot_id || event.bot_id;
    const statusCode = event.data?.status?.code || event.status;

    if (!botId) {
      console.error("[recall-webhook] No bot_id in event");
      return new Response(JSON.stringify({ error: "No bot_id" }), { status: 400 });
    }

    // Find the meeting by recall_bot_id
    const { data: meeting, error: findError } = await supabase
      .from("meetings")
      .select("*")
      .eq("recall_bot_id", botId)
      .single();

    if (findError || !meeting) {
      console.error("[recall-webhook] Meeting not found for bot:", botId);
      return new Response(JSON.stringify({ error: "Meeting not found" }), { status: 404 });
    }

    console.log(`[recall-webhook] Meeting ${meeting.id}, bot ${botId}, status: ${statusCode}`);

    // Only process when recording is done
    if (statusCode !== "done" && statusCode !== "completed") {
      // Update meeting status for intermediate states
      const statusMap: Record<string, string> = {
        joining: "joining",
        in_waiting_room: "joining",
        in_call_not_recording: "in_call",
        in_call_recording: "recording",
        fatal: "failed",
        analysis_done: "processing",
      };

      if (statusCode === "fatal") {
        await supabase
          .from("meetings")
          .update({ status: "failed" })
          .eq("id", meeting.id);
        console.error(`[recall-webhook] Bot ${botId} failed`);
      } else if (statusMap[statusCode]) {
        await supabase
          .from("meetings")
          .update({ status: statusMap[statusCode] })
          .eq("id", meeting.id);
      }

      return new Response(JSON.stringify({ acknowledged: true, status: statusCode }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // --- Recording is done — fetch audio from Recall and send to Sarvam ---

    await supabase
      .from("meetings")
      .update({ status: "processing" })
      .eq("id", meeting.id);

    // Step 1: Fetch bot details to get the audio download URL
    const botResponse = await fetch(`https://api.recall.ai/api/v2/recordingbots/${botId}`, {
      headers: { "Authorization": `Bearer ${recallApiKey}` },
    });

    if (!botResponse.ok) {
      const errText = await botResponse.text();
      throw new Error(`Failed to fetch bot details: ${botResponse.status} ${errText}`);
    }

    const botData = await botResponse.json();
    console.log("[recall-webhook] Bot data keys:", Object.keys(botData).join(","));

    // Step 2: Get audio download URL from bot recordings
    // Recall provides recordings in media_shortcuts or recordings array
    let audioUrl: string | null = null;

    if (botData.media_shortcuts?.audio_mixed?.url) {
      audioUrl = botData.media_shortcuts.audio_mixed.url;
    } else if (botData.recordings?.length > 0) {
      // Find the audio recording
      const audioRecording = botData.recordings.find(
        (r: any) => r.media_type === "audio" || r.format === "mp3"
      );
      if (audioRecording?.url) {
        audioUrl = audioRecording.url;
      } else if (botData.recordings[0]?.media_shortcuts?.audio_mixed?.url) {
        audioUrl = botData.recordings[0].media_shortcuts.audio_mixed.url;
      }
    }

    // Also try video_url as a fallback (some Recall configs return video with audio)
    if (!audioUrl && botData.video_url) {
      audioUrl = botData.video_url;
    }

    if (!audioUrl) {
      console.error("[recall-webhook] No audio URL found in bot data:", JSON.stringify(botData));
      await supabase
        .from("meetings")
        .update({ status: "failed" })
        .eq("id", meeting.id);
      return new Response(JSON.stringify({ error: "No audio URL from Recall" }), { status: 500 });
    }

    console.log("[recall-webhook] Downloading audio from Recall...");

    // Step 3: Download the audio file from Recall's S3 signed URL
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio: ${audioResponse.status}`);
    }
    const audioBlob = await audioResponse.blob();
    const audioSize = audioBlob.size;
    console.log(`[recall-webhook] Audio downloaded: ${(audioSize / 1024 / 1024).toFixed(2)} MB`);

    // Step 4: Upload audio to Supabase Storage for archival
    const storagePath = `${meeting.user_id}/${meeting.id}/recall-audio.mp3`;
    const { error: uploadError } = await supabase.storage
      .from("recordings")
      .upload(storagePath, audioBlob, {
        contentType: "audio/mpeg",
        upsert: true,
      });

    if (uploadError) {
      console.error("[recall-webhook] Storage upload error:", uploadError);
      // Continue anyway — Sarvam can still process from the blob in memory
    } else {
      // Save the storage path to the meeting record
      await supabase
        .from("meetings")
        .update({ audio_url: `recordings/${storagePath}` })
        .eq("id", meeting.id);
      console.log("[recall-webhook] Audio saved to Supabase Storage");
    }

    // Step 5: Create Sarvam batch job with full features
    const callbackUrl = `${supabaseUrl}/functions/v1/sarvam-webhook`;
    const job = await createSarvamJob(sarvamApiKey, callbackUrl, sarvamWebhookSecret);
    console.log("[recall-webhook] Sarvam job created:", job.job_id);

    // Step 6: Upload audio to Sarvam
    const fileName = "recall-audio.mp3";
    await uploadToSarvamJob(sarvamApiKey, job.job_id, fileName, audioBlob);
    console.log("[recall-webhook] Audio uploaded to Sarvam job");

    // Step 7: Start Sarvam processing
    await startSarvamJob(sarvamApiKey, job.job_id);
    console.log("[recall-webhook] Sarvam job started:", job.job_id);

    // Step 8: Save sarvam_job_id and config so sarvam-webhook can find this meeting
    await supabase
      .from("meetings")
      .update({
        sarvam_job_id: job.job_id,
        recall_bot_id: botId,
        processing_config: {
          source: "recall",
          recall_bot_id: botId,
          audio_file_name: fileName,
          slackDestination: meeting.processing_config?.slackDestination || null,
          sendEmail: meeting.processing_config?.sendEmail || false,
        },
      })
      .eq("id", meeting.id);

    console.log(`[recall-webhook] Meeting ${meeting.id} handed off to Sarvam (job: ${job.job_id})`);

    // From here, sarvam-webhook handles:
    // - Receiving transcript with diarization + language detection
    // - Generating insights via GPT
    // - Saving transcript to DB
    // - Delivering to Slack/email/etc
    // - Marking meeting as completed

    return new Response(
      JSON.stringify({
        success: true,
        meeting_id: meeting.id,
        sarvam_job_id: job.job_id,
        message: "Audio downloaded from Recall and submitted to Sarvam for transcription",
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[recall-webhook] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
