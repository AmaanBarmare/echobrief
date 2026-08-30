/**
 * Guards the import-specifier rule that took down the first deploy.
 *
 * Vercel compiles `api/**` TypeScript to `.js` but leaves import specifiers
 * exactly as written. A source file importing "./auth.ts" therefore deploys to
 * a function whose `mcp.js` asks for `auth.ts`, which does not exist in the
 * bundle — ERR_MODULE_NOT_FOUND, FUNCTION_INVOCATION_FAILED, every request 500s.
 *
 * The unit tests could not catch it, because Node's type stripping resolves
 * `./auth.ts` perfectly well. Only the built artifact disagreed. This test
 * encodes the rule itself so the mistake fails in under a millisecond instead
 * of in production.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = fileURLToPath(new URL("../..", import.meta.url));

function collectTsFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...collectTsFiles(full));
    else if (entry.endsWith(".ts")) found.push(full);
  }
  return found;
}

test("no source under api/ imports a relative path with a .ts extension", () => {
  const offenders: string[] = [];
  for (const file of collectTsFiles(apiDir)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/from\s+["'](\.[^"']*\.ts)["']/g)) {
      offenders.push(`${file.replace(apiDir, "api/")} -> ${match[1]}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "Relative imports under api/ must end in .js, not .ts — Vercel does not rewrite " +
      "specifiers, so a .ts specifier resolves to nothing in the deployed bundle. " +
      "Offenders:\n" + offenders.join("\n"),
  );
});

test("every relative .js specifier under api/ has a matching .ts source", () => {
  const missing: string[] = [];
  for (const file of collectTsFiles(apiDir)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/from\s+["'](\.[^"']*\.js)["']/g)) {
      const target = new URL(match[1].replace(/\.js$/, ".ts"), `file://${file}`);
      try {
        statSync(fileURLToPath(target));
      } catch {
        missing.push(`${file.replace(apiDir, "api/")} -> ${match[1]}`);
      }
    }
  }
  assert.deepEqual(missing, [], `Specifiers pointing at nothing:\n${missing.join("\n")}`);
});
