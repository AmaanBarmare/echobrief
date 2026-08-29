/**
 * Unit harness: Sarvam client helpers with mocked fetch.
 * Critical behavior under test: multi-file output discovery + NUMERIC sort
 * ("2.json" before "10.json") — chunk stitch order depends on it.
 */
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { downloadAllSarvamResults, uploadToSarvamJob } from "../_shared/sarvam.ts";
import { jsonResponse, mockFetch } from "./helpers.ts";

function statusWith(names: string[]) {
  return {
    job_id: "job-1",
    job_state: "Completed",
    job_details: names.map((n) => ({ state: "Success", outputs: [{ file_name: n }] })),
  };
}

Deno.test("downloadAllSarvamResults: numeric sort, ordered downloads", async () => {
  const restore = mockFetch((url, init) => {
    if (url.endsWith("/job-1/status")) return jsonResponse(statusWith(["10.json", "0.json", "2.json"]));
    if (url.endsWith("/download-files")) {
      const body = JSON.parse(String(init?.body));
      assertEquals(body.files, ["0.json", "2.json", "10.json"]); // numeric, not lexicographic
      return jsonResponse({
        download_urls: {
          "0.json": { file_url: "https://cdn.example/0" },
          "2.json": { file_url: "https://cdn.example/2" },
          "10.json": { file_url: "https://cdn.example/10" },
        },
      });
    }
    if (url === "https://cdn.example/0") return jsonResponse({ transcript: "chunk zero" });
    if (url === "https://cdn.example/2") return jsonResponse({ transcript: "chunk two" });
    if (url === "https://cdn.example/10") return jsonResponse({ transcript: "chunk ten" });
    throw new Error(`unexpected fetch: ${url}`);
  });
  try {
    const results = await downloadAllSarvamResults("key", "job-1");
    assertEquals(results.map((r) => r.transcript), ["chunk zero", "chunk two", "chunk ten"]);
  } finally {
    restore();
  }
});

Deno.test("downloadAllSarvamResults: no outputs → throws", async () => {
  const restore = mockFetch((url) => {
    if (url.endsWith("/status")) return jsonResponse({ job_details: [{ outputs: [] }] });
    throw new Error(`unexpected fetch: ${url}`);
  });
  try {
    await assertRejects(
      () => downloadAllSarvamResults("key", "job-2"),
      Error,
      "no output files",
    );
  } finally {
    restore();
  }
});

Deno.test("downloadAllSarvamResults: missing download URL for an output → throws", async () => {
  const restore = mockFetch((url) => {
    if (url.endsWith("/status")) return jsonResponse(statusWith(["0.json", "1.json"]));
    if (url.endsWith("/download-files")) {
      return jsonResponse({ download_urls: { "0.json": { file_url: "https://cdn.example/0" } } });
    }
    if (url === "https://cdn.example/0") return jsonResponse({ transcript: "ok" });
    throw new Error(`unexpected fetch: ${url}`);
  });
  try {
    await assertRejects(
      () => downloadAllSarvamResults("key", "job-3"),
      Error,
      'No download URL for output "1.json"',
    );
  } finally {
    restore();
  }
});

Deno.test("downloadAllSarvamResults: status HTTP error → throws", async () => {
  const restore = mockFetch(() => new Response("unavailable", { status: 503 }));
  try {
    await assertRejects(() => downloadAllSarvamResults("key", "job-4"), Error, "503");
  } finally {
    restore();
  }
});

// Sarvam decodes a batch blob by its stored content type. Uploaded as
// application/octet-stream the job reports Success and returns an EMPTY
// transcript — a silent failure that costs every long meeting its Sarvam
// transcript and drops it to the Whisper fallback. Confirmed against the live
// API 2026-08-29. See `sarvam:silent_empty_output` in errors.md.
Deno.test("uploadToSarvamJob: PUTs audio with a real audio content type, never octet-stream", async () => {
  let putContentType: string | null = null;
  const restore = mockFetch((url, init) => {
    if (url.endsWith("/upload-files")) {
      return jsonResponse({ upload_urls: { "recall-audio.mp3": { file_url: "https://blob.example/put" } } });
    }
    if (url === "https://blob.example/put") {
      putContentType = new Headers(init?.headers).get("content-type");
      return new Response(null, { status: 201 });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  try {
    await uploadToSarvamJob("key", "job-1", "recall-audio.mp3", new Blob(["audio"]));
    assertEquals(putContentType, "audio/mpeg");
  } finally {
    restore();
  }
});

Deno.test("uploadToSarvamJob: content type follows the file extension", async () => {
  const seen: string[] = [];
  const restore = mockFetch((url, init) => {
    if (url.endsWith("/upload-files")) {
      const name = JSON.parse(String(init?.body)).files[0];
      return jsonResponse({ upload_urls: { [name]: { file_url: "https://blob.example/put" } } });
    }
    if (url === "https://blob.example/put") {
      seen.push(new Headers(init?.headers).get("content-type") || "");
      return new Response(null, { status: 201 });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  try {
    await uploadToSarvamJob("key", "job-1", "chunk.wav", new Blob(["a"]));
    await uploadToSarvamJob("key", "job-1", "chunk.m4a", new Blob(["a"]));
    assertEquals(seen, ["audio/wav", "audio/mp4"]);
  } finally {
    restore();
  }
});
