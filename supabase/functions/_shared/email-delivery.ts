// One email per (meeting, recipient, kind), arbitrated by the database.
//
// Sarvam retries its `Completed` callback every ~8 s while `sarvam-webhook` is
// still working, and every retry used to run the whole pipeline again — on
// 2026-08-21 that put three identical summary emails in the user's inbox for a
// single meeting. Read-then-check guards cannot fix that (all racers read the
// pre-write state), so the claim is an INSERT against a UNIQUE index: the
// winner sends, the losers get 23505 and skip.

export const SUMMARY_EMAIL_KIND = "meeting_summary";

export interface EmailClaim {
  /** True when this caller owns the send. False means somebody already sent it. */
  claimed: boolean;
  /** Row id of the claim — pass to releaseEmailDelivery if the send then fails. */
  claimId?: string;
  /** Set when the claim table itself misbehaved (we fail open — see below). */
  degraded?: boolean;
}

export async function claimEmailDelivery(
  supabase: any,
  meetingId: string,
  recipientEmail: string,
  kind: string = SUMMARY_EMAIL_KIND,
): Promise<EmailClaim> {
  const { data, error } = await supabase
    .from("email_deliveries")
    .insert({
      meeting_id: meetingId,
      recipient_email: recipientEmail,
      kind,
    })
    .select("id")
    .single();

  if (!error) return { claimed: true, claimId: data?.id };

  // 23505 = unique_violation: this (meeting, recipient, kind) was already sent.
  if (error.code === "23505") {
    console.log(
      `[email-delivery] ${kind} for meeting ${meetingId} → ${recipientEmail} already claimed, skipping duplicate send`,
    );
    return { claimed: false };
  }

  // Any other failure (table missing because the migration has not been applied,
  // transient DB error) must not silently swallow the user's summary email — the
  // mail is the product. Fail OPEN and log loudly; the worst case is the old
  // duplicate behaviour, not a lost summary.
  console.error(
    `[email-delivery] Claim failed for meeting ${meetingId} → ${recipientEmail} (${error.code}: ${error.message}) — sending anyway`,
  );
  return { claimed: true, degraded: true };
}

/** Give the slot back when the provider rejected the send, so a retry can mail. */
export async function releaseEmailDelivery(
  supabase: any,
  claimId: string | undefined,
): Promise<void> {
  if (!claimId) return;
  const { error } = await supabase
    .from("email_deliveries")
    .delete()
    .eq("id", claimId);
  if (error) {
    console.error(`[email-delivery] Failed to release claim ${claimId}:`, error.message);
  }
}

/** Record the provider's message id on a claim we successfully sent. */
export async function recordEmailDelivery(
  supabase: any,
  claimId: string | undefined,
  providerMessageId: string | undefined,
): Promise<void> {
  if (!claimId || !providerMessageId) return;
  const { error } = await supabase
    .from("email_deliveries")
    .update({ provider_message_id: providerMessageId })
    .eq("id", claimId);
  if (error) {
    console.error(`[email-delivery] Failed to record message id on ${claimId}:`, error.message);
  }
}
