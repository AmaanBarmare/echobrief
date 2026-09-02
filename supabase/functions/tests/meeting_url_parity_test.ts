/**
 * The browser and the server must agree on which meeting links are joinable.
 *
 * `src/lib/meetingUrl.ts` is a deliberate mirror of `_shared/validation.ts` so
 * the Record dialog can name the platform as you type. Two copies drift; this
 * test is what stops them. The server stays the authority — it re-validates
 * every URL — but a client that rejects a link the server would accept is a
 * feature the user cannot reach, which is exactly how Zoom and Teams came to
 * look unsupported despite working since the beginning.
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { parseMeetingUrl as serverParse } from "../_shared/validation.ts";
import { parseMeetingUrl as clientParse } from "../../../src/lib/meetingUrl.ts";

const CASES: string[] = [
  // Accepted
  "https://meet.google.com/abc-defg-hij",
  "https://zoom.us/j/1234567890",
  "https://us02web.zoom.us/j/1234567890?pwd=x",
  "https://company.zoom.us/j/999",
  "https://teams.microsoft.com/l/meetup-join/19%3ameeting_x/0?context=%7b%7d",
  "https://teams.live.com/meet/93123456789",
  "http://meet.google.com/abc-defg-hij",
  // Rejected
  "",
  "   ",
  "not a url",
  "ftp://meet.google.com/abc",
  "https://example.com/meet.google.com",
  "https://meet.google.com.evil.example/abc",
  "https://evilzoom.us/j/1",
  "https://zoom.us.attacker.example/j/1",
  "https://teams.microsoft.com.evil.example/x",
  "https://calendly.com/somebody",
];

Deno.test("client and server agree on every meeting URL", () => {
  for (const raw of CASES) {
    const server = serverParse(raw);
    const client = clientParse(raw);
    assertEquals(
      client.ok,
      server.ok,
      `disagreed on acceptance of ${JSON.stringify(raw)}`,
    );
    if (server.ok && client.ok) {
      assertEquals(
        client.platform,
        server.platform,
        `disagreed on platform for ${JSON.stringify(raw)}`,
      );
    }
  }
});

Deno.test("all three advertised platforms are actually accepted", () => {
  // The landing page, the docs and the Record dialog all promise these three.
  const promised: Array<[string, string]> = [
    ["https://meet.google.com/abc-defg-hij", "google_meet"],
    ["https://us02web.zoom.us/j/1234567890", "zoom"],
    ["https://teams.microsoft.com/l/meetup-join/19%3ameeting_x/0", "teams"],
  ];
  for (const [url, platform] of promised) {
    const server = serverParse(url);
    assertEquals(server.ok, true, `server rejects promised platform ${platform}`);
    if (server.ok) assertEquals(server.platform, platform);
    assertEquals(clientParse(url).platform, platform, `client mislabels ${platform}`);
  }
});

Deno.test("a lookalike host is never mistaken for the real one", () => {
  // Subdomain matching must not become suffix matching: evilzoom.us is not Zoom.
  for (const raw of [
    "https://evilzoom.us/j/1",
    "https://notteams.microsoft.com.evil.example/x",
    "https://meet.google.com.evil.example/abc",
  ]) {
    assertEquals(serverParse(raw).ok, false, raw);
    assertEquals(clientParse(raw).ok, false, raw);
  }
});
