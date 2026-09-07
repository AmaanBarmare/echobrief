/**
 * Client-upload broker for recording ingest.
 *
 * WHY THE FILE DOES NOT COME THROUGH THIS FUNCTION: a Vercel function's request
 * body is capped at a few megabytes, so a 60-minute recording could never be
 * POSTed to one. `@vercel/blob/client` solves this by uploading from the
 * browser straight to blob storage; this endpoint only issues the token and
 * hears about the result. The file never touches Supabase Storage either, whose
 * 50 MiB-per-object cap is exactly what makes long recordings unstorable.
 *
 * Two phases, both handled by `handleUpload`:
 *
 *   1. onBeforeGenerateToken — before a token exists, the user is authenticated
 *      and their plan is checked by `prepare-upload`, which also creates the
 *      meeting row. The Supabase access token arrives in `clientPayload` and is
 *      NOT trusted here: it is forwarded as a bearer to Supabase, whose gateway
 *      verifies the signature. A forged payload gets a 401 from Supabase, not
 *      an upload token from us.
 *
 *   2. onUploadCompleted — Vercel Blob calls this when the bytes have landed.
 *      `ingest-upload` hands the blob to the splitter and Sarvam; the blob is
 *      then deleted, because the audio's only job was to reach the splitter and
 *      an archive we do not need is an archive that can leak.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { del } from "@vercel/blob";

const ALLOWED_CONTENT_TYPES = [
  "audio/mpeg", "audio/mp3", "audio/mp4", "audio/m4a", "audio/x-m4a",
  "audio/wav", "audio/x-wav", "audio/webm", "audio/ogg", "audio/flac",
  "video/mp4", "video/webm", "video/quicktime",
];

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB — mirrors prepare-upload

async function callFunction(name: string, bearer: string, body: unknown) {
  const base = process.env.SUPABASE_URL;
  if (!base) throw new Error("SUPABASE_URL is not set");
  const res = await fetch(`${base}/functions/v1/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* keep the raw text */ }
  return { ok: res.ok, status: res.status, body: parsed, raw: text };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Upload is not configured (missing env)" });
  }

  try {
    const result = await handleUpload({
      request: req,
      body: req.body as HandleUploadBody,

      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        let payload: { access_token?: string; filename?: string; content_type?: string; size_bytes?: number };
        try {
          payload = JSON.parse(clientPayload || "{}");
        } catch {
          throw new Error("Malformed upload request.");
        }
        const accessToken = String(payload.access_token || "");
        if (!accessToken) throw new Error("Sign in to upload a recording.");

        // The plan gate. Anything that spends transcription money goes through
        // it, and it must run BEFORE the token exists — once the client can
        // upload, the transfer is already committed.
        const prepared = await callFunction("prepare-upload", accessToken, {
          filename: payload.filename,
          content_type: payload.content_type,
          size_bytes: payload.size_bytes,
        });
        if (!prepared.ok) {
          throw new Error(prepared.body?.error || `Upload refused (${prepared.status}).`);
        }

        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
          // Carried through to onUploadCompleted, which Vercel Blob calls with
          // no user context of its own.
          tokenPayload: JSON.stringify({ meetingId: prepared.body.meeting_id }),
        };
      },

      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const { meetingId } = JSON.parse(tokenPayload || "{}");
        if (!meetingId) throw new Error("Upload completed with no meeting to attach it to");

        const ingested = await callFunction(
          "ingest-upload",
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { meeting_id: meetingId, blob_url: blob.url },
        );

        // Delete only once the splitter has the audio. ingest-upload returns
        // after submitting to Sarvam, which reads the chunks it uploaded rather
        // than the original, so the blob has no reader left. On failure the
        // blob is kept: it is the only copy, and a retry needs it.
        if (ingested.ok) {
          try {
            await del(blob.url);
          } catch (err) {
            // A surviving blob costs storage, not correctness. Never fail the
            // upload over cleanup.
            console.error(`[upload] could not delete blob for meeting ${meetingId}:`, err);
          }
        } else {
          console.error(
            `[upload] ingest-upload failed for meeting ${meetingId} (${ingested.status}): ${ingested.raw?.slice(0, 300)}`,
          );
          throw new Error("Could not start processing for this upload.");
        }
      },
    });

    return res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    // A refusal here is usually a plan limit or an unsupported file, both of
    // which the user can act on, so the message is passed through rather than
    // flattened to "something went wrong".
    return res.status(400).json({ error: message });
  }
}
