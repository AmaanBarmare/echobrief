/**
 * Workspace vocabulary + conservative entity-spelling correction.
 *
 * ASR mangles proper nouns ("Oltaflock AI" → "AltaFlock AI") and the error
 * propagates into every summary and email. Most ASR APIs take a boost list;
 * Sarvam's batch API does not, so we correct after the fact: build a
 * vocabulary from the calendar (attendee names, email local parts,
 * domain-derived company names) plus the user's own custom_vocabulary list,
 * then fix near-miss spellings in text. Correction only — never rewrites
 * content, and every change is returned so callers can log it.
 *
 * Pure and synchronous. Unit-tested in tests/vocab_test.ts.
 */

export interface VocabAttendee {
  email?: string;
  displayName?: string;
}

function cap(word: string): string {
  return word ? word[0].toUpperCase() + word.slice(1) : word;
}

/**
 * Canonical spellings worth protecting. Multi-word names are kept whole
 * ("Mathew Ryan") and also split into words so single-token near-misses
 * still correct.
 */
export function buildVocabulary(
  attendees: VocabAttendee[] | null | undefined,
  customVocabulary: string[] | null | undefined = [],
): string[] {
  const terms = new Set<string>();
  const add = (t: unknown) => {
    const s = String(t ?? "").trim();
    if (s.length >= 4) terms.add(s);
  };

  for (const a of Array.isArray(attendees) ? attendees : []) {
    add(a.displayName);
    for (const w of String(a.displayName ?? "").split(/\s+/)) add(w);
    const [local, domain] = String(a.email ?? "").toLowerCase().split("@");
    if (local) {
      // "mathew.ryan" → Mathew, Ryan
      for (const part of local.split(/[._\-+]/)) add(cap(part));
    }
    if (domain) {
      // "ryanandcotravel.com.au" → Ryanandcotravel (weak but still catches
      // gross misspellings); "oltaflock.ai" → Oltaflock.
      const root = domain.split(".")[0];
      if (root && !GENERIC_DOMAINS.has(root)) add(cap(root));
    }
  }

  for (const t of Array.isArray(customVocabulary) ? customVocabulary : []) add(t);
  return [...terms];
}

const GENERIC_DOMAINS = new Set([
  "gmail", "googlemail", "yahoo", "outlook", "hotmail", "live", "icloud",
  "proton", "protonmail", "aol", "mail", "email", "me",
]);

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n];
}

export interface EntityCorrection {
  from: string;
  to: string;
}

interface WordToken {
  word: string;
  start: number; // char offset in the source text
  end: number;
}

function tokenize(text: string): WordToken[] {
  const tokens: WordToken[] = [];
  const re = /[A-Za-z][A-Za-z0-9'&-]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    tokens.push({ word: m[0], start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

/** Max edit distance we accept for a term of this length. Deliberately tight. */
function maxDistance(termLength: number): number {
  if (termLength < 5) return 0; // short terms must match exactly (case aside)
  if (termLength < 9) return 1;
  return 2;
}

/**
 * Fix near-miss spellings of vocabulary terms in `text`.
 *
 * Window-matches word n-grams of the same word count as each term, accepting
 * a replacement only within a tight edit-distance budget — "AltaFlock" →
 * "Oltaflock" (distance 1 at length 9) corrects; unrelated words never come
 * close. An exact case-insensitive match is left alone unless the casing
 * differs from canonical AND the term contains an uppercase letter beyond
 * position 0 (i.e. a stylized name like "OltaFlock" stays enforced only via
 * custom_vocabulary). Deliberately conservative: when two vocab terms both
 * claim a window, the closer one wins; ties change nothing.
 */
export function correctEntities(
  text: string,
  vocabulary: string[],
): { text: string; corrections: EntityCorrection[] } {
  const source = String(text ?? "");
  if (!source || !Array.isArray(vocabulary) || vocabulary.length === 0) {
    return { text: source, corrections: [] };
  }

  const tokens = tokenize(source);
  const terms = vocabulary
    .map((t) => ({ term: t, words: t.split(/\s+/).filter(Boolean) }))
    .filter((t) => t.words.length >= 1 && t.term.length >= 4);

  // Best replacement per starting token index: [endTokenExclusive, term, distance]
  const picks = new Map<number, { end: number; term: string; distance: number }>();

  for (const { term, words } of terms) {
    const flat = words.join(" ");
    const budget = maxDistance(flat.length);
    for (let i = 0; i + words.length <= tokens.length; i++) {
      const window = tokens.slice(i, i + words.length);
      const candidate = window.map((t) => t.word).join(" ");
      if (candidate.toLowerCase() === flat.toLowerCase()) continue; // already right
      if (Math.abs(candidate.length - flat.length) > budget) continue;
      const distance = levenshtein(candidate.toLowerCase(), flat.toLowerCase());
      if (distance === 0 || distance > budget) continue;
      const existing = picks.get(i);
      if (!existing || distance < existing.distance) {
        picks.set(i, { end: i + words.length, term, distance });
      } else if (existing && distance === existing.distance && existing.term !== term) {
        // Ambiguous — safer to leave the text alone.
        picks.delete(i);
      }
    }
  }

  if (picks.size === 0) return { text: source, corrections: [] };

  // Apply non-overlapping picks left to right.
  const corrections: EntityCorrection[] = [];
  let out = "";
  let cursor = 0;
  let tokenIdx = 0;
  while (tokenIdx < tokens.length) {
    const pick = picks.get(tokenIdx);
    if (!pick) {
      tokenIdx++;
      continue;
    }
    const startTok = tokens[tokenIdx];
    const endTok = tokens[pick.end - 1];
    out += source.slice(cursor, startTok.start) + pick.term;
    corrections.push({ from: source.slice(startTok.start, endTok.end), to: pick.term });
    cursor = endTok.end;
    tokenIdx = pick.end;
  }
  out += source.slice(cursor);
  return { text: out, corrections };
}
