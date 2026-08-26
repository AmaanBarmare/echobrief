import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { C, emailShell, escapeHtml, GRADIENT, LOCKUP } from "../_shared/email-brand.ts";
import { buildEmailHtml } from "../send-meeting-email/template.ts";
import { generateEmailHTML } from "../send-email-report/template.ts";
import { buildAlertHtml, buildAlertSubject } from "../monitor-stuck-meetings/alert-template.ts";

/**
 * These lock the one thing that kept drifting: every mail we send looking like
 * it came from the same product. Auth mail sat on a retired navy-and-orange design for
 * months because nothing in this repo rendered it (see the retired hexes asserted
 * absent below) — the generated files in
 * supabase/auth-emails/ are covered here too.
 */

const SHELL_MARKS = [
  LOCKUP, // the lockup, not a text wordmark
  GRADIENT, // ember→gold hairline
  "DM+Serif+Display", // brand type, loaded once
  "Manrope",
  "IBM+Plex+Mono",
  C.paper, // warm paper ground, never a cold grey // brand-check-ignore
  C.paperCard,
];

function assertOnBrand(html: string, label: string) {
  for (const mark of SHELL_MARKS) {
    assertStringIncludes(html, mark, `${label} is missing ${mark}`);
  }
  // Retired palette from the pre-Warm-Dispatch templates.
  for (const dead of ["#1a1a2e", "#f97316", "#16213e", "#f8f8f8"]) { // brand-check-ignore — the retired palette, asserted absent
    assert(!html.toLowerCase().includes(dead), `${label} still carries retired colour ${dead}`);
  }
  // The app stack does not belong in mail.
  for (const appFont of ["Switzer", "JetBrains"]) {
    assert(!html.includes(appFont), `${label} uses the app font ${appFont}`);
  }
}

Deno.test("the shell itself carries the brand marks", () => {
  assertOnBrand(emailShell({ eyebrow: "Test", headline: "Hello", bodyRows: "" }), "shell");
});

Deno.test("shell escapes text that reaches the headline", () => {
  const html = emailShell({ eyebrow: "x", headline: '<script>alert(1)</script>', bodyRows: "" });
  assert(!html.includes("<script>"), "headline was not escaped");
  assertStringIncludes(html, "&lt;script&gt;");
});

Deno.test("escapeHtml handles the characters that break a layout", () => {
  assertEquals(escapeHtml('a & b < c > d "e"'), "a &amp; b &lt; c &gt; d &quot;e&quot;");
  assertEquals(escapeHtml(null), "");
});

Deno.test("the meeting summary is built from the shell", () => {
  const html = buildEmailHtml({
    title: "Pricing review",
    date: "24 August 2026",
    time: "6:45 PM",
    duration: 42,
    meetingId: "m-1",
    insights: {
      summary_short: "Pro tier moves to 1,499.",
      action_items: [{ task: "Draft the email", owner: "Vineet", priority: "high" }],
      decisions: [{ decision: "Ship on 1 October" }],
    },
  });
  assertOnBrand(html, "summary email");
  assertStringIncludes(html, "Meeting summary");
  assertStringIncludes(html, "Open the full report");
});

Deno.test("the generated auth templates are on the same shell", async () => {
  const dir = new URL("../../auth-emails/", import.meta.url);
  const names = [
    "recovery",
    "confirmation",
    "invite",
    "magic_link",
    "email_change",
    "reauthentication",
  ];
  for (const name of names) {
    const html = await Deno.readTextFile(new URL(`${name}.html`, dir));
    assertOnBrand(html, `auth:${name}`);
  }
});

Deno.test("auth templates keep the Go placeholders Supabase substitutes", async () => {
  const dir = new URL("../../auth-emails/", import.meta.url);
  const required: Record<string, string[]> = {
    recovery: ["{{ .ConfirmationURL }}"],
    confirmation: ["{{ .ConfirmationURL }}"],
    invite: ["{{ .ConfirmationURL }}"],
    magic_link: ["{{ .ConfirmationURL }}"],
    email_change: ["{{ .ConfirmationURL }}", "{{ .Email }}", "{{ .NewEmail }}"],
    reauthentication: ["{{ .Token }}"],
  };
  for (const [name, vars] of Object.entries(required)) {
    const html = await Deno.readTextFile(new URL(`${name}.html`, dir));
    for (const v of vars) {
      assertStringIncludes(html, v, `auth:${name} lost ${v} — the mail would ship a dead link`);
    }
  }
});

Deno.test("the forwarded report is built from the shell, and escapes its content", () => {
  const html = generateEmailHTML(
    {
      summary_short: "Pricing lands in October.",
      key_points: ["<script>alert(1)</script>"],
      decisions: [{ decision: "Ship on the 1st" }],
      action_items: [{ task: "Send the note", owner: "Adnan", priority: "medium" }],
    },
    { id: "m-2", title: "Pricing review", start_time: "2026-08-24T13:15:00Z" },
  );
  assertOnBrand(html, "report email");
  assert(!html.includes("<script>"), "report did not escape a key point");
  assertStringIncludes(html, "Meeting report");
});

Deno.test("the monitor alert is built from the shell and names the signature", () => {
  const input = {
    meeting: {
      id: "m-3",
      title: "Daily sync",
      user_id: "u-1",
      status: "processing",
      recall_bot_id: null,
      sarvam_job_id: null,
    },
    detection: { signature: "stuck:processing:no_sarvam_job", age_minutes: 37, details: { a: 1 } },
    recoveryNote: "re-fired check-recall-status",
    recoveryOk: true,
    isNewPattern: false,
    isHarnessMeeting: false,
  };
  assertOnBrand(buildAlertHtml(input), "monitor alert");
  assertStringIncludes(buildAlertHtml(input), "stuck:processing:no_sarvam_job");
  assertStringIncludes(buildAlertSubject(input), "[ECHOBRIEF]");
  assertStringIncludes(
    buildAlertSubject({ ...input, isNewPattern: true }),
    "[ECHOBRIEF NEW ERROR]",
  );
  assertStringIncludes(
    buildAlertSubject({ ...input, isHarnessMeeting: true }),
    "[ECHOBRIEF HARNESS TEST]",
  );
});
