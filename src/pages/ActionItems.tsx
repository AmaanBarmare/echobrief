import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, User, AlertCircle } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

interface ActionItemData {
  task: string;
  owner?: string;
  due_date?: string;
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
    if (user) {
      fetchActionItems();
    }
  }, [user]);

  const fetchActionItems = async () => {
    try {
      const { data: meetings, error } = await supabase
        .from('meetings')
        .select(`
          id,
          title,
          start_time,
          meeting_insights (
            action_items
          )
        `)
        .eq('user_id', user?.id)
        .order('start_time', { ascending: false });

      if (error) throw error;

      const items: ActionItem[] = [];
      meetings?.forEach((meeting) => {
        const insights = meeting.meeting_insights?.[0];
        if (insights?.action_items && Array.isArray(insights.action_items)) {
          (insights.action_items as (string | ActionItemData)[]).forEach((item, index) => {
            // Handle both string and object formats
            const isObject = typeof item === 'object' && item !== null;
            const taskText = isObject ? (item as ActionItemData).task : item;
            const owner = isObject ? (item as ActionItemData).owner : undefined;
            const priority = isObject ? (item as ActionItemData).priority : undefined;
            
            items.push({
              id: `${meeting.id}-${index}`,
              task: taskText as string,
              owner,
              priority,
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
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const openItems = actionItems.filter((item) => !completedItems.has(item.id));
  const doneItems = actionItems.filter((item) => completedItems.has(item.id));

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'high': return 'bg-destructive/10 text-destructive border-destructive/20';
      case 'medium': return 'bg-warning/10 text-warning border-warning/20';
      case 'low': return 'bg-muted text-muted-foreground border-border';
      default: return '';
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-semibold text-foreground mb-1">Action Items</h1>
        <p className="text-muted-foreground mb-6">Tasks extracted from your meetings</p>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : actionItems.length === 0 ? (
          <div className="empty-state">
            <AlertCircle className="empty-state-icon" />
            <p className="empty-state-title">No action items yet</p>
            <p className="empty-state-description">
              Record a meeting to extract action items automatically
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Open Items */}
            {openItems.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-muted-foreground mb-3">
                  Open ({openItems.length})
                </h2>
                <div className="space-y-2">
                  {openItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 p-3 rounded-lg bg-card border border-border hover:border-accent/50 transition-colors"
                    >
                      <button
                        onClick={() => toggleComplete(item.id)}
                        className="w-5 h-5 rounded border-2 border-border hover:border-accent transition-colors flex-shrink-0 mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground font-medium">{item.task}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {item.owner && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <User className="w-3 h-3" />
                              {item.owner}
                            </span>
                          )}
                          {item.priority && (
                            <Badge variant="outline" className={cn('text-xs', getPriorityColor(item.priority))}>
                              {item.priority}
                            </Badge>
                          )}
                          <Link
                            to={`/meeting/${item.meetingId}`}
                            className="text-xs text-muted-foreground hover:text-accent transition-colors"
                          >
                            {item.meetingTitle} · {new Date(item.meetingDate).toLocaleDateString()}
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Done Items */}
            {doneItems.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-muted-foreground mb-3">
                  Done ({doneItems.length})
                </h2>
                <div className="space-y-2">
                  {doneItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 p-3 rounded-lg bg-card/50 border border-border opacity-60"
                    >
                      <button
                        onClick={() => toggleComplete(item.id)}
                        className="w-5 h-5 rounded bg-success border-success flex items-center justify-center flex-shrink-0 mt-0.5"
                      >
                        <Check className="w-3 h-3 text-success-foreground" />
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground line-through">{item.task}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {item.owner && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <User className="w-3 h-3" />
                              {item.owner}
                            </span>
                          )}
                          <Link
                            to={`/meeting/${item.meetingId}`}
                            className="text-xs text-muted-foreground hover:text-accent transition-colors"
                          >
                            {item.meetingTitle} · {new Date(item.meetingDate).toLocaleDateString()}
                          </Link>
                        </div>
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
