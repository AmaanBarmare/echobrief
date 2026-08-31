import { useEffect, useState, useMemo } from 'react';
import { formatIST } from '@/lib/time';
import { Link } from 'react-router-dom';
import { Check, User, ChevronDown, ChevronRight, ExternalLink, Pencil, CheckSquare, Calendar, Video, Filter } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';


interface DueDateRange {
  start?: string;
  end?: string;
}

interface ActionItemData {
  task: string;
  owner?: string;
  priority?: 'low' | 'medium' | 'high';
  /** Raw spoken due date, e.g. "Tuesday" */
  due_date?: string;
  /** ISO "YYYY-MM-DD" when the pipeline could resolve the spoken date */
  due_date_resolved?: string;
  /** ISO date range when only a window (e.g. "next week") was resolvable */
  due_date_range?: DueDateRange;
}

interface ActionItem {
  id: string;
  index: number;
  task: string;
  owner?: string;
  priority?: 'low' | 'medium' | 'high';
  due_date?: string;
  due_date_resolved?: string;
  due_date_range?: DueDateRange;
  completed: boolean;
}

interface MeetingGroup {
  id: string;
  insightsId: string;
  title: string;
  date: string;
  source: string;
  actionItems: ActionItem[];
}

type FilterStatus = 'all' | 'open' | 'completed';
type SortOption = 'date' | 'priority' | 'due';

const priorityOrder = { high: 0, medium: 1, low: 2, undefined: 3 };

/** Human label for an item's due info, or null when it carries none. */
function dueChipLabel(item: ActionItem): string | null {
  if (item.due_date_resolved) {
    const d = new Date(item.due_date_resolved);
    if (!Number.isNaN(d.getTime())) return `Due ${formatIST(d, 'EEE, MMM d')}`;
  }
  if (item.due_date_range?.start) {
    const d = new Date(item.due_date_range.start);
    if (!Number.isNaN(d.getTime())) return `Due week of ${formatIST(d, 'MMM d')}`;
  }
  if (item.due_date) return `Due ${item.due_date}`;
  return null;
}

/** Overdue = resolved due date strictly before today (IST) on an open item. */
function isOverdue(item: ActionItem, completed: boolean): boolean {
  if (completed || !item.due_date_resolved) return false;
  return item.due_date_resolved < formatIST(new Date(), 'yyyy-MM-dd');
}

export default function ActionItems() {
  const { user } = useAuth();
  const [meetingGroups, setMeetingGroups] = useState<MeetingGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [completedItems, setCompletedItems] = useState<Set<string>>(new Set());
  const [expandedMeetings, setExpandedMeetings] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [meetingFilter, setMeetingFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('date');

  useEffect(() => {
    if (user) fetchActionItems();
  }, [user]);

  // Auto-expand all meetings on first load
  useEffect(() => {
    if (meetingGroups.length > 0 && expandedMeetings.size === 0) {
      setExpandedMeetings(new Set(meetingGroups.map(g => g.id)));
    }
  }, [meetingGroups]);

  const fetchActionItems = async () => {
    try {
      const { data: meetings } = await supabase
        .from('meetings')
        .select(`id, title, start_time, source, meeting_insights (id, action_items)`)
        .eq('user_id', user?.id)
        .order('start_time', { ascending: false });

      // Completion state lives in action_item_completions, keyed by
      // (user_id, meeting_id, action_item_index) — the same composite the
      // local `${meeting.id}-${index}` item id encodes.
      const { data: completions } = await supabase
        .from('action_item_completions')
        .select('meeting_id, action_item_index, completed')
        .eq('user_id', user?.id);

      setCompletedItems(
        new Set(
          (completions || [])
            .filter((c) => c.completed)
            .map((c) => `${c.meeting_id}-${c.action_item_index}`)
        )
      );

      const groups: MeetingGroup[] = [];
      
      meetings?.forEach((meeting) => {
        const insights = meeting.meeting_insights?.[0];
        if (insights?.action_items && Array.isArray(insights.action_items)) {
          const items: ActionItem[] = [];
          
          (insights.action_items as (string | ActionItemData)[]).forEach((item, index) => {
            const isObject = typeof item === 'object' && item !== null;
            const data = isObject ? (item as ActionItemData) : undefined;
            items.push({
              id: `${meeting.id}-${index}`,
              index,
              task: data ? data.task : item as string,
              owner: data?.owner,
              priority: data?.priority,
              due_date: data?.due_date,
              due_date_resolved: data?.due_date_resolved,
              due_date_range: data?.due_date_range,
              completed: false,
            });
          });
          
          if (items.length > 0) {
            groups.push({
              id: meeting.id,
              insightsId: insights.id,
              title: meeting.title,
              date: meeting.start_time,
              source: meeting.source || 'manual',
              actionItems: items,
            });
          }
        }
      });
      
      setMeetingGroups(groups);
    } catch (error) {
      console.error('Error fetching action items:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleComplete = async (itemId: string, meetingId: string, index: number) => {
    if (!user) return;

    const wasCompleted = completedItems.has(itemId);
    const nextCompleted = !wasCompleted;

    // Optimistic update, rolled back if the write fails.
    setCompletedItems((prev) => {
      const newSet = new Set(prev);
      if (nextCompleted) newSet.add(itemId);
      else newSet.delete(itemId);
      return newSet;
    });

    const { error } = await supabase.from('action_item_completions').upsert(
      {
        user_id: user.id,
        meeting_id: meetingId,
        action_item_index: index,
        completed: nextCompleted,
        completed_at: nextCompleted ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,meeting_id,action_item_index' }
    );

    if (error) {
      console.error('[ActionItems] completion save failed:', error);
      setCompletedItems((prev) => {
        const newSet = new Set(prev);
        if (nextCompleted) newSet.delete(itemId);
        else newSet.add(itemId);
        return newSet;
      });
      toast.error('Could not save — please try again');
      return;
    }

    if (nextCompleted) toast.success('Task marked complete');
  };

  const toggleMeetingExpanded = (meetingId: string) => {
    setExpandedMeetings((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(meetingId)) newSet.delete(meetingId);
      else newSet.add(meetingId);
      return newSet;
    });
  };

  const startEditing = (item: ActionItem) => {
    setEditingId(item.id);
    setEditText(item.task);
  };

  const saveEdit = async () => {
    if (!editingId) return;

    const group = meetingGroups.find((g) =>
      g.actionItems.some((item) => item.id === editingId)
    );
    const item = group?.actionItems.find((i) => i.id === editingId);
    if (!group || !item) return;

    const newTask = editText.trim();
    if (!newTask) {
      toast.error('Task cannot be empty');
      return;
    }

    const previousTask = item.task;
    setMeetingGroups(prev => prev.map(g => ({
      ...g,
      actionItems: g.actionItems.map(i =>
        i.id === editingId ? { ...i, task: newTask } : i
      )
    })));
    setEditingId(null);
    setEditText('');

    // Action items live as a JSONB array on meeting_insights. Read-modify-write
    // the single element, preserving whether it was stored as a bare string or
    // an object with owner/priority metadata.
    const { data: insightsRow, error: readError } = await supabase
      .from('meeting_insights')
      .select('action_items')
      .eq('id', group.insightsId)
      .single();

    if (readError || !insightsRow || !Array.isArray(insightsRow.action_items)) {
      console.error('[ActionItems] could not read action items for edit:', readError);
      revertEdit(editingId, previousTask);
      return;
    }

    const updated = [...(insightsRow.action_items as (string | ActionItemData)[])];
    const existing = updated[item.index];
    updated[item.index] =
      typeof existing === 'object' && existing !== null
        ? { ...(existing as ActionItemData), task: newTask }
        : newTask;

    const { error: writeError } = await supabase
      .from('meeting_insights')
      .update({ action_items: updated as unknown as Json })
      .eq('id', group.insightsId);

    if (writeError) {
      console.error('[ActionItems] task update failed:', writeError);
      revertEdit(editingId, previousTask);
      return;
    }

    toast.success('Task updated');
  };

  const revertEdit = (itemId: string, previousTask: string) => {
    setMeetingGroups(prev => prev.map(g => ({
      ...g,
      actionItems: g.actionItems.map(i =>
        i.id === itemId ? { ...i, task: previousTask } : i
      )
    })));
    toast.error('Could not save the change — reverted');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'google_calendar':
        return <Calendar className="w-3.5 h-3.5" />;
      case 'zoom':
        return <Video className="w-3.5 h-3.5" />;
      default:
        return null;
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'google_calendar':
        return 'Google Meet';
      case 'zoom':
        return 'Zoom';
      default:
        return 'Manual';
    }
  };

  // Filter and sort logic
  const filteredGroups = useMemo(() => {
    let groups = [...meetingGroups];
    
    // Filter by meeting
    if (meetingFilter !== 'all') {
      groups = groups.filter(g => g.id === meetingFilter);
    }
    
    // Filter items by status
    groups = groups.map(group => ({
      ...group,
      actionItems: group.actionItems.filter(item => {
        const isCompleted = completedItems.has(item.id);
        if (statusFilter === 'open') return !isCompleted;
        if (statusFilter === 'completed') return isCompleted;
        return true;
      })
    })).filter(g => g.actionItems.length > 0);
    
    // Sort
    if (sortBy === 'priority') {
      groups = groups.map(group => ({
        ...group,
        actionItems: [...group.actionItems].sort((a, b) =>
          (priorityOrder[a.priority || 'undefined'] || 3) - (priorityOrder[b.priority || 'undefined'] || 3)
        )
      }));
    } else if (sortBy === 'due') {
      // Items with a resolved due date first, soonest first; the rest keep
      // their original order after them.
      groups = groups.map(group => ({
        ...group,
        actionItems: [...group.actionItems].sort((a, b) => {
          if (a.due_date_resolved && b.due_date_resolved) {
            return a.due_date_resolved.localeCompare(b.due_date_resolved);
          }
          if (a.due_date_resolved) return -1;
          if (b.due_date_resolved) return 1;
          return 0;
        })
      }));
    }
    
    return groups;
  }, [meetingGroups, statusFilter, meetingFilter, sortBy, completedItems]);

  const totalItems = meetingGroups.reduce((acc, g) => acc + g.actionItems.length, 0);
  const openCount = totalItems - completedItems.size;
  const completedCount = completedItems.size;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[960px] px-6 py-8 md:px-8 md:py-10">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1
              className="text-[28px] font-semibold leading-tight"
              style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
            >
              Action items
            </h1>
            <p className="mt-1 text-[14px]" style={{ color: 'var(--ink-mid)' }}>
              Tasks extracted from your meetings.
            </p>
          </div>
          <div className="flex items-center gap-6">
            <div>
              <p className="text-[12.5px]" style={{ color: 'var(--ink-mid)' }}>Open</p>
              <p className="mt-0.5 text-[22px] font-semibold leading-none" style={{ color: 'var(--ember-deep)', letterSpacing: '-0.02em' }}>
                {openCount}
              </p>
            </div>
            <div>
              <p className="text-[12.5px]" style={{ color: 'var(--ink-mid)' }}>Completed</p>
              <p className="mt-0.5 text-[22px] font-semibold leading-none" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
                {completedCount}
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="space-y-6">
            {[1, 2].map((i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-6 w-64" />
                <Skeleton className="h-14 rounded-lg" />
                <Skeleton className="h-14 rounded-lg" />
              </div>
            ))}
          </div>
        ) : totalItems === 0 ? (
          <div
            className="flex flex-col items-center justify-center rounded-xl px-6 py-16 text-center"
            style={{ border: '1px dashed var(--rule)', background: 'var(--paper-card)' }}
          >
            <CheckSquare className="mb-4 h-10 w-10" strokeWidth={1.5} style={{ color: 'var(--ink-faint)' }} />
            <p className="mb-1.5 text-[17px] font-semibold" style={{ color: 'var(--ink)' }}>
              No action items yet
            </p>
            <p className="max-w-sm text-[14px]" style={{ color: 'var(--ink-mid)', lineHeight: 1.6 }}>
              Action items appear here after your meetings are processed. Record a meeting to get started.
            </p>
          </div>
        ) : (
          <>
            {/* Filters */}
            <div className="flex items-center gap-3 mb-6 pb-6 border-b border-border/50">
              <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
                {(['all', 'open', 'completed'] as FilterStatus[]).map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={cn(
                      "px-3 py-1.5 text-sm font-medium rounded-md transition-colors capitalize",
                      statusFilter === status 
                        ? "bg-background text-foreground shadow-sm" 
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {status}
                  </button>
                ))}
              </div>
              
              <div className="flex items-center gap-2 ml-auto">
                <Select value={meetingFilter} onValueChange={setMeetingFilter}>
                  <SelectTrigger className="w-full sm:w-[180px] h-9 text-sm">
                    <Filter className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                    <SelectValue placeholder="All meetings" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All meetings</SelectItem>
                    {meetingGroups.map(g => (
                      <SelectItem key={g.id} value={g.id}>{g.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                  <SelectTrigger className="w-full sm:w-[140px] h-9 text-sm">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date">By date</SelectItem>
                    <SelectItem value="priority">By priority</SelectItem>
                    <SelectItem value="due">By due date</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Meeting Groups */}
            <div className="space-y-6">
              {filteredGroups.map((group) => (
                <Collapsible
                  key={group.id}
                  open={expandedMeetings.has(group.id)}
                  onOpenChange={() => toggleMeetingExpanded(group.id)}
                >
                  <CollapsibleTrigger asChild>
                    <button
                      className="group flex w-full items-center gap-3 py-3.5 text-left transition-colors"
                      style={{ borderTop: '1px solid var(--rule)' }}
                    >
                      {expandedMeetings.has(group.id) ? (
                        <ChevronDown className="h-4 w-4" strokeWidth={1.75} style={{ color: 'var(--ink-soft)' }} />
                      ) : (
                        <ChevronRight className="h-4 w-4" strokeWidth={1.75} style={{ color: 'var(--ink-soft)' }} />
                      )}
                      <span
                        className="text-[15px] font-semibold"
                        style={{ color: 'var(--ink)', letterSpacing: '-0.005em' }}
                      >
                        {group.title}
                      </span>
                      <span className="text-[13px]" style={{ color: 'var(--ink-soft)' }}>
                        {formatIST(new Date(group.date), 'MMM d, yyyy')}
                      </span>
                      <span
                        className="ml-auto rounded-full px-2 py-0.5 text-[11.5px] font-medium"
                        style={{
                          background: 'color-mix(in oklch, var(--ember) 10%, transparent)',
                          color: 'var(--ember-deep)',
                        }}
                      >
                        {group.actionItems.filter((i) => !completedItems.has(i.id)).length} open
                      </span>
                    </button>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent>
                    <div className="ml-6 mt-2 space-y-1">
                      {group.actionItems.map((item) => {
                        const isCompleted = completedItems.has(item.id);
                        const isEditing = editingId === item.id;
                        
                        return (
                          <div
                            key={item.id}
                            className={cn(
                              "group flex items-start gap-3 py-3 px-3 -mx-3 rounded-lg transition-colors",
                              "hover:bg-muted/50",
                              isCompleted && "opacity-60"
                            )}
                          >
                            {/* Checkbox */}
                            <button
                              onClick={() => toggleComplete(item.id, group.id, item.index)}
                              className="w-5 h-5 rounded-[4px] border-[1.5px] flex-shrink-0 mt-0.5 flex items-center justify-center transition-all"
                              style={{
                                background: isCompleted ? 'var(--ember)' : 'transparent',
                                borderColor: isCompleted ? 'var(--ember)' : 'var(--rule)',
                              }}
                              onMouseEnter={(e) => {
                                if (!isCompleted) e.currentTarget.style.borderColor = 'var(--ember)';
                              }}
                              onMouseLeave={(e) => {
                                if (!isCompleted) e.currentTarget.style.borderColor = 'var(--rule)';
                              }}
                            >
                              {isCompleted && <Check className="w-3 h-3 text-white" strokeWidth={2.5} />}
                            </button>
                            
                            {/* Task content */}
                            <div className="flex-1 min-w-0">
                              {isEditing ? (
                                <div className="flex items-center gap-2">
                                  <Input
                                    value={editText}
                                    onChange={(e) => setEditText(e.target.value)}
                                    className="h-8 text-sm"
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') saveEdit();
                                      if (e.key === 'Escape') cancelEdit();
                                    }}
                                  />
                                  <Button size="sm" variant="ghost" onClick={saveEdit} className="h-8 px-2">
                                    Save
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-8 px-2 text-muted-foreground">
                                    Cancel
                                  </Button>
                                </div>
                              ) : (
                                <>
                                  <p className={cn("text-foreground", isCompleted && "line-through")}>
                                    {item.task}
                                  </p>
                                  
                                  <div className="flex items-center gap-2 mt-1.5">
                                    {item.owner && (
                                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                        <User className="w-3 h-3" />{item.owner}
                                      </span>
                                    )}
                                    {item.priority && (
                                      <span className={cn(
                                        "text-xs px-1.5 py-0.5 rounded font-medium",
                                        item.priority === 'high' && "bg-destructive/10 text-destructive",
                                        item.priority === 'medium' && "bg-warning/10 text-warning",
                                        item.priority === 'low' && "bg-muted text-muted-foreground"
                                      )}>
                                        {item.priority}
                                      </span>
                                    )}
                                    {dueChipLabel(item) && (
                                      <span className={cn(
                                        "inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium",
                                        isOverdue(item, isCompleted)
                                          ? "bg-destructive/10 text-destructive"
                                          : "text-muted-foreground"
                                      )}>
                                        <Calendar className="w-3 h-3" />
                                        {dueChipLabel(item)}
                                      </span>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                            
                            {/* Hover actions */}
                            {!isEditing && (
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => startEditing(item)}
                                  className="h-7 w-7 p-0"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Link to={`/meeting/${group.id}`}>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </Button>
                                </Link>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
              
              {filteredGroups.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  No action items match your filters.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
