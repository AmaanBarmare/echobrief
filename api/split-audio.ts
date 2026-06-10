/**
 * Vercel serverless function: splits long meeting audio into Sarvam-safe chunks.
 *
 * Why this exists: Sarvam's saaras:v3 batch STT silently returns an empty
 * transcript for long audio (empirically: 47 min fails, 5-6 min chunks of the
 * same file succeed — config-invariant, server-side). Chunks must be properly
 * re-encoded (stream-copied segments are rejected with "Audio contains no
 * samples"), which requires real ffmpeg — hence this runs on Vercel
 * (2 GB / 300 s) instead of a Supabase edge function (~256 MB, no ffmpeg).
 *
 * Flow: download audio from signed URL → probe duration → split into 300 s
 * re-encoded mp3 chunks (zero-padded names so Sarvam's 0.json..N.json outputs
 * map back by sort order) → create ONE Sarvam job with the meeting's webhook
 * callback → upload all chunks → start job.
 *
 * Auth: requires `Authorization: Bearer ${SPLIT_AUDIO_SECRET}`.
 * Body: { audioUrl, callbackUrl, callbackToken }
 * Response: { job_id, chunk_count, chunk_seconds, duration_seconds }
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

const SARVAM_BASE_URL = "https://api.sarvam.ai/speech-to-text/job/v1";
const CHUNK_SECONDS = 300; // empirically safe (5-6 min works; 47 min fails)
const SINGLE_FILE_MAX_SECONDS = 360; // ≤6 min: proven fine unchunked
const MAX_FILES_PER_JOB = 20; // Sarvam batch limit

function runFfmpeg(args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath as unknown as string, args);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => resolve({ code: code ?? -1, stderr }));
  });
}

async function probeDurationSeconds(filePath: string): Promise<number> {
  // ffmpeg -i prints "Duration: HH:MM:SS.cs" to stderr and exits non-zero
  // (no output specified) — that's fine, we only need the header.
  const { stderr } = await runFfmpeg(["-hide_banner", "-i", filePath]);
  const m = stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  if (!m) throw new Error(`ffmpeg could not determine duration: ${stderr.slice(0, 300)}`);
  return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3]);
}

async function sarvamPost(apiKey: string, pathname: string, body: unknown) {
  const res = await fetch(`${SARVAM_BASE_URL}${pathname}`, {
    method: "POST",
    headers: { "api-subscription-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Sarvam ${pathname || "create-job"} failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const secret = process.env.SPLIT_AUDIO_SECRET;
  const sarvamApiKey = process.env.SARVAM_API_KEY;
  if (!secret || !sarvamApiKey) {
    return res.status(500).json({ error: "Function not configured (missing env)" });
  }
  if ((req.headers["authorization"] || "") !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { audioUrl, callbackUrl, callbackToken } = req.body || {};
  if (!audioUrl || !callbackUrl || !callbackToken) {
    return res.status(400).json({ error: "audioUrl, callbackUrl, callbackToken required" });
  }

  const workDir = await mkdtemp(path.join(tmpdir(), "split-"));
  try {
    // 1. Download the audio
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) {
      return res.status(502).json({ error: `Audio download failed (${audioRes.status})` });
    }
    const inputPath = path.join(workDir, "input.mp3");
    const inputBytes = Buffer.from(await audioRes.arrayBuffer());
    await writeFile(inputPath, inputBytes);

    // 2. Probe duration and decide chunking
    const durationSeconds = await probeDurationSeconds(inputPath);
    let chunkSeconds = CHUNK_SECONDS;
    let chunkPaths: string[];

    if (durationSeconds <= SINGLE_FILE_MAX_SECONDS) {
      // Short audio: send original bytes untouched (today's proven path).
      chunkPaths = [inputPath];
      chunkSeconds = Math.ceil(durationSeconds);
    } else {
      if (Math.ceil(durationSeconds / CHUNK_SECONDS) > MAX_FILES_PER_JOB) {
        // >100 min: stretch chunk size to fit 20 files. May exceed the safe
        // threshold for very long meetings — logged so it's visible.
        chunkSeconds = Math.ceil(durationSeconds / MAX_FILES_PER_JOB);
        console.warn(
          `[split-audio] duration ${durationSeconds}s needs >20 chunks; using ${chunkSeconds}s chunks (may exceed Sarvam-safe length)`,
        );
      }
      const { code, stderr } = await runFfmpeg([
        "-v", "error", "-y",
        "-i", inputPath,
        "-f", "segment",
        "-segment_time", String(chunkSeconds),
        "-c:a", "libmp3lame", "-q:a", "4",
        path.join(workDir, "chunk_%03d.mp3"),
      ]);
      if (code !== 0) {
        return res.status(500).json({ error: `ffmpeg split failed: ${stderr.slice(0, 300)}` });
      }
      const files = (await readdir(workDir)).filter((f) => f.startsWith("chunk_")).sort();
      if (files.length === 0) {
        return res.status(500).json({ error: "ffmpeg produced no chunks" });
      }
      chunkPaths = files.map((f) => path.join(workDir, f));
    }

    const fileNames = chunkPaths.map((_, i) => `chunk_${String(i).padStart(3, "0")}.mp3`);

    // 3. One Sarvam job for all chunks, with the meeting's webhook callback
    const job = await sarvamPost(sarvamApiKey, "", {
      job_parameters: {
        model: "saaras:v3",
        mode: "translate",
        with_diarization: true,
        language_code: "unknown",
      },
      callback: { url: callbackUrl, auth_token: callbackToken },
    });
    const jobId: string = job.job_id;

    // 4. Upload every chunk to its presigned URL
    const upload = await sarvamPost(sarvamApiKey, "/upload-files", {
      job_id: jobId,
      files: fileNames,
    });
    for (let i = 0; i < chunkPaths.length; i++) {
      const presigned = upload.upload_urls?.[fileNames[i]]?.file_url;
      if (!presigned) {
        return res.status(502).json({ error: `No presigned URL for ${fileNames[i]}` });
      }
      const bytes = await readFile(chunkPaths[i]);
      const put = await fetch(presigned, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream", "x-ms-blob-type": "BlockBlob" },
        body: new Uint8Array(bytes),
      });
      if (!put.ok) {
        return res.status(502).json({ error: `Chunk upload failed (${put.status}) for ${fileNames[i]}` });
      }
    }

    // 5. Start the job
    await sarvamPost(sarvamApiKey, `/${jobId}/start`, {});

    console.log(
      `[split-audio] job=${jobId} duration=${durationSeconds.toFixed(0)}s chunks=${chunkPaths.length}x${chunkSeconds}s`,
    );
    return res.status(200).json({
      job_id: jobId,
      chunk_count: chunkPaths.length,
      chunk_seconds: chunkSeconds,
      duration_seconds: Math.round(durationSeconds),
    });
  } catch (err) {
    console.error("[split-audio] error:", err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
