import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isValidEmail, parseMeetingUrl } from "../_shared/validation.ts";

Deno.test("parseMeetingUrl accepts Zoom, Meet and Teams links", () => {
  const meet = parseMeetingUrl("https://meet.google.com/abc-defg-hij");
  assert(meet.ok);
  assertEquals(meet.platform, "google_meet");

  const zoom = parseMeetingUrl("https://us02web.zoom.us/j/1234567890?pwd=x");
  assert(zoom.ok);
  assertEquals(zoom.platform, "zoom");

  const zoomBare = parseMeetingUrl("https://zoom.us/j/1234567890");
  assert(zoomBare.ok);
  assertEquals(zoomBare.platform, "zoom");

  const teams = parseMeetingUrl(
    "https://teams.microsoft.com/l/meetup-join/19%3ameeting_x/0?context=%7b%7d",
  );
  assert(teams.ok);
  assertEquals(teams.platform, "teams");

  const teamsLive = parseMeetingUrl("https://teams.live.com/meet/9876543210");
  assert(teamsLive.ok);
  assertEquals(teamsLive.platform, "teams");
});

Deno.test("parseMeetingUrl rejects non-http(s), non-URL and unknown hosts", () => {
  assert(!parseMeetingUrl("").ok);
  assert(!parseMeetingUrl(undefined).ok);
  assert(!parseMeetingUrl("not a url").ok);
  assert(!parseMeetingUrl("ftp://meet.google.com/abc").ok);
  assert(!parseMeetingUrl("javascript:alert(1)").ok);
  assert(!parseMeetingUrl("https://example.com/meet.google.com").ok);
  // Suffix tricks must not pass the host check.
  assert(!parseMeetingUrl("https://evilzoom.us/j/1").ok);
  assert(!parseMeetingUrl("https://meet.google.com.evil.example/abc").ok);
});

Deno.test("isValidEmail accepts plain addresses and rejects junk", () => {
  assert(isValidEmail("person@example.com"));
  assert(isValidEmail("  person+tag@sub.example.co.in  "));
  assert(!isValidEmail(""));
  assert(!isValidEmail(null));
  assert(!isValidEmail("person"));
  assert(!isValidEmail("person@nodot"));
  assert(!isValidEmail("person name@example.com"));
  assert(!isValidEmail("person@exa mple.com"));
});
