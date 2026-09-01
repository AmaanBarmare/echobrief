#!/usr/bin/env node
/**
 * Mint early-access codes.
 *
 * Prints the codes for you to hand out and the SQL that creates them. It does
 * not touch the database — paste the SQL into the Supabase SQL editor, or pipe
 * it to psql. Keeping the write manual means a mistyped `--count 500` costs a
 * scroll, not 500 free accounts.
 *
 *   node scripts/make-access-codes.mjs --count 10 --plan pro --days 90 \
 *     --note "design partners, batch 1" --offer-days 30
 *
 *   --count       how many codes to mint (default 10)
 *   --plan        trial | starter | pro | teams (default trial —
 *                 10 recorded hours, no overage, 2 h per meeting)
 *   --days        how long access lasts once redeemed (default 90)
 *   --uses        how many people may redeem EACH code (default 1)
 *   --offer-days  the code itself stops working after this many days (optional)
 *   --prefix      code prefix (default EB)
 *   --note        free text stored with the code, e.g. which cohort
 */
import { randomInt } from 'node:crypto';

// No 0/O/1/I/L — these get read aloud, typed from a screenshot, and written on
// paper. Ambiguity here costs a support message.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function block(n) {
  let out = '';
  // randomInt is the CSPRNG — Math.random() would make codes guessable, and a
  // guessable code is free Recall bot-hours.
  for (let i = 0; i < n; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

const count = Number(arg('count', 10));
const plan = arg('plan', 'trial');
const days = Number(arg('days', 90));
const uses = Number(arg('uses', 1));
const offerDays = arg('offer-days', null);
const prefix = arg('prefix', 'EB').toUpperCase();
const note = arg('note', 'early access');

if (!['trial', 'starter', 'pro', 'teams'].includes(plan)) {
  console.error(`--plan must be trial, starter, pro or teams (got "${plan}")`);
  process.exit(1);
}
if (!Number.isInteger(count) || count < 1 || count > 500) {
  console.error('--count must be between 1 and 500');
  process.exit(1);
}
if (!Number.isInteger(days) || days < 1 || days > 730) {
  console.error('--days must be between 1 and 730');
  process.exit(1);
}

const codes = new Set();
while (codes.size < count) codes.add(`${prefix}-${block(4)}-${block(4)}`);

const expiresAt = offerDays
  ? `now() + interval '${Number(offerDays)} days'`
  : 'NULL';
const esc = (s) => String(s).replace(/'/g, "''");

console.log(`\n${count} code${count === 1 ? '' : 's'} — ${plan}, ${days} days, ${uses} use${uses === 1 ? '' : 's'} each\n`);
for (const c of codes) console.log('  ' + c);

console.log('\n--- SQL: paste into the Supabase SQL editor ---\n');
console.log('INSERT INTO public.access_codes (code, plan, duration_days, max_redemptions, expires_at, note) VALUES');
console.log(
  [...codes]
    .map((c) => `  ('${c}', '${plan}', ${days}, ${uses}, ${expiresAt}, '${esc(note)}')`)
    .join(',\n') + ';',
);

console.log(`
--- Track them ---

  select c.code, c.plan, c.redemptions, c.max_redemptions, c.note,
         r.user_id, r.granted_until
  from public.access_codes c
  left join public.access_code_redemptions r on r.access_code_id = c.id
  order by c.created_at desc;

--- Turn one off ---

  update public.access_codes set is_active = false where code = 'EB-XXXX-XXXX';

Revoking a code does NOT revoke access already granted by it. To end a
redeemed grant early, clear the override on that profile:

  update public.profiles
  set plan_override = null, plan_override_expires_at = null
  where user_id = '<uuid>';
`);
