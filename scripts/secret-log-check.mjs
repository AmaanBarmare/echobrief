#!/usr/bin/env node
/**
 * Blocks a commit that logs credential material.
 *
 * The September 2026 audit found `sync-calendars` writing the first 20
 * characters of a live Google access token to the function logs — truncated,
 * but still credential material in a stream visible to everyone with dashboard
 * access. One instance is a slip; the way it stays fixed is a check.
 *
 * Deliberately narrow: it looks for a token-ish identifier being interpolated
 * into a console call, not for the word "token" anywhere. A wide net here would
 * be turned off within a week.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const SECRET_WORD = "(?:access_?token|refresh_?token|id_?token|api_?key|apikey|secret|password|passwd|service_?role|bearer|credential)";

// A console.* call that interpolates something secret-looking, with or without
// a .substring()/.slice() truncation — truncating does not make it safe.
const PATTERN = new RegExp(
  String.raw`console\.(log|info|warn|error|debug)\s*\([^)]*\$\{[^}]*${SECRET_WORD}[^}]*\}`,
  "i",
);
// The same thing passed as a plain argument: console.log("x", accessToken)
const ARG_PATTERN = new RegExp(
  String.raw`console\.(log|info|warn|error|debug)\s*\([^)]*[,(]\s*\w*${SECRET_WORD}\w*\s*[,)]`,
  "i",
);

const IGNORE = /secret-log-check|\/tests?\//i;
const ALLOW_COMMENT = "secret-log-ok";

function stagedFiles() {
  const out = execSync("git diff --cached --name-only --diff-filter=ACM", { encoding: "utf8" });
  return out.split("\n").filter((f) => /\.(ts|tsx|js|mjs)$/.test(f) && !IGNORE.test(f));
}

const violations = [];
for (const file of stagedFiles()) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue; // deleted between staging and now
  }
  content.split("\n").forEach((line, i) => {
    if (line.includes(ALLOW_COMMENT)) return;
    if (PATTERN.test(line) || ARG_PATTERN.test(line)) {
      violations.push(`${file}:${i + 1}  ${line.trim().slice(0, 120)}`);
    }
  });
}

if (violations.length > 0) {
  console.error("\nCredential material in a log line:\n");
  for (const v of violations) console.error("  " + v);
  console.error(
    "\nLog an identifier (a user id) instead of the credential. Truncating a token" +
    "\ndoes not make it safe to log. If this really is a false positive, put a" +
    `\n// ${ALLOW_COMMENT} comment on the line.\n`,
  );
  process.exit(1);
}
