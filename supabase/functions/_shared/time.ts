/**
 * India Standard Time formatting for edge functions.
 *
 * Supabase edge functions run in UTC, and Intl formatting without an explicit
 * `timeZone` silently uses the runtime's zone. Every summary email therefore
 * printed UTC: a meeting the dashboard showed at 6:45 PM went out as 1:15 PM.
 *
 * The browser counterpart is src/lib/time.ts. Never format a user-facing date
 * in an edge function without going through here.
 */
export const APP_TIMEZONE = "Asia/Kolkata";

function toDate(value: string | number | Date): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** e.g. "Thursday, August 20, 2026" */
export function formatISTDate(
  value: string | number | Date,
  options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  },
): string {
  const d = toDate(value);
  if (!d) return "";
  return d.toLocaleDateString("en-US", { ...options, timeZone: APP_TIMEZONE });
}

/** e.g. "6:45 PM" */
export function formatISTTime(
  value: string | number | Date,
  options: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" },
): string {
  const d = toDate(value);
  if (!d) return "";
  return d.toLocaleTimeString("en-US", { ...options, timeZone: APP_TIMEZONE });
}
