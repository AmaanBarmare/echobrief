/**
 * Resolve hook: maps a relative `./foo.js` specifier onto `./foo.ts` when the
 * TypeScript file is what actually exists on disk.
 *
 * Why this is needed. Vercel compiles `api/**\/*.ts` to `.js` but does NOT
 * rewrite import specifiers, so the source has to say `./auth.js` for the
 * deployed function to resolve. Node's type-stripping, which runs the tests,
 * does no such mapping — it looks for `auth.js`, finds nothing, and throws
 * ERR_MODULE_NOT_FOUND.
 *
 * Writing `.js` in TypeScript source is the NodeNext convention anyway; this
 * hook just lets the same source run untranspiled under `node --test`.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL) {
    const candidate = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
    if (existsSync(fileURLToPath(candidate))) {
      return { url: candidate.href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}
