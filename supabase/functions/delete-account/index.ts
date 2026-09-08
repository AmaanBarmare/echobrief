/**
 * delete-account — self-service, irreversible account deletion.
 *
 * POST { confirm: "DELETE" } with the account owner's own JWT
 * (verify_jwt = true; service-role callers are refused — deletion is a
 * decision only the owner can make, from their own session).
 *
 * Order matters:
 *   1. Remove every object under recordings/<userId>/ and avatars/<userId>/ in Storage (audio is
 *      not covered by any DB cascade).
 *   2. Best-effort revoke the Google refresh token at Google — BEFORE the
 *      user_oauth_tokens row is deleted. Failures are ignored: the grant dies
 *      with the account either way, revocation is just hygiene.
 *   3. Delete rows in user-scoped tables that do NOT cascade from auth.users
 *      (verified against the migrations — see NON_CASCADING_USER_TABLES).
 *   4. supabase.auth.admin.deleteUser(userId) — the FK cascades then clear
 *      profiles, meetings (→ transcripts, meeting_insights, email_messages,
 *      email_deliveries, monitor_events, meeting_contacts,
 *      action_item_completions), calendars, calendar_events, scheduled_emails,
 *      digest_schedules, digest_reports, api_tokens (→ oauth_refresh_tokens)
 *      and oauth_codes.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { authenticate } from "../_shared/auth.ts";
import { openGoogleTokens } from "../_shared/oauth-tokens.ts";
import { recordAudit } from "../_shared/audit.ts";

// User-scoped tables with no ON DELETE CASCADE path from auth.users
// (checked against supabase/migrations/, 2026-08-31):
//  - user_oauth_tokens        user_id has no FK at all
//  - google_oauth_states      the FK'd CREATE TABLE (20260402000003) was
//                             IF NOT EXISTS over an existing table, so the
//                             cascade never landed
//  - contacts                 user_id has no FK (meeting_contacts cascades
//                             from contacts, so it follows)
//  - webhook_events           meeting_id is ON DELETE SET NULL, user_id no FK
//  - meeting_notifications    meeting_id is nullable, user_id no FK
//  - billing_events           user_id no FK. NOT deleted: it is the Dodo
//                             webhook idempotency ledger (UNIQUE event_id) and
//                             a financial audit record. Deleting a row would
//                             let a redelivered webhook reprocess. The user_id
//                             link is nulled instead, severing the identity
//                             while keeping the claim and the audit trail.
const NON_CASCADING_USER_TABLES = [
  "user_oauth_tokens",
  "google_oauth_states",
  "contacts",
  "webhook_events",
  "meeting_notifications",
];

// Rows kept for their own integrity, with the identity link removed.
const ANONYMISE_USER_TABLES = ["billing_events"];

const STORAGE_PAGE_SIZE = 1000;
const STORAGE_REMOVE_BATCH = 100;

/** One level of a bucket: files carry an id, folders do not. */
async function listLevel(
  supabase: any,
  bucket: string,
  prefix: string,
): Promise<{ files: string[]; folders: string[] }> {
  const files: string[] = [];
  const folders: string[] = [];
  for (let offset = 0; ; offset += STORAGE_PAGE_SIZE) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: STORAGE_PAGE_SIZE, offset });
    if (error) throw new Error(`storage list failed for ${prefix}: ${error.message}`);
    for (const entry of data ?? []) {
      if (entry.id) files.push(`${prefix}/${entry.name}`);
      else folders.push(`${prefix}/${entry.name}`);
    }
    if (!data || data.length < STORAGE_PAGE_SIZE) break;
  }
  return { files, folders };
}

/** Every object under <bucket>/<userId>/, at any depth. */
async function collectUserObjects(
  supabase: any,
  bucket: string,
  userId: string,
): Promise<string[]> {
  const files: string[] = [];
  const queue = [userId];
  while (queue.length > 0) {
    const prefix = queue.shift()!;
    const level = await listLevel(supabase, bucket, prefix);
    files.push(...level.files);
    queue.push(...level.folders);
  }
  return files;
}

serve(async (req) => {
  const corsResponse = handleCorsPrelight(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: jsonHeaders });

  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const caller = await authenticate(req, supabase, corsHeaders);
    if (!caller.ok) return caller.response;
    if (caller.isService) {
      return respond(
        { error: "delete-account only accepts the account owner's own session" },
        403,
      );
    }
    const userId = caller.userId;

    const body = await req.json().catch(() => ({}));
    if (body?.confirm !== "DELETE") {
      return respond({ error: 'Confirmation required: send { "confirm": "DELETE" }' }, 400);
    }

    console.log(`[delete-account] Deleting account ${userId}`);

    // 1. Storage: every object under <bucket>/<userId>/, for every bucket the
    //    user can write to. `avatars` joined the list when profile photos
    //    shipped — a deleted account must not leave a face behind in a PUBLIC
    //    bucket.
    for (const bucket of ["recordings", "avatars"]) {
      const objects = await collectUserObjects(supabase, bucket, userId);
      for (let i = 0; i < objects.length; i += STORAGE_REMOVE_BATCH) {
        const batch = objects.slice(i, i + STORAGE_REMOVE_BATCH);
        const { error: rmError } = await supabase.storage.from(bucket).remove(batch);
        if (rmError) throw new Error(`storage remove failed for ${bucket}: ${rmError.message}`);
      }
      console.log(`[delete-account] Removed ${objects.length} object(s) from ${bucket}/`);
    }

    // 2. Best-effort Google token revocation (before the tokens row goes).
    try {
      const { data: storedTokens } = await supabase
        .from("user_oauth_tokens")
        .select("google_refresh_token, google_access_token")
        .eq("user_id", userId)
        .maybeSingle();
      const tokens = await openGoogleTokens(storedTokens);
      const revokable = tokens?.google_refresh_token || tokens?.google_access_token;
      if (revokable) {
        await fetch(
          `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(revokable)}`,
          { method: "POST" },
        );
      }
    } catch (revokeErr) {
      console.warn("[delete-account] Google revoke failed (ignored):", revokeErr);
    }

    // 3. User-scoped rows with no cascade from auth.users.
    for (const table of NON_CASCADING_USER_TABLES) {
      const { error: delError } = await supabase.from(table).delete().eq("user_id", userId);
      if (delError) throw new Error(`delete from ${table} failed: ${delError.message}`);
    }

    // 4. Rows that must survive, with the identity link severed.
    for (const table of ANONYMISE_USER_TABLES) {
      const { error: anonError } = await supabase
        .from(table)
        .update({ user_id: null })
        .eq("user_id", userId);
      if (anonError) throw new Error(`anonymise ${table} failed: ${anonError.message}`);
    }

    // Recorded BEFORE the user is deleted: afterwards there is no session left
    // to attribute it to, and "who deleted this account, from where" is the
    // single most likely question to be asked of this table.
    await recordAudit(supabase, {
      action: "account.deleted",
      actorType: "user",
      actorUserId: userId,
      resourceType: "account",
      resourceId: userId,
    }, req);

    // 5. The account itself — FK cascades clear everything else.
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
    if (deleteError) throw new Error(`auth deleteUser failed: ${deleteError.message}`);

    console.log(`[delete-account] Account ${userId} deleted`);
    return respond({ success: true });
  } catch (err) {
    console.error("[delete-account] Error:", err);
    return respond(
      { error: err instanceof Error ? err.message : "Account deletion failed" },
      500,
    );
  }
});
