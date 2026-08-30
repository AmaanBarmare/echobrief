/**
 * Resolve spoken relative dates ("Tuesday", "tomorrow", "next week") against
 * the meeting's own date in IST.
 *
 * The insights prompt is told to keep due_date "as spoken" — correct, because
 * the model inventing calendar dates is worse than none. But storing the
 * literal string "Tuesday" makes the action item useless a week later. This
 * resolves deterministically at processing time: said on Fri Aug 28,
 * "Tuesday" → 2026-09-01. Ambiguous phrases ("next week") resolve to a
 * range. Anything unrecognized resolves to null — never guess.
 *
 * Pure and synchronous. Unit-tested in tests/dates_test.ts.
 */
import { APP_TIMEZONE } from "./time.ts";

export interface ResolvedDate {
  /** ISO date (YYYY-MM-DD) when the phrase names a single day. */
  date?: string;
  /** Inclusive ISO date range for phrases like "next week". */
  range?: { start: string; end: string };
}

const WEEKDAYS = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6,
  august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8,
  oct: 9, nov: 10, dec: 11,
};

/** The meeting's calendar date in IST as a UTC-noon anchor (DST-proof math). */
function anchorDate(meetingStartISO: string): Date | null {
  const d = new Date(meetingStartISO);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d); // "2026-08-28"
  const [y, m, day] = parts.split("-").map(Number);
  if (!y || !m || !day) return null;
  return new Date(Date.UTC(y, m - 1, day, 12));
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

/**
 * Resolve a spoken due-date phrase. Returns null when the phrase cannot be
 * resolved with confidence — callers keep the raw string either way.
 */
export function resolveRelativeDate(
  raw: string | null | undefined,
  meetingStartISO: string | null | undefined,
): ResolvedDate | null {
  const phrase = String(raw ?? "").trim().toLowerCase()
    .replace(/^(by|on|before|until|due|this coming|coming)\s+/, "")
    .replace(/\s+(morning|afternoon|evening|night)$/, "")
    .trim();
  if (!phrase || !meetingStartISO) return null;
  const anchor = anchorDate(meetingStartISO);
  if (!anchor) return null;
  const anchorDow = anchor.getUTCDay();

  if (phrase === "today" || phrase === "end of day" || phrase === "eod") {
    return { date: iso(anchor) };
  }
  if (phrase === "tomorrow") return { date: iso(addDays(anchor, 1)) };
  if (phrase === "day after tomorrow") return { date: iso(addDays(anchor, 2)) };

  // "tuesday", "next tuesday" → next occurrence strictly after the meeting day.
  const weekdayMatch = phrase.match(/^(?:next\s+)?([a-z]+day)$/);
  if (weekdayMatch) {
    const target = WEEKDAYS.indexOf(weekdayMatch[1]);
    if (target >= 0) {
      let delta = (target - anchorDow + 7) % 7;
      if (delta === 0) delta = 7;
      // "next Tuesday" said on a Monday usually means the Tuesday of NEXT
      // week, but usage is genuinely ambiguous — we stay with the nearest
      // future occurrence, which matches "Tuesday same time" follow-ups.
      return { date: iso(addDays(anchor, delta)) };
    }
  }

  if (phrase === "end of week" || phrase === "eow" || phrase === "end of the week") {
    const friday = 5;
    let delta = (friday - anchorDow + 7) % 7;
    if (delta === 0) delta = 7;
    return { date: iso(addDays(anchor, delta)) };
  }

  if (phrase === "this week") {
    const daysToSunday = (7 - anchorDow) % 7;
    return { range: { start: iso(anchor), end: iso(addDays(anchor, daysToSunday)) } };
  }

  if (phrase === "next week") {
    // Monday through Sunday of the following week.
    const daysToNextMonday = ((1 - anchorDow + 7) % 7) || 7;
    const start = addDays(anchor, daysToNextMonday);
    return { range: { start: iso(start), end: iso(addDays(start, 6)) } };
  }

  if (phrase === "next month") {
    const start = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 1, 12));
    const end = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 2, 0, 12));
    return { range: { start: iso(start), end: iso(end) } };
  }

  const inDays = phrase.match(/^in\s+(\d{1,2})\s+days?$/);
  if (inDays) return { date: iso(addDays(anchor, Number(inDays[1]))) };
  const inWeeks = phrase.match(/^in\s+(a|\d{1,2})\s+weeks?$/);
  if (inWeeks) {
    const n = inWeeks[1] === "a" ? 1 : Number(inWeeks[1]);
    return { date: iso(addDays(anchor, n * 7)) };
  }

  // Explicit dates: "sep 3", "september 3rd", "3 september", "3rd of september"
  const monthFirst = phrase.match(/^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?$/);
  const dayFirst = phrase.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]+)\.?$/);
  const monthName = monthFirst?.[1] ?? dayFirst?.[2];
  const dayNum = Number(monthFirst?.[2] ?? dayFirst?.[1]);
  if (monthName && MONTHS[monthName] !== undefined && dayNum >= 1 && dayNum <= 31) {
    const month = MONTHS[monthName];
    let year = anchor.getUTCFullYear();
    let candidate = new Date(Date.UTC(year, month, dayNum, 12));
    // A spoken date is a future date; if it already passed this year, they
    // meant next year (said in Dec about January).
    if (candidate.getTime() < anchor.getTime()) {
      candidate = new Date(Date.UTC(year + 1, month, dayNum, 12));
    }
    if (candidate.getUTCDate() !== dayNum) return null; // e.g. "Feb 30"
    return { date: iso(candidate) };
  }

  return null;
}

/** "Tue, Sep 1, 2026" — display form for a resolved single date. */
export function formatResolvedDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
