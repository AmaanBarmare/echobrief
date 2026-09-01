import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CalendarDays, CheckCircle2, Clock, GitBranch, Loader2 } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { formatIST } from '@/lib/time';

/**
 * A shared meeting, read by somebody who may have no account.
 *
 * Deliberately not wrapped in DashboardLayout: this page is a public surface
 * and the most common way a stranger meets the product, so it carries the brand
 * and a way in, not the app chrome. It renders exactly what
 * `get-shared-meeting` returns — the meeting-zone summary, decisions and action
 * items — and has no code path that could request a transcript.
 */

interface ActionItem {
  task?: string;
  title?: string;
  owner?: string;
  assignee?: string;
  due_date?: string;
  due?: string;
}

interface Decision {
  decision?: string;
  text?: string;
  context?: string;
}

interface SharedPayload {
  meeting: {
    title: string;
    start_time: string | null;
    duration_seconds: number | null;
    languages: Record<string, number> | null;
  };
  insights: {
    summary_short: string | null;
    summary_detailed: string | null;
    key_points: string[];
    action_items: ActionItem[];
    decisions: Decision[];
  };
}

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-shared-meeting`;

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export default function SharedMeeting() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${FUNCTIONS_URL}?token=${encodeURIComponent(token ?? '')}`, {
          headers: {
            // The anon key is a public value; the share token is what actually
            // authorises this read.
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        });
        const body = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setError(body?.error || 'This link is not valid.');
        } else {
          setData(body);
        }
      } catch {
        if (!cancelled) setError('Could not load this meeting. Check your connection and try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const durationMinutes = data?.meeting.duration_seconds
    ? Math.round(data.meeting.duration_seconds / 60)
    : null;

  return (
    <div className="min-h-screen" style={{ background: 'var(--paper)' }}>
      <header
        className="sticky top-0 z-10 backdrop-blur"
        style={{ borderBottom: '1px solid var(--rule)', background: 'color-mix(in oklch, var(--paper) 85%, transparent)' }}
      >
        <div className="mx-auto flex max-w-[820px] items-center justify-between gap-4 px-6 py-3">
          <Logo size="sm" linkTo="/" />
          <Link
            to="/"
            className="text-[13px] font-medium no-underline"
            style={{ color: 'var(--ember)' }}
          >
            What is EchoBrief?
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[820px] px-6 py-12">
        {loading ? (
          <div className="flex items-center gap-2 text-[14px]" style={{ color: 'var(--ink-mid)' }}>
            <Loader2 className="h-4 w-4 animate-spin" /> Loading meeting…
          </div>
        ) : error ? (
          <div
            className="rounded-2xl p-8 text-center"
            style={{ border: '1px solid var(--rule)', background: 'var(--paper-card)' }}
          >
            <h1 className="mb-2 text-[20px] font-semibold" style={{ color: 'var(--ink)' }}>
              This link is not available
            </h1>
            <p className="mb-6 text-[14px]" style={{ color: 'var(--ink-mid)' }}>{error}</p>
            <Link
              to="/"
              className="inline-block rounded-full px-5 py-2.5 text-[14px] font-semibold text-white no-underline"
              style={{ background: 'var(--ember)' }}
            >
              See what EchoBrief does
            </Link>
          </div>
        ) : data ? (
          <article>
            <p
              className="mb-3 text-[11.5px] font-semibold uppercase"
              style={{ color: 'var(--ember)', letterSpacing: '0.14em' }}
            >
              Shared meeting summary
            </p>
            <h1
              className="mb-4 text-[clamp(1.8rem,4vw,2.6rem)] leading-[1.1]"
              style={{ color: 'var(--ink)', fontFamily: 'var(--font-brand-serif)', fontWeight: 400 }}
            >
              {data.meeting.title}
            </h1>

            <div className="mb-10 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]" style={{ color: 'var(--ink-soft)' }}>
              {data.meeting.start_time && (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-[14px] w-[14px]" />
                  {formatIST(new Date(data.meeting.start_time), 'd MMM yyyy')}
                </span>
              )}
              {durationMinutes !== null && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-[14px] w-[14px]" />
                  {durationMinutes} min
                </span>
              )}
            </div>

            {(data.insights.summary_detailed || data.insights.summary_short) && (
              <section className="mb-10">
                <h2 className="mb-3 text-[15px] font-semibold" style={{ color: 'var(--ink)' }}>Summary</h2>
                <p className="whitespace-pre-line text-[15px] leading-[1.7]" style={{ color: 'var(--ink-mid)' }}>
                  {data.insights.summary_detailed || data.insights.summary_short}
                </p>
              </section>
            )}

            {data.insights.decisions?.length > 0 && (
              <section className="mb-10">
                <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold" style={{ color: 'var(--ink)' }}>
                  <GitBranch className="h-[15px] w-[15px]" style={{ color: 'var(--ember)' }} />
                  Decisions
                </h2>
                <ul className="space-y-3 p-0" style={{ listStyle: 'none' }}>
                  {data.insights.decisions.map((decision, i) => (
                    <li
                      key={i}
                      className="rounded-xl p-4 text-[14px] leading-[1.6]"
                      style={{ border: '1px solid var(--rule)', background: 'var(--paper-card)', color: 'var(--ink)' }}
                    >
                      {asText(decision.decision) || asText(decision.text)}
                      {decision.context && (
                        <span className="mt-1.5 block text-[13px]" style={{ color: 'var(--ink-soft)' }}>
                          {decision.context}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {data.insights.action_items?.length > 0 && (
              <section className="mb-10">
                <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold" style={{ color: 'var(--ink)' }}>
                  <CheckCircle2 className="h-[15px] w-[15px]" style={{ color: 'var(--ember)' }} />
                  Action items
                </h2>
                <ul className="space-y-3 p-0" style={{ listStyle: 'none' }}>
                  {data.insights.action_items.map((item, i) => {
                    const owner = asText(item.owner) || asText(item.assignee);
                    const due = asText(item.due_date) || asText(item.due);
                    return (
                      <li
                        key={i}
                        className="rounded-xl p-4"
                        style={{ border: '1px solid var(--rule)', background: 'var(--paper-card)' }}
                      >
                        <p className="m-0 text-[14px] leading-[1.6]" style={{ color: 'var(--ink)' }}>
                          {asText(item.task) || asText(item.title)}
                        </p>
                        {(owner || due) && (
                          <p className="m-0 mt-1.5 text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
                            {owner}
                            {owner && due ? ' · ' : ''}
                            {due}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            <footer
              className="mt-14 rounded-2xl p-6 text-center"
              style={{ border: '1px solid var(--rule)', background: 'var(--paper-raised)' }}
            >
              <p className="mb-1 text-[15px] font-semibold" style={{ color: 'var(--ink)' }}>
                This summary was written by EchoBrief
              </p>
              <p className="mb-5 text-[13.5px]" style={{ color: 'var(--ink-mid)' }}>
                Meeting notes for teams who work in Hindi, English and everything in between —
                with a quote and a timestamp behind every claim.
              </p>
              <Link
                to="/"
                className="inline-block rounded-full px-5 py-2.5 text-[14px] font-semibold text-white no-underline"
                style={{ background: 'var(--ember)' }}
              >
                Try EchoBrief
              </Link>
            </footer>
          </article>
        ) : null}
      </main>
    </div>
  );
}
