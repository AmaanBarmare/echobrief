import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, CheckSquare, Clock, ArrowRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface SearchResult {
  id: string;
  type: 'meeting' | 'action_item' | 'transcript';
  title: string;
  subtitle: string;
  meetingId: string;
}

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
    }
  }, [open]);

  useEffect(() => {
    const searchData = async () => {
      if (!query.trim() || !user) {
        setResults([]);
        return;
      }

      setLoading(true);
      const searchResults: SearchResult[] = [];
      const searchTerm = `%${query.toLowerCase()}%`;

      try {
        // Search meetings
        const { data: meetings } = await supabase
          .from('meetings')
          .select('id, title, start_time')
          .eq('user_id', user.id)
          .ilike('title', searchTerm)
          .limit(5);

        if (meetings) {
          meetings.forEach((m) => {
            searchResults.push({
              id: `meeting-${m.id}`,
              type: 'meeting',
              title: m.title,
              subtitle: format(new Date(m.start_time), 'MMM d, yyyy'),
              meetingId: m.id,
            });
          });
        }

        // Search transcripts
        const { data: transcripts } = await supabase
          .from('transcripts')
          .select('id, content, meeting_id, meetings!inner(title, user_id)')
          .eq('meetings.user_id', user.id)
          .ilike('content', searchTerm)
          .limit(3);

        if (transcripts) {
          transcripts.forEach((t: any) => {
            // Find the matching text snippet
            const content = t.content.toLowerCase();
            const index = content.indexOf(query.toLowerCase());
            let snippet = '';
            if (index !== -1) {
              const start = Math.max(0, index - 30);
              const end = Math.min(content.length, index + query.length + 30);
              snippet = '...' + t.content.slice(start, end) + '...';
            }

            searchResults.push({
              id: `transcript-${t.id}`,
              type: 'transcript',
              title: t.meetings.title,
              subtitle: snippet || 'Transcript match',
              meetingId: t.meeting_id,
            });
          });
        }

        // Search action items
        const { data: insights } = await supabase
          .from('meeting_insights')
          .select('id, action_items, meeting_id, meetings!inner(title, user_id)')
          .eq('meetings.user_id', user.id)
          .limit(20);

        if (insights) {
          insights.forEach((insight: any) => {
            if (Array.isArray(insight.action_items)) {
              insight.action_items.forEach((item: any, idx: number) => {
                const taskText = typeof item === 'string' ? item : item.task;
                if (taskText?.toLowerCase().includes(query.toLowerCase())) {
                  searchResults.push({
                    id: `action-${insight.id}-${idx}`,
                    type: 'action_item',
                    title: taskText,
                    subtitle: `From: ${insight.meetings.title}`,
                    meetingId: insight.meeting_id,
                  });
                }
              });
            }
          });
        }

        setResults(searchResults.slice(0, 10));
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(searchData, 200);
    return () => clearTimeout(debounce);
  }, [query, user]);

  const handleSelect = (result: SearchResult) => {
    onOpenChange(false);
    navigate(`/meeting/${result.meetingId}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      handleSelect(results[selectedIndex]);
    }
  };

  const getIcon = (type: SearchResult['type']) => {
    switch (type) {
      case 'meeting':
        return Clock;
      case 'transcript':
        return FileText;
      case 'action_item':
        return CheckSquare;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 max-w-lg overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center border-b border-border px-4">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search meetings, transcripts, action items..."
            className="border-0 focus-visible:ring-0 h-12 px-3"
            autoFocus
          />
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {query && results.length === 0 && !loading && (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground">No results found</p>
              <p className="text-xs text-muted-foreground mt-1">
                Try searching for meeting titles or keywords
              </p>
            </div>
          )}

          {results.length > 0 && (
            <div className="p-2">
              {results.map((result, index) => {
                const Icon = getIcon(result.type);
                return (
                  <button
                    key={result.id}
                    onClick={() => handleSelect(result)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors',
                      index === selectedIndex
                        ? 'bg-accent/10 text-foreground'
                        : 'text-muted-foreground hover:bg-secondary'
                    )}
                  >
                    <div className={cn(
                      'w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0',
                      result.type === 'meeting' && 'bg-accent/10 text-accent',
                      result.type === 'transcript' && 'bg-success/10 text-success',
                      result.type === 'action_item' && 'bg-warning/10 text-warning'
                    )}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {result.title}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {result.subtitle}
                      </p>
                    </div>
                    <ArrowRight className={cn(
                      'w-4 h-4 flex-shrink-0 transition-opacity',
                      index === selectedIndex ? 'opacity-100' : 'opacity-0'
                    )} />
                  </button>
                );
              })}
            </div>
          )}

          {!query && (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground">
                Search across your meetings
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Find summaries, transcripts, and action items
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-4 py-2 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <kbd className="kbd">↑↓</kbd> Navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="kbd">↵</kbd> Open
          </span>
          <span className="flex items-center gap-1">
            <kbd className="kbd">Esc</kbd> Close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
