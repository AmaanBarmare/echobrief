const SARVAM_BASE_URL = "https://api.sarvam.ai/speech-to-text/job/v1";

interface SarvamJobResponse {
  job_id: string;
  storage_container_type: string;
  job_parameters: Record<string, unknown>;
  job_state: string;
}

interface FileSignedURLDetails {
  file_url: string;
  file_metadata: Record<string, unknown> | null;
}

interface SarvamUploadResponse {
  job_id: string;
  job_state: string;
  upload_urls: Record<string, FileSignedURLDetails>;
  storage_container_type: string;
}

interface SarvamDownloadResponse {
  job_id: string;
  job_state: string;
  download_urls: Record<string, FileSignedURLDetails>;
  storage_container_type: string;
}

export async function createSarvamJob(
  apiKey: string,
  callbackUrl: string,
  callbackToken: string,
): Promise<SarvamJobResponse> {
  const res = await fetch(SARVAM_BASE_URL, {
    method: "POST",
    headers: {
      "api-subscription-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      job_parameters: {
        model: "saaras:v3",
        mode: "translate",
        with_diarization: true,
        language_code: "unknown",
      },
      callback: {
        url: callbackUrl,
        auth_token: callbackToken,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sarvam create job failed (${res.status}): ${err}`);
  }
  return res.json();
}

/** Sarvam decodes the blob by its stored content type — see the PUT below. */
function contentTypeFor(fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop();
  switch (ext) {
    case "wav": return "audio/wav";
    case "m4a": return "audio/mp4";
    case "mp4": return "video/mp4";
    case "ogg": return "audio/ogg";
    case "webm": return "audio/webm";
    default: return "audio/mpeg";
  }
}

export async function uploadToSarvamJob(
  apiKey: string,
  jobId: string,
  fileName: string,
  audioBlob: Blob,
): Promise<void> {
  // Step 1: Get presigned upload URL
  const uploadRes = await fetch(`${SARVAM_BASE_URL}/upload-files`, {
    method: "POST",
    headers: {
      "api-subscription-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      job_id: jobId,
      files: [fileName],
    }),
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Sarvam get upload URL failed (${uploadRes.status}): ${err}`);
  }

  const uploadData: SarvamUploadResponse = await uploadRes.json();
  const presignedUrl = uploadData.upload_urls?.[fileName]?.file_url;

  if (!presignedUrl) {
    throw new Error(
      `No presigned upload URL returned from Sarvam for file "${fileName}". Response: ${JSON.stringify(uploadData)}`,
    );
  }

  // Step 2: PUT the audio file to the presigned URL.
  //
  // The Content-Type here is NOT cosmetic. Sarvam's batch pipeline reads the
  // blob's stored content type to decide how to decode the audio: uploaded as
  // `application/octet-stream` the job still reports `state: Success` with
  // `successful_files_count: 1`, but every output field comes back empty —
  // `transcript: ""`, `language_code: null`. Confirmed 2026-08-29 by uploading
  // one identical file twice: octet-stream returned 0 chars, `audio/mpeg`
  // returned the full transcript. The sync endpoint is unaffected, which is why
  // the key looked healthy while every batch job silently produced nothing.
  // See `sarvam:silent_empty_output` in errors.md.
  const putRes = await fetch(presignedUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentTypeFor(fileName),
      "x-ms-blob-type": "BlockBlob",
    },
    body: audioBlob,
  });

  if (!putRes.ok) {
    const err = await putRes.text();
    throw new Error(`Sarvam file upload failed (${putRes.status}): ${err}`);
  }
}

export async function getSarvamJobStatus(
  apiKey: string,
  jobId: string,
): Promise<{ job_id: string; job_state: string }> {
  const res = await fetch(`${SARVAM_BASE_URL}/${jobId}/status`, {
    method: "GET",
    headers: {
      "api-subscription-key": apiKey,
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sarvam get job status failed (${res.status}): ${err}`);
  }
  return res.json();
}

export async function startSarvamJob(
  apiKey: string,
  jobId: string,
): Promise<void> {
  const res = await fetch(`${SARVAM_BASE_URL}/${jobId}/start`, {
    method: "POST",
    headers: {
      "api-subscription-key": apiKey,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sarvam start job failed (${res.status}): ${err}`);
  }
}

/**
 * Downloads ALL output files of a (possibly multi-file/chunked) Sarvam job,
 * ordered by chunk index.
 *
 * Sarvam names multi-file outputs `0.json`, `1.json`, ... in input-file order
 * (validated empirically 2026-06-10 with a 10-chunk job). We sort numerically
 * so the caller can stitch transcripts back together in meeting order.
 */
export async function downloadAllSarvamResults(
  apiKey: string,
  jobId: string,
): Promise<Record<string, unknown>[]> {
  const statusRes = await fetch(`${SARVAM_BASE_URL}/${jobId}/status`, {
    method: "GET",
    headers: { "api-subscription-key": apiKey },
  });
  if (!statusRes.ok) {
    throw new Error(
      `Sarvam status for ${jobId} failed (${statusRes.status}): ${await statusRes.text()}`,
    );
  }
  const statusData = await statusRes.json();
  const jobDetails = Array.isArray(statusData.job_details)
    ? statusData.job_details
    : [];
  const names: string[] = [];
  for (const detail of jobDetails) {
    for (const output of (Array.isArray(detail?.outputs) ? detail.outputs : [])) {
      if (typeof output?.file_name === "string") names.push(output.file_name);
    }
  }
  if (names.length === 0) {
    throw new Error(`Sarvam job ${jobId} reports no output files`);
  }
  names.sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));

  const dlRes = await fetch(`${SARVAM_BASE_URL}/download-files`, {
    method: "POST",
    headers: {
      "api-subscription-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ job_id: jobId, files: names }),
  });
  if (!dlRes.ok) {
    throw new Error(
      `Sarvam download-files for ${jobId} failed (${dlRes.status}): ${await dlRes.text()}`,
    );
  }
  const dlData: SarvamDownloadResponse = await dlRes.json();

  const results: Record<string, unknown>[] = [];
  for (const name of names) {
    const url = dlData.download_urls?.[name]?.file_url;
    if (!url) throw new Error(`No download URL for output "${name}" of job ${jobId}`);
    const fileRes = await fetch(url);
    if (!fileRes.ok) {
      throw new Error(`Fetching output "${name}" failed (${fileRes.status})`);
    }
    results.push(await fileRes.json());
  }
  console.log(`[sarvam] Downloaded ${results.length} chunk outputs for job ${jobId}`);
  return results;
}

export async function downloadSarvamResults(
  apiKey: string,
  jobId: string,
  fileName: string,
): Promise<Record<string, unknown>> {
  // Step 1: Ask Sarvam's status endpoint for the authoritative list of output
  // file names. The status response includes `job_details[].outputs[].file_name`
  // which is the real output filename — guessing patterns like "recall-audio.json"
  // does not work because Sarvam's naming is not predictable from the input.
  const discoveredNames: string[] = [];
  try {
    const statusRes = await fetch(`${SARVAM_BASE_URL}/${jobId}/status`, {
      method: "GET",
      headers: { "api-subscription-key": apiKey },
    });
    if (statusRes.ok) {
      const statusData = await statusRes.json();
      const jobDetails = Array.isArray(statusData.job_details)
        ? statusData.job_details
        : [];
      for (const detail of jobDetails) {
        const outputs = Array.isArray(detail?.outputs) ? detail.outputs : [];
        for (const output of outputs) {
          if (output?.file_name && typeof output.file_name === "string") {
            discoveredNames.push(output.file_name);
          }
        }
      }
      console.log(
        `[sarvam] Discovered output files from status: ${discoveredNames.join(", ") || "(none)"}`,
      );
    } else {
      const errText = await statusRes.text().catch(() => "");
      console.warn(
        `[sarvam] Status query for ${jobId} failed (${statusRes.status}): ${errText.substring(0, 200)}`,
      );
    }
  } catch (err) {
    console.warn(`[sarvam] Status query for ${jobId} threw:`, err);
  }

  // Step 2: Build candidate list. Prefer discovered names; fall back to guessed
  // patterns in case the status endpoint is momentarily unavailable.
  const baseName = fileName.replace(/\.[^.]+$/, "");
  const candidateNames = [
    ...discoveredNames,
    fileName.replace(/\.[^.]+$/, ".json"),   // recall-audio.json
    fileName,                                  // recall-audio.mp3 (original)
    `${baseName}_output.json`,                 // recall-audio_output.json
    "output.json",                             // generic
  ];
  // Deduplicate, preserving order (discovered names first).
  const uniqueNames = [...new Set(candidateNames)];

  for (const candidate of uniqueNames) {
    try {
      const res = await fetch(`${SARVAM_BASE_URL}/download-files`, {
        method: "POST",
        headers: {
          "api-subscription-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          job_id: jobId,
          files: [candidate],
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        console.warn(`[sarvam] Download attempt for "${candidate}" failed (${res.status}): ${err.substring(0, 200)}`);
        continue;
      }

      const downloadData: SarvamDownloadResponse = await res.json();
      console.log(`[sarvam] Download response for "${candidate}": keys=${Object.keys(downloadData).join(",")}, download_urls_keys=${Object.keys(downloadData.download_urls || {}).join(",")}`);

      const downloadUrl = downloadData.download_urls?.[candidate]?.file_url;
      if (!downloadUrl) {
        console.warn(`[sarvam] No download URL in response for "${candidate}"`);
        continue;
      }

      const fileRes = await fetch(downloadUrl);
      if (!fileRes.ok) {
        console.warn(`[sarvam] Fetching result file for "${candidate}" failed (${fileRes.status})`);
        continue;
      }

      console.log(`[sarvam] Successfully downloaded results using file name "${candidate}"`);
      return fileRes.json();
    } catch (err) {
      console.warn(`[sarvam] Error trying file name "${candidate}":`, err);
      continue;
    }
  }

  throw new Error(
    `Sarvam download failed: no output file found. Tried: ${uniqueNames.join(", ")}`,
  );
}
