/**
 * Unit harness: recall-pipeline Recall-API logic with mocked fetch.
 * Covers the transcript URL discovery chain, audio_mixed status mapping,
 * and audio URL resolution — the untested "stage D" of the pipeline.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  getAudioDownloadUrl,
  getAudioMixedStatus,
  getRecallTranscript,
} from "../_shared/recall-pipeline.ts";
import { jsonResponse, mockFetch } from "./helpers.ts";

const UTTERANCE = {
  participant: { id: 1, name: "Priya" },
  words: [
    { text: "hello", start_timestamp: { relative: 1.0 }, end_timestamp: { relative: 1.5 } },
  ],
};

Deno.test("getRecallTranscript: uses media_shortcuts download_url when present", async () => {
  const restore = mockFetch((url) => {
    if (url.startsWith("https://cdn.example/transcript")) return jsonResponse([UTTERANCE]);
    throw new Error(`unexpected fetch: ${url}`);
  });
  try {
    const botData = {
      recordings: [
        { id: "rec-1", media_shortcuts: { transcript: { data: { download_url: "https://cdn.example/transcript" } } } },
      ],
    };
    const result = await getRecallTranscript("bot-1", botData);
    assertEquals(result?.length, 1);
    assertEquals(result?.[0].participant.name, "Priya");
  } finally {
    restore();
  }
});

Deno.test("getRecallTranscript: falls back to transcript query by recording_id", async () => {
  const restore = mockFetch((url) => {
    if (url.includes("/transcript/?recording_id=rec-2")) {
      return jsonResponse({ results: [{ data: { download_url: "https://cdn.example/t2" } }] });
    }
    if (url.startsWith("https://cdn.example/t2")) return jsonResponse([UTTERANCE]);
    throw new Error(`unexpected fetch: ${url}`);
  });
  try {
    const result = await getRecallTranscript("bot-2", { recordings: [{ id: "rec-2" }] });
    assertEquals(result?.length, 1);
  } finally {
    restore();
  }
});

Deno.test("getRecallTranscript: no URL anywhere → null", async () => {
  const restore = mockFetch((url) => {
    if (url.includes("/transcript/")) return jsonResponse({ results: [] });
    throw new Error(`unexpected fetch: ${url}`);
  });
  try {
    assertEquals(await getRecallTranscript("bot-3", { recordings: [{ id: "rec-3" }] }), null);
  } finally {
    restore();
  }
});

Deno.test("getRecallTranscript: download failure → null (graceful)", async () => {
  const restore = mockFetch((url) => {
    if (url.startsWith("https://cdn.example/bad")) return new Response("nope", { status: 500 });
    throw new Error(`unexpected fetch: ${url}`);
  });
  try {
    const botData = {
      recordings: [{ id: "r", media_shortcuts: { transcript: { data: { download_url: "https://cdn.example/bad" } } } }],
    };
    assertEquals(await getRecallTranscript("bot-4", botData), null);
  } finally {
    restore();
  }
});

Deno.test("getRecallTranscript: empty transcript array → null", async () => {
  const restore = mockFetch(() => jsonResponse([]));
  try {
    const botData = {
      recordings: [{ id: "r", media_shortcuts: { transcript: { data: { download_url: "https://cdn.example/empty" } } } }],
    };
    assertEquals(await getRecallTranscript("bot-5", botData), null);
  } finally {
    restore();
  }
});

for (const code of ["done", "processing", "failed"] as const) {
  Deno.test(`getAudioMixedStatus: maps '${code}' through`, async () => {
    const restore = mockFetch(() => jsonResponse({ results: [{ status: { code } }] }));
    try {
      assertEquals(await getAudioMixedStatus({ recordings: [{ id: "r" }] }), code);
    } finally {
      restore();
    }
  });
}

Deno.test("getAudioMixedStatus: no recordings → missing", async () => {
  assertEquals(await getAudioMixedStatus({ recordings: [] }), "missing");
});

Deno.test("getAudioMixedStatus: empty results → missing", async () => {
  const restore = mockFetch(() => jsonResponse({ results: [] }));
  try {
    assertEquals(await getAudioMixedStatus({ recordings: [{ id: "r" }] }), "missing");
  } finally {
    restore();
  }
});

Deno.test("getAudioMixedStatus: HTTP error → unknown (defer, don't fail meetings)", async () => {
  const restore = mockFetch(() => new Response("boom", { status: 500 }));
  try {
    assertEquals(await getAudioMixedStatus({ recordings: [{ id: "r" }] }), "unknown");
  } finally {
    restore();
  }
});

Deno.test("getAudioMixedStatus: unexpected code → unknown", async () => {
  const restore = mockFetch(() => jsonResponse({ results: [{ status: { code: "transmogrified" } }] }));
  try {
    assertEquals(await getAudioMixedStatus({ recordings: [{ id: "r" }] }), "unknown");
  } finally {
    restore();
  }
});

Deno.test("getAudioMixedStatus: fetch throws → unknown", async () => {
  const restore = mockFetch(() => {
    throw new Error("network down");
  });
  try {
    assertEquals(await getAudioMixedStatus({ recordings: [{ id: "r" }] }), "unknown");
  } finally {
    restore();
  }
});

Deno.test("getAudioDownloadUrl: returns audio_mixed download_url", async () => {
  const restore = mockFetch((url) => {
    if (url.includes("/audio_mixed/")) {
      return jsonResponse({ results: [{ status: { code: "done" }, data: { download_url: "https://cdn.example/audio.mp3" } }] });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  try {
    assertEquals(
      await getAudioDownloadUrl({ recordings: [{ id: "r" }] }),
      "https://cdn.example/audio.mp3",
    );
  } finally {
    restore();
  }
});

Deno.test("getAudioDownloadUrl: falls back to video_url when audio_mixed unavailable", async () => {
  const restore = mockFetch(() => jsonResponse({ results: [] }));
  try {
    assertEquals(
      await getAudioDownloadUrl({ recordings: [{ id: "r" }], video_url: "https://cdn.example/video.mp4" }),
      "https://cdn.example/video.mp4",
    );
  } finally {
    restore();
  }
});
