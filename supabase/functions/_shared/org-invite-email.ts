/**
 * The workspace invite email.
 *
 * Built from `email-brand.ts` like every other mail we send — there is exactly
 * one email shell in this codebase and hand-rolling a second layout is how a
 * product ends up looking like two products.
 */
import { button, emailShell, paragraph, panel, row, C } from "./email-brand.ts";

export interface InviteEmailInput {
  to: string;
  orgName: string;
  inviterName: string;
  /** Carries the single-use token; the only place the plaintext ever exists. */
  acceptUrl: string;
}

export async function sendInviteEmail(
  input: InviteEmailInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return { ok: false, error: "email is not configured" };

  const html = emailShell({
    eyebrow: "Workspace invitation",
    headline: `Join ${input.orgName} on EchoBrief`,
    meta: `Invited by ${input.inviterName}`,
    bodyRows: [
      row(
        paragraph(
          `${input.inviterName} has invited you to the <strong>${input.orgName}</strong> workspace on EchoBrief.`,
          C.ink,
        ),
      ),
      row(
        panel(
          `<p style="margin:0;font-size:14px;color:${C.inkMid};">Joining a workspace does <strong>not</strong> share your meetings. Everything you record stays private until you choose to share it.</p>`,
          "ember",
        ),
      ),
      row(`<div style="text-align:center;">${button(input.acceptUrl, "Accept invitation")}</div>`),
    ].join(""),
    ctaNote: "This invitation expires in 14 days.",
    // Nothing was recorded or summarised, so the meeting-mail sign-off is wrong.
    signoff: "Sent by",
    hideFooterLink: true,
  });

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "EchoBrief <noreply@echobrief.in>",
        to: [input.to],
        subject: `${input.inviterName} invited you to ${input.orgName} on EchoBrief`,
        html,
      }),
    });
    if (!response.ok) {
      return { ok: false, error: `Resend ${response.status}: ${(await response.text()).slice(0, 160)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "send failed" };
  }
}
