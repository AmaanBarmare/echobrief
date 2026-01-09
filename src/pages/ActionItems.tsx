import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface ActionItem {
  id: string;
  text: string;
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
          (insights.action_items as string[]).forEach((item, index) => {
            items.push({
              id: `${meeting.id}-${index}`,
              text: item,
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

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-semibold text-foreground mb-1">Action Items</h1>
        <p className="text-muted-foreground mb-6">Tasks extracted from your meetings</p>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-muted/50 rounded animate-pulse" />
            ))}
          </div>
        ) : actionItems.length === 0 ? (
          <div className="empty-state">
            <p className="text-muted-foreground">No action items yet</p>
            <p className="text-sm text-muted-foreground/70">
              Record a meeting to extract action items automatically
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Open Items */}
            {openItems.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-muted-foreground mb-3">
                  Open ({openItems.length})
                </h2>
                <div className="space-y-1">
                  {openItems.map((item) => (
                    <div
                      key={item.id}
                      className="action-item group"
                    >
                      <button
                        onClick={() => toggleComplete(item.id)}
                        className="action-item-checkbox"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground">{item.text}</p>
                        <Link
                          to={`/meeting/${item.meetingId}`}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {item.meetingTitle} • {new Date(item.meetingDate).toLocaleDateString()}
                        </Link>
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
                <div className="space-y-1">
                  {doneItems.map((item) => (
                    <div
                      key={item.id}
                      className="action-item group opacity-60"
                    >
                      <button
                        onClick={() => toggleComplete(item.id)}
                        className={cn(
                          "action-item-checkbox bg-accent border-accent"
                        )}
                      >
                        <Check className="w-3 h-3 text-accent-foreground" />
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground line-through">{item.text}</p>
                        <Link
                          to={`/meeting/${item.meetingId}`}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {item.meetingTitle} • {new Date(item.meetingDate).toLocaleDateString()}
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
