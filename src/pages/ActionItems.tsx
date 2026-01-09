import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, User, CheckSquare } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';

interface ActionItemData {
  task: string;
  owner?: string;
  priority?: 'low' | 'medium' | 'high';
}

interface ActionItem {
  id: string;
  task: string;
  owner?: string;
  priority?: 'low' | 'medium' | 'high';
  completed: boolean;
  meetingId: string;
  meetingTitle: string;
  meetingDate: string;
}

export default function ActionItems() {
  const { user } = useAuth();
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [completedItems, setCompletedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (user) fetchActionItems();
  }, [user]);

  const fetchActionItems = async () => {
    try {
      const { data: meetings } = await supabase
        .from('meetings')
        .select(`id, title, start_time, meeting_insights (action_items)`)
        .eq('user_id', user?.id)
        .order('start_time', { ascending: false });

      const items: ActionItem[] = [];
      meetings?.forEach((meeting) => {
        const insights = meeting.meeting_insights?.[0];
        if (insights?.action_items && Array.isArray(insights.action_items)) {
          (insights.action_items as (string | ActionItemData)[]).forEach((item, index) => {
            const isObject = typeof item === 'object' && item !== null;
            items.push({
              id: `${meeting.id}-${index}`,
              task: isObject ? (item as ActionItemData).task : item as string,
              owner: isObject ? (item as ActionItemData).owner : undefined,
              priority: isObject ? (item as ActionItemData).priority : undefined,
              completed: false,
              meetingId: meeting.id,
              meetingTitle: meeting.title,
              meetingDate: meeting.start_time,
            });
          });
        }
      });
      setActionItems(items);
    } catch (error) {
      console.error('Error fetching action items:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleComplete = (id: string) => {
    setCompletedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  const openItems = actionItems.filter((item) => !completedItems.has(item.id));
  const doneItems = actionItems.filter((item) => completedItems.has(item.id));

  const getPriorityClass = (priority?: string) => {
    switch (priority) {
      case 'high': return 'tag bg-destructive/10 text-destructive';
      case 'medium': return 'tag bg-warning/10 text-warning';
      case 'low': return 'tag bg-muted text-muted-foreground';
      default: return '';
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-semibold text-foreground mb-1">Action Items</h1>
        <p className="text-sm text-muted-foreground mb-8">Tasks extracted from your meetings</p>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        ) : actionItems.length === 0 ? (
          <div className="empty-state">
            <CheckSquare className="empty-state-icon" />
            <p className="empty-state-title">No action items yet</p>
            <p className="empty-state-description">
              Record a meeting to extract action items automatically. They'll appear here for easy tracking.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {openItems.length > 0 && (
              <div>
                <h2 className="section-header mb-3">Open ({openItems.length})</h2>
                <div className="space-y-2">
                  {openItems.map((item) => (
                    <div key={item.id} className="flex items-start gap-3 p-4 rounded-lg bg-card border border-border/60 hover:border-border transition-colors">
                      <button
                        onClick={() => toggleComplete(item.id)}
                        className="w-5 h-5 rounded border-2 border-border hover:border-accent transition-colors flex-shrink-0 mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground">{item.task}</p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {item.owner && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <User className="w-3 h-3" />{item.owner}
                            </span>
                          )}
                          {item.priority && <span className={getPriorityClass(item.priority)}>{item.priority}</span>}
                          <Link to={`/meeting/${item.meetingId}`} className="text-xs text-muted-foreground hover:text-accent">
                            {item.meetingTitle} · {format(new Date(item.meetingDate), 'MMM d')}
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {doneItems.length > 0 && (
              <div>
                <h2 className="section-header mb-3">Done ({doneItems.length})</h2>
                <div className="space-y-2">
                  {doneItems.map((item) => (
                    <div key={item.id} className="flex items-start gap-3 p-4 rounded-lg bg-card/50 border border-border/40 opacity-60">
                      <button
                        onClick={() => toggleComplete(item.id)}
                        className="w-5 h-5 rounded bg-success border-success flex items-center justify-center flex-shrink-0 mt-0.5"
                      >
                        <Check className="w-3 h-3 text-success-foreground" />
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground line-through">{item.task}</p>
                        <Link to={`/meeting/${item.meetingId}`} className="text-xs text-muted-foreground hover:text-accent mt-1 inline-block">
                          {item.meetingTitle}
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
