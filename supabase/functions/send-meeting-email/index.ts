import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { authenticate } from "../_shared/auth.ts";
import { buildEmailHtml, buildSubject } from "./template.ts";
import { formatISTDate, formatISTTime } from "../_shared/time.ts";
import {
  claimEmailDelivery,
  recordEmailDelivery,
  releaseEmailDelivery,
  SUMMARY_EMAIL_KIND,
} from "../_shared/email-delivery.ts";

interface EmailRequest {
  meetingId: string;
  recipientEmail?: string;
}

serve(async (req) => {
  const corsResponse = handleCorsPrelight(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  // Set once the delivery slot is claimed and cleared once the mail is out (or
  // deliberately handed back). Anything that throws in between must release it,
  // otherwise the claim row would block this summary from ever being sent.
  let pendingClaim: { supabase: any; claimId?: string } | null = null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // verify_jwt = true: the gateway has verified the JWT signature. Service
    // callers (deliverResults in _shared/insights.ts, the harness) keep the
    // full contract incl. reviewer copies via recipientEmail; a user token is
    // scoped to its own meetings and can only mail itself.
    const caller = await authenticate(req, supabase, corsHeaders);
    if (!caller.ok) return caller.response;

    const { meetingId, recipientEmail }: EmailRequest = await req.json();

    if (!meetingId) {
      return new Response(
        JSON.stringify({ error: "Meeting ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get meeting with insights (scoped to the caller when not service)
    let meetingQuery = supabase
      .from("meetings")
      .select("*")
      .eq("id", meetingId);
    if (!caller.isService) meetingQuery = meetingQuery.eq("user_id", caller.userId);
    const { data: meeting, error: meetingError } = await meetingQuery.single();

    if (meetingError || !meeting) {
      console.error("Meeting not found:", meetingError);
      return new Response(
        JSON.stringify({ error: "Meeting not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get insights
    const { data: insights } = await supabase
      .from("meeting_insights")
      .select("*")
      .eq("meeting_id", meetingId)
      .single();

    // Get user email
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("user_id", meeting.user_id)
      .single();

    // A user token can only send the summary to its own address — the meeting
    // is already scoped to the caller above, so the owner's profile email IS
    // the caller's email. Arbitrary recipients are a service-caller privilege
    // (reviewer copies resolved by _shared/summary-recipients.ts).
    const toEmail = caller.isService ? (recipientEmail || profile?.email) : profile?.email;

    if (!toEmail) {
      console.error("No recipient email found");
      return new Response(
        JSON.stringify({ error: "No recipient email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Claim the (meeting, recipient) slot BEFORE building or sending anything.
    // Duplicate Sarvam callbacks re-run this whole pipeline concurrently; the
    // unique index on email_deliveries is the only thing that can arbitrate
    // between racers that all read the same pre-send state (2026-08-21: three
    // identical summaries for one meeting). Losing the claim is a success, not
    // an error — the mail this caller wanted sent has already gone out.
    const claim = await claimEmailDelivery(
      supabase,
      meetingId,
      toEmail,
      SUMMARY_EMAIL_KIND,
    );
    pendingClaim = { supabase, claimId: claim.claimId };

    if (!claim.claimed) {
      pendingClaim = null;
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "already_sent", recipient: toEmail }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Always IST. This runtime is UTC, and Intl without an explicit timeZone
    // uses the runtime's zone — which is why these mails went out showing
    // 1:15 PM for a meeting the dashboard showed at 6:45 PM.
    const meetingDate = formatISTDate(meeting.start_time);
    const meetingTime = formatISTTime(meeting.start_time);

    const durationMinutes = Math.round((meeting.duration_seconds || 0) / 60);

    // Build email HTML
    const emailHtml = buildEmailHtml({
      title: meeting.title,
      date: meetingDate,
      time: meetingTime,
      duration: durationMinutes,
      insights,
      meetingId
    });

    // Send email via Resend API
    console.log("Sending email to:", toEmail);
    
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      await releaseEmailDelivery(supabase, claim.claimId);
      pendingClaim = null;
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "EchoBrief <noreply@echobrief.in>",
        to: [toEmail],
        subject: buildSubject(meeting.title, insights),
        html: emailHtml
      })
    });

    const emailResult = await emailResponse.json();
    console.log("Email sent:", emailResult);

    if (!emailResponse.ok) {
      console.error("Resend API error:", emailResult);
      // Nothing was delivered — hand the slot back so a retry can send.
      await releaseEmailDelivery(supabase, claim.claimId);
      pendingClaim = null;
      return new Response(
        JSON.stringify({ error: emailResult.message || "Failed to send email" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await recordEmailDelivery(supabase, claim.claimId, emailResult.id);
    pendingClaim = null;

    return new Response(
      JSON.stringify({ success: true, emailId: emailResult.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Email error:", error);
    if (pendingClaim) {
      await releaseEmailDelivery(pendingClaim.supabase, pendingClaim.claimId);
    }
    return new Response(
      JSON.stringify({ error: error.message || "Failed to send email" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
