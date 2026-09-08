/**
 * Ask — Console (UI v2), from mockup 08-ask.
 *
 * One question, the answer, and the meetings it came from. The data layer is
 * Chat.tsx's: `chat-transcripts` takes the question plus the turns so far and
 * returns { answer, citations, truncated }, where a citation is
 * { meeting_id, title, date } and is filtered server-side to meetings that were
 * actually in context, so a cited meeting always exists.
 *
 * Two things in the mockup are missing on purpose. The "Recent conversations"
 * rail has no table behind it — nothing persists a conversation today, so the
 * rail would list nothing and lose everything on reload. And the numbered
 * footnotes with a timestamp and a quote per source need the answer to carry
 * per-claim spans; the function returns a meeting, not a moment. Both are
 * backend work, not a render.
 */

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUp, Loader2, MessageSquare, Sparkles } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { formatIST } from '@/lib/time';
import { Card, PageHeader } from '@/ui';
import { cn } from '@/lib/utils';

interface Citation {
  meeting_id: string;
  title: string;
  date: string;
}

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  truncated?: boolean;
}

const EXAMPLES = [
  'What did we commit to this week?',
  'What objections came up about pricing?',
  'Which deals are waiting on me?',
];

/** The citation's date is already an IST calendar date from the function. */
function citationDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? date : formatIST(d, 'MMM d');
}

export default function ChatV2() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, loading]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || loading) return;
    setInput('');
    setError(null);
    setTurns((t) => [...t, { role: 'user', content: q }]);
    setLoading(true);
    try {
      const history = turns.map((t) => ({ role: t.role, content: t.content }));
      const { data, error: fnError } = await supabase.functions.invoke('chat-transcripts', {
        body: { question: q, history },
      });
      if (fnError) throw fnError;
      setTurns((t) => [
        ...t,
        {
          role: 'assistant',
          content: data.answer,
          citations: data.citations || [],
          truncated: !!data.truncated,
        },
      ]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="mx-auto flex h-[calc(100dvh-8rem)] max-w-[820px] flex-col">
        <PageHeader
          title="Ask"
          subtitle="Answers come only from your own transcripts, with the meetings they came from."
          actions={
            turns.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setTurns([]);
                  setError(null);
                }}
                className="font-dmsans text-[12.5px] font-medium text-eb-accent"
              >
                New conversation
              </button>
            ) : undefined
          }
        />

        <div className="min-h-0 flex-1 overflow-y-auto pb-4">
          {turns.length === 0 && !loading ? (
            <Card className="text-center">
              <Sparkles size={26} strokeWidth={1.5} className="mx-auto mb-2.5 text-eb-muted" />
              <p className="font-dmsans text-sm font-medium text-eb-text">Ask across every meeting</p>
              <p className="mt-1 font-dmsans text-[13px] text-eb-secondary">
                The answer is written from your transcripts only, and names the meetings it used.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {EXAMPLES.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => ask(e)}
                    className="rounded-pill border border-eb-border bg-eb-card px-3 py-1.5 font-dmsans text-[12.5px] text-eb-text hover:bg-eb-row-hover"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </Card>
          ) : (
            <div className="flex flex-col gap-5">
              {turns.map((t, i) =>
                t.role === 'user' ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[80%] rounded-card bg-eb-sidebar px-4 py-2.5 font-dmsans text-[13.5px] leading-relaxed text-white">
                      {t.content}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="flex gap-3">
                    <span className="mt-1 flex h-6 w-6 flex-none items-center justify-center rounded-pill bg-eb-accent-soft text-eb-accent">
                      <Sparkles size={13} strokeWidth={1.75} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="m-0 whitespace-pre-wrap font-dmsans text-[14px] leading-relaxed text-eb-prose">
                        {t.content}
                      </p>

                      {t.citations && t.citations.length > 0 && (
                        <div className="mt-3 flex flex-col gap-2">
                          {t.citations.map((c, n) => (
                            <Link
                              key={`${c.meeting_id}-${n}`}
                              to={`/meeting/${c.meeting_id}`}
                              className="flex items-center gap-3 rounded-card border border-eb-border bg-eb-card px-3.5 py-2.5 no-underline hover:bg-eb-row-hover"
                            >
                              <span className="flex-none font-mono text-[11px] text-eb-accent">{n + 1}</span>
                              <span className="min-w-0 flex-1 truncate font-dmsans text-[13px] font-medium text-eb-text">
                                {c.title || 'Untitled meeting'}
                              </span>
                              <span className="flex-none font-dmsans text-[12px] text-eb-muted">
                                {citationDate(c.date)}
                              </span>
                            </Link>
                          ))}
                        </div>
                      )}

                      {t.truncated && (
                        <p className="mt-2 font-dmsans text-[12px] text-eb-muted">
                          Not every meeting fitted in context — ask something narrower for a fuller answer.
                        </p>
                      )}
                    </div>
                  </div>
                ),
              )}

              {loading && (
                <div className="flex items-center gap-2 font-dmsans text-[13px] text-eb-secondary">
                  <Loader2 size={14} className="animate-spin" />
                  Reading your transcripts…
                </div>
              )}

              {error && (
                <p className="font-dmsans text-[13px] text-eb-red">{error}</p>
              )}
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(input);
          }}
          className="flex items-center gap-2 rounded-pill border border-eb-border bg-eb-card px-4 py-2 shadow-eb-card"
        >
          <MessageSquare size={15} strokeWidth={1.75} className="flex-none text-eb-muted" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={turns.length ? 'Ask a follow-up…' : 'Ask anything about your meetings…'}
            className="min-w-0 flex-1 border-0 bg-transparent p-0 font-dmsans text-[13.5px] text-eb-text outline-none placeholder:text-eb-muted"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            aria-label="Send"
            className={cn(
              'flex h-8 w-8 flex-none items-center justify-center rounded-pill text-white transition-colors',
              !input.trim() || loading
                ? 'bg-eb-chip text-eb-muted'
                : 'bg-gradient-to-b from-eb-accent-top to-eb-accent shadow-eb-primary',
            )}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <ArrowUp size={15} strokeWidth={2} />}
          </button>
        </form>
        <p className="mt-2 text-center font-dmsans text-[12px] text-eb-muted">
          Answers come only from your own transcripts, with citations.
        </p>
      </div>
    </DashboardLayout>
  );
}
