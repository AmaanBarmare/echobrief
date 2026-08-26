/**
 * PARKED — scheduled digests are deliberately not shipped yet.
 *
 * Its HTML predates the shared shell. Before this is turned on, rebuild the
 * markup with _shared/email-brand.ts so it matches every other mail we send.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Cron function - runs hourly to send due onboarding emails
serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get pending emails that are due (with anti-spam protections)
    const { data: pendingEmails, error: fetchError } = await supabase
      .from("scheduled_emails")
      .select("*")
      .eq("status", "pending")
      .lte("send_at", new Date().toISOString())
      .order("send_at", { ascending: true })
      .limit(20); // Process max 20 per run to avoid rate limits

    if (fetchError) {
      console.error("Failed to fetch pending emails:", fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 });
    }

    if (!pendingEmails || pendingEmails.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0 }), { status: 200 });
    }

    let sentCount = 0;

    for (const email of pendingEmails) {
      try {
        // ANTI-SPAM: Skip if user unsubscribed or email already sent today
        const { data: recentSent } = await supabase
          .from("scheduled_emails")
          .select("id")
          .eq("email", email.email)
          .eq("status", "sent")
          .gte("sent_at", new Date(Date.now() - 60 * 60 * 1000).toISOString()) // Last hour
          .limit(3);

        if (recentSent && recentSent.length >= 3) {
          console.log(`Rate limit: ${email.email} received 3+ emails in last hour, skipping`);
          continue;
        }

        const html = getEmailTemplate(email.template, email.email);
        
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: "EchoBrief <noreply@echobrief.in>",
            to: [email.email],
            subject: email.subject,
            html
          })
        });

        if (response.ok) {
          await supabase
            .from("scheduled_emails")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("id", email.id);
          sentCount++;
          console.log(`Sent ${email.template} email to ${email.email}`);
        } else {
          const error = await response.json();
          console.error(`Failed to send email to ${email.email}:`, error);
          await supabase
            .from("scheduled_emails")
            .update({ status: "failed" })
            .eq("id", email.id);
        }
      } catch (err) {
        console.error(`Error sending email ${email.id}:`, err);
      }
    }

    return new Response(JSON.stringify({ success: true, sent: sentCount }), { status: 200 });

  } catch (error: any) {
    console.error("Send scheduled emails error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});

function getEmailTemplate(template: string, userEmail: string): string {
  const firstName = userEmail.split("@")[0].split(".")[0];
  const capitalizedName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
  
  const templates: Record<string, string> = {
    welcome: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#FAF4EF;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAF4EF;padding:40px 20px;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
<tr><td style="background:linear-gradient(135deg,#D93F0B,#F5C842);padding:32px 40px;text-align:center;">
<span style="font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">echo</span><span style="font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;opacity:0.9;">brief</span>
</td></tr>
<tr><td style="padding:40px;">
<h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#120C09;">Welcome to EchoBrief, ${capitalizedName}! 👋</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#514540;">Your meetings now write themselves up. No more frantic note-taking, no more "wait, what did we decide?"</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#514540;"><strong>Here's what EchoBrief does:</strong></p>
<ul style="margin:0 0 24px;padding-left:20px;font-size:15px;line-height:1.8;color:#514540;">
<li>Records your Google Meet & Zoom meetings</li>
<li>Transcribes in 22 Indian languages (Hindi, Tamil, Telugu...)</li>
<li>Generates executive summaries with action items</li>
<li>Delivers insights to your inbox instantly</li>
</ul>
<p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#514540;">Tomorrow, I'll send you a quick 2-minute setup guide. For now, just know — your meetings are about to get a lot more useful.</p>
<table cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr><td style="background:linear-gradient(135deg,#D93F0B,#F5C842);border-radius:8px;padding:14px 32px;">
<a href="https://echobrief.in/dashboard" style="color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;display:inline-block;">Go to Dashboard →</a>
</td></tr></table>
<p style="margin:0;font-size:14px;color:#827873;">— The EchoBrief Team</p>
</td></tr>
<tr><td style="background-color:#F2E9E4;padding:24px 40px;text-align:center;border-top:1px solid #F2E9E4;">
<p style="margin:0;font-size:12px;color:#827873;">EchoBrief — Your meetings, finally useful.</p>
</td></tr>
</table>
</td></tr></table>
</body>
</html>`,

    setup_guide: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#FAF4EF;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAF4EF;padding:40px 20px;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
<tr><td style="background:linear-gradient(135deg,#D93F0B,#F5C842);padding:32px 40px;text-align:center;">
<span style="font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">echo</span><span style="font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;opacity:0.9;">brief</span>
</td></tr>
<tr><td style="padding:40px;">
<h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#120C09;">2-minute setup ⏱️</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#514540;">Let's get EchoBrief recording your meetings. Two quick steps:</p>

<div style="background:#F8E7DF;border-left:4px solid #D93F0B;padding:16px 20px;margin:0 0 20px;border-radius:0 8px 8px 0;">
<p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#B83508;">Step 1: Send the bot to a meeting</p>
<p style="margin:0;font-size:14px;color:#514540;">Paste any Google Meet, Zoom, or Teams link in your dashboard and hit Record. Nothing to install.</p>
</div>

<div style="background:#F8E7DF;border-left:4px solid #D93F0B;padding:16px 20px;margin:0 0 24px;border-radius:0 8px 8px 0;">
<p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#B83508;">Step 2: Connect Google Calendar (optional)</p>
<p style="margin:0;font-size:14px;color:#514540;">Go to Settings → Connect your calendar so the bot can join scheduled meetings on its own.</p>
</div>

<table cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr><td style="background:linear-gradient(135deg,#D93F0B,#F5C842);border-radius:8px;padding:14px 32px;">
<a href="https://echobrief.in/dashboard" style="color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;display:inline-block;">Open Your Dashboard →</a>
</td></tr></table>

<p style="margin:0;font-size:14px;color:#827873;">That's it. Your next meeting is about to get a lot smarter.</p>
</td></tr>
<tr><td style="background-color:#F2E9E4;padding:24px 40px;text-align:center;border-top:1px solid #F2E9E4;">
<p style="margin:0;font-size:12px;color:#827873;">EchoBrief — Your meetings, finally useful.</p>
</td></tr>
</table>
</td></tr></table>
</body>
</html>`,

    first_meeting: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#FAF4EF;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAF4EF;padding:40px 20px;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
<tr><td style="background:linear-gradient(135deg,#D93F0B,#F5C842);padding:32px 40px;text-align:center;">
<span style="font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">echo</span><span style="font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;opacity:0.9;">brief</span>
</td></tr>
<tr><td style="padding:40px;">
<h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#120C09;">Ready to see the magic? ✨</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#514540;">Your next meeting is the perfect test run. Here's what happens:</p>

<ol style="margin:0 0 24px;padding-left:20px;font-size:15px;line-height:2;color:#514540;">
<li>Copy your Google Meet, Zoom, or Teams link</li>
<li>Paste it in the EchoBrief dashboard → Record</li>
<li>Admit the bot and have your meeting normally</li>
<li>End the call → Summary arrives in your inbox</li>
</ol>

<p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#514540;"><strong>Pro tip:</strong> Even a quick 5-minute call works. Try it on your next 1:1 or standup.</p>

<table cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr><td style="background:linear-gradient(135deg,#D93F0B,#F5C842);border-radius:8px;padding:14px 32px;">
<a href="https://meet.google.com/new" style="color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;display:inline-block;">Start a Test Meeting →</a>
</td></tr></table>

<p style="margin:0;font-size:14px;color:#827873;">Your meetings are about to get a lot more useful.</p>
</td></tr>
<tr><td style="background-color:#F2E9E4;padding:24px 40px;text-align:center;border-top:1px solid #F2E9E4;">
<p style="margin:0;font-size:12px;color:#827873;">EchoBrief — Your meetings, finally useful.</p>
</td></tr>
</table>
</td></tr></table>
</body>
</html>`,

    tips: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#FAF4EF;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAF4EF;padding:40px 20px;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
<tr><td style="background:linear-gradient(135deg,#D93F0B,#F5C842);padding:32px 40px;text-align:center;">
<span style="font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">echo</span><span style="font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;opacity:0.9;">brief</span>
</td></tr>
<tr><td style="padding:40px;">
<h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#120C09;">Pro tips to level up 🚀</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#514540;">A few features you might have missed:</p>

<div style="margin:0 0 16px;padding:16px;background:#F2E9E4;border-radius:8px;">
<p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#120C09;">🌐 Multilingual transcription</p>
<p style="margin:0;font-size:14px;color:#514540;">Meetings in Hindi, Tamil, or Hinglish? EchoBrief handles 22 Indian languages.</p>
</div>

<div style="margin:0 0 24px;padding:16px;background:#F2E9E4;border-radius:8px;">
<p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#120C09;">✅ Action item tracking</p>
<p style="margin:0;font-size:14px;color:#514540;">Every summary includes action items with owners. No more "who was supposed to do that?"</p>
</div>

<table cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr><td style="background:linear-gradient(135deg,#D93F0B,#F5C842);border-radius:8px;padding:14px 32px;">
<a href="https://echobrief.in/settings" style="color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;display:inline-block;">Explore Settings →</a>
</td></tr></table>
</td></tr>
<tr><td style="background-color:#F2E9E4;padding:24px 40px;text-align:center;border-top:1px solid #F2E9E4;">
<p style="margin:0;font-size:12px;color:#827873;">EchoBrief — Your meetings, finally useful.</p>
</td></tr>
</table>
</td></tr></table>
</body>
</html>`,

    checkin: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#FAF4EF;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAF4EF;padding:40px 20px;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
<tr><td style="background:linear-gradient(135deg,#D93F0B,#F5C842);padding:32px 40px;text-align:center;">
<span style="font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">echo</span><span style="font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;opacity:0.9;">brief</span>
</td></tr>
<tr><td style="padding:40px;">
<h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#120C09;">How's it going? 👋</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#514540;">You've been with EchoBrief for two weeks now. Quick check-in:</p>

<ul style="margin:0 0 24px;padding-left:20px;font-size:15px;line-height:1.8;color:#514540;">
<li>Are your meeting summaries hitting the mark?</li>
<li>Any features you wish existed?</li>
<li>Running into any issues?</li>
</ul>

<p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#514540;">Just reply to this email — I read every response and would love to hear what's working (and what isn't).</p>

<p style="margin:0;font-size:14px;color:#827873;">— Khush, Founder @ EchoBrief</p>
</td></tr>
<tr><td style="background-color:#F2E9E4;padding:24px 40px;text-align:center;border-top:1px solid #F2E9E4;">
<p style="margin:0;font-size:12px;color:#827873;">EchoBrief — Your meetings, finally useful.</p>
</td></tr>
</table>
</td></tr></table>
</body>
</html>`
  };

  return templates[template] || templates.welcome;
}
