/**
 * One-time backfill: seal the plaintext OAuth tokens already in the database.
 *
 * Run order for the whole change — each step is separately reversible, which is
 * the point, because these credentials cannot be re-minted without asking every
 * customer to re-authorise:
 *
 *   1. Set TOKEN_ENCRYPTION_KEY (Supabase secret + .env + this script's env).
 *   2. Deploy the functions. `open()` passes plaintext through, so the deployed
 *      code reads today's rows perfectly. NOTHING BREAKS AT THIS STEP — that is
 *      what makes it safe to do before the backfill rather than after.
 *   3. `--dry-run` here, and read the counts.
 *   4. Run for real. New writes were already sealing themselves from step 2, so
 *      this only has to catch what was written before.
 *   5. `--verify`. Every token column must read as sealed AND decrypt back to a
 *      plausible token.
 *   6. Set TOKEN_PLAINTEXT_READS=deny, so a row that escaped is an error rather
 *      than a silent plaintext credential.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... TOKEN_ENCRYPTION_KEY=... \
 *     deno run -A scripts/backfill-token-encryption.ts [--dry-run|--verify]
 *
 * The script is idempotent: an already-sealed value is skipped, so a re-run
 * after a partial failure resumes rather than double-encrypting.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isSealed, open, seal } from "../supabase/functions/_shared/crypto.ts";

const DRY = Deno.args.includes("--dry-run");
const VERIFY = Deno.args.includes("--verify");
/**
 * Scope the sweep to one table and/or one row. Used to seal a single canary
 * account first: ten credentials is a small blast radius, but one is smaller,
 * and a decrypt that Google rejects is much easier to diagnose on one row.
 *   --table=user_oauth_tokens --key=<user_id>
 */
const ONLY_TABLE = Deno.args.find((a) => a.startsWith("--table="))?.split("=")[1] ?? null;
const ONLY_KEY = Deno.args.find((a) => a.startsWith("--key="))?.split("=")[1] ?? null;

const url = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !serviceKey) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  Deno.exit(2);
}
// Fail before touching anything if the key is missing or malformed.
if (!Deno.env.get("TOKEN_ENCRYPTION_KEY")) {
  console.error("Set TOKEN_ENCRYPTION_KEY (base64, 32 bytes).");
  Deno.exit(2);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

interface Target {
  table: string;
  /** Columns holding a credential. */
  columns: string[];
  /** Primary key used to write the row back. */
  key: string;
}

const TARGETS: Target[] = [
  // Google's write path. The trigger mirrors this into calendar_connections,
  // so sealing here also lands there — but the mirror only fires on write, and
  // rows written before the trigger existed may differ, so both are swept.
  { table: "user_oauth_tokens", columns: ["google_access_token", "google_refresh_token"], key: "user_id" },
  { table: "calendar_connections", columns: ["access_token", "refresh_token"], key: "id" },
];

interface Counts {
  rows: number;
  alreadySealed: number;
  sealed: number;
  empty: number;
  failed: number;
}

async function sweep(target: Target): Promise<Counts> {
  const counts: Counts = { rows: 0, alreadySealed: 0, sealed: 0, empty: 0, failed: 0 };
  let query = db.from(target.table).select([target.key, ...target.columns].join(", "));
  if (ONLY_KEY) query = query.eq(target.key, ONLY_KEY);
  const { data, error } = await query;
  if (error) throw new Error(`${target.table}: ${error.message}`);

  for (const row of (data ?? []) as unknown as Record<string, string | null>[]) {
    counts.rows++;
    const update: Record<string, string> = {};
    for (const col of target.columns) {
      const value = row[col];
      if (!value) { counts.empty++; continue; }
      if (isSealed(value)) { counts.alreadySealed++; continue; }
      update[col] = await seal(value);
    }
    if (!Object.keys(update).length) continue;

    if (DRY) {
      counts.sealed += Object.keys(update).length;
      continue;
    }
    const { error: writeError } = await db
      .from(target.table)
      .update(update)
      .eq(target.key, row[target.key] as string);
    if (writeError) {
      counts.failed += Object.keys(update).length;
      // Identify the row, never the credential.
      console.error(`  ! ${target.table} ${row[target.key]}: ${writeError.message}`);
    } else {
      counts.sealed += Object.keys(update).length;
    }
  }
  return counts;
}

async function verify(target: Target): Promise<boolean> {
  const { data, error } = await db
    .from(target.table)
    .select([target.key, ...target.columns].join(", "));
  if (error) throw new Error(`${target.table}: ${error.message}`);

  let plaintext = 0;
  let undecryptable = 0;
  let ok = 0;
  for (const row of (data ?? []) as unknown as Record<string, string | null>[]) {
    for (const col of target.columns) {
      const value = row[col];
      if (!value) continue;
      if (!isSealed(value)) {
        plaintext++;
        console.error(`  ! PLAINTEXT ${target.table}.${col} row ${row[target.key]}`);
        continue;
      }
      try {
        const plain = await open(value);
        // A decrypt that "succeeds" into an empty string would still break the
        // integration, so assert the shape rather than just the absence of a throw.
        if (!plain || plain.length < 8) throw new Error("implausibly short");
        ok++;
      } catch (err) {
        undecryptable++;
        console.error(`  ! UNDECRYPTABLE ${target.table}.${col} row ${row[target.key]}: ${err}`);
      }
    }
  }
  console.log(`  ${target.table}: ${ok} decrypt cleanly, ${plaintext} still plaintext, ${undecryptable} undecryptable`);
  return plaintext === 0 && undecryptable === 0;
}

if (VERIFY) {
  console.log("Verifying every stored credential is sealed and decrypts…\n");
  let allGood = true;
  for (const target of TARGETS) allGood = (await verify(target)) && allGood;
  console.log(
    allGood
      ? "\nPASS — safe to set TOKEN_PLAINTEXT_READS=deny."
      : "\nFAIL — do NOT set TOKEN_PLAINTEXT_READS=deny yet. Fix the rows above and re-run the backfill.",
  );
  Deno.exit(allGood ? 0 : 1);
}

console.log(DRY ? "DRY RUN — nothing will be written.\n" : "Sealing plaintext credentials…\n");
for (const target of TARGETS) {
  if (ONLY_TABLE && target.table !== ONLY_TABLE) continue;
  const c = await sweep(target);
  console.log(
    `  ${target.table}: ${c.rows} rows · ${c.sealed} ${DRY ? "would be sealed" : "sealed"} · ` +
      `${c.alreadySealed} already sealed · ${c.empty} empty · ${c.failed} failed`,
  );
}
console.log(
  DRY
    ? "\nRe-run without --dry-run to apply, then with --verify."
    : "\nNow run with --verify before setting TOKEN_PLAINTEXT_READS=deny.",
);
