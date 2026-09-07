/**
 * The two halves of upload ingest must agree on what may be uploaded.
 *
 * The rules live twice on purpose: `prepare-upload` runs on Deno and is the
 * authority (it is the entitlement gate, and it is what a forged client cannot
 * bypass), while `api/upload.ts` runs on Node and must state the same limits
 * when it mints the blob token — the token itself carries
 * `allowedContentTypes` and `maximumSizeInBytes`, so blob storage enforces them
 * before a byte reaches us. The runtimes cannot share a module: `api/` needs
 * `.js` import specifiers and Deno needs `.ts`.
 *
 * Two copies drift. A client list NARROWER than the server's is a file type the
 * product silently refuses; WIDER, and blob storage accepts bytes the server
 * will then refuse to process — the user pays the upload and gets nothing. This
 * test is what keeps them equal. Same reasoning as `meeting_url_parity_test.ts`.
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

const read = (p: string) => Deno.readTextFileSync(new URL(p, import.meta.url));

/** Pull an array literal like `const NAME = [ "a", "b" ];` out of source. */
function extractList(source: string, name: string): string[] {
  const match = source.match(new RegExp(`${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`));
  if (!match) throw new Error(`could not find ${name}`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/** Pull `const NAME = <expr>;` and evaluate the arithmetic. */
function extractBytes(source: string, name: string): number {
  const match = source.match(new RegExp(`${name}\\s*=\\s*([0-9*\\s]+);`));
  if (!match) throw new Error(`could not find ${name}`);
  return match[1].split("*").map((n) => Number(n.trim())).reduce((a, b) => a * b, 1);
}

const server = read("../prepare-upload/index.ts");
const client = read("../../../api/upload.ts");

Deno.test("upload: both runtimes allow exactly the same content types", () => {
  const a = extractList(server, "ALLOWED_CONTENT_TYPES");
  const b = extractList(client, "ALLOWED_CONTENT_TYPES");
  assertEquals([...a].sort(), [...b].sort());
});

Deno.test("upload: the allowlist is non-empty and lower-case", () => {
  const types = extractList(server, "ALLOWED_CONTENT_TYPES");
  assertEquals(types.length > 0, true);
  assertEquals(types.every((t) => t === t.toLowerCase()), true);
  // prepare-upload lower-cases the incoming header before comparing; an
  // upper-case entry here would be unmatchable.
});

Deno.test("upload: both runtimes cap the transfer at the same size", () => {
  assertEquals(
    extractBytes(server, "MAX_UPLOAD_BYTES"),
    extractBytes(client, "MAX_UPLOAD_BYTES"),
  );
});

Deno.test("upload: an audio type the pipeline actually produces is accepted", () => {
  // Recall hands us 16 kHz mono mp3, and that is the format the whole splitter
  // path is tuned for. If audio/mpeg ever falls out of this list, uploads of
  // the most common recording format stop working.
  assertEquals(extractList(server, "ALLOWED_CONTENT_TYPES").includes("audio/mpeg"), true);
});
