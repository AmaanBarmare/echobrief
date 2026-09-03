import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Loader2, MessageSquare } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
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

export default function Chat() {
  const navigate = useNavigate();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, loading]);

  const ask = async () => {
    const question = input.trim();
    if (!question || loading) return;
    setInput('');
    setError(null);
    setTurns((t) => [...t, { role: 'user', content: question }]);
    setLoading(true);

    try {
      const history = turns.map((t) => ({ role: t.role, content: t.content }));
      const { data, error: fnError } = await supabase.functions.invoke('chat-transcripts', {
        body: { question, history },
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
      <div className="flex flex-col h-[calc(100dvh-8rem)] max-w-3xl mx-auto">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold">Ask your meetings</h1>
          <p className="text-sm text-muted-foreground">
            Questions are answered from your own meeting transcripts, with citations.
          </p>
        </div>

        {/* Turns sit at the BOTTOM of the scroll area (mt-auto), so a short
            conversation reads next to the composer instead of stranding it
            below a tall empty band. */}
        <div className="flex-1 overflow-y-auto pr-1 flex flex-col">
          {turns.length === 0 && !loading && (
            <div className="m-auto text-center text-muted-foreground">
              <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Try: “What did we decide about pricing?”</p>
            </div>
          )}

          <div className="mt-auto space-y-4">
            {turns.map((t, i) => (
              <div
                key={i}
                className={cn(
                  'rounded-lg px-4 py-3 text-sm',
                  t.role === 'user'
                    ? 'bg-primary/10 ml-auto max-w-[80%]'
                    : 'bg-muted mr-auto max-w-[90%]',
                )}
              >
                <p className="whitespace-pre-wrap">{t.content}</p>

                {t.truncated && (
                  <p className="mt-2 text-xs text-warning">
                    Only your most recent meetings fit in context — older ones were not searched.
                  </p>
                )}

                {t.citations && t.citations.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {t.citations.map((c) => (
                      <button
                        key={c.meeting_id}
                        onClick={() => navigate(`/meeting/${c.meeting_id}`)}
                        className="text-xs px-2 py-1 rounded-md border border-border hover:bg-background transition-colors"
                      >
                        {c.title} · {c.date}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Searching your meetings…
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
            <div ref={endRef} />
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask();
          }}
          className="flex gap-2 pt-4"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your meetings…"
            disabled={loading}
          />
          <Button type="submit" disabled={loading || !input.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </DashboardLayout>
  );
}
