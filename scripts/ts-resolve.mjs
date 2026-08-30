/**
 * Entry point for `node --import ./scripts/ts-resolve.mjs`.
 * Registers the .js -> .ts resolve hook. See ts-resolve-hooks.mjs for why.
 */
import { register } from "node:module";
register("./ts-resolve-hooks.mjs", import.meta.url);
