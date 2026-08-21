import { formatInTimeZone } from 'date-fns-tz';

/**
 * EchoBrief renders every date and time in India Standard Time, regardless of
 * where the viewer or the server sits.
 *
 * Without this, the browser formatted in the viewer's local zone while Supabase
 * edge functions formatted in UTC — so a meeting at 6:45 PM IST appeared as
 * 6:45 PM on the dashboard and 1:15 PM in the summary email for the same row.
 * Two clocks for one meeting.
 *
 * The edge-function counterpart is supabase/functions/_shared/time.ts.
 */
export const APP_TIMEZONE = 'Asia/Kolkata';

/** date-fns `format`, pinned to IST. Same pattern strings. */
export function formatIST(date: Date | string | number, pattern: string): string {
  const value = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) return '';
  return formatInTimeZone(value, APP_TIMEZONE, pattern);
}
