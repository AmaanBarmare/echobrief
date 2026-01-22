import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Completion {
  meeting_id: string;
  action_item_index: number;
  completed: boolean;
}

export function useActionItemCompletions() {
  const { user } = useAuth();
  const [completions, setCompletions] = useState<Map<string, boolean>>(new Map());
  const [loading, setLoading] = useState(true);

  // Generate a unique key for each action item
  const getKey = (meetingId: string, index: number) => `${meetingId}-${index}`;

  // Load completions from database
  useEffect(() => {
    if (!user) return;

    const fetchCompletions = async () => {
      const { data, error } = await supabase
        .from('action_item_completions')
        .select('meeting_id, action_item_index, completed')
        .eq('user_id', user.id);

      if (!error && data) {
        const map = new Map<string, boolean>();
        data.forEach((item: Completion) => {
          map.set(getKey(item.meeting_id, item.action_item_index), item.completed);
        });
        setCompletions(map);
      }
      setLoading(false);
    };

    fetchCompletions();
  }, [user]);

  // Check if an action item is completed
  const isCompleted = useCallback((meetingId: string, index: number) => {
    return completions.get(getKey(meetingId, index)) ?? false;
  }, [completions]);

  // Toggle completion status
  const toggleCompletion = useCallback(async (meetingId: string, index: number): Promise<boolean> => {
    if (!user) return false;

    const key = getKey(meetingId, index);
    const currentValue = completions.get(key) ?? false;
    const newValue = !currentValue;

    // Optimistic update
    setCompletions(prev => {
      const next = new Map(prev);
      next.set(key, newValue);
      return next;
    });

    try {
      // Upsert to database
      const { error } = await supabase
        .from('action_item_completions')
        .upsert({
          user_id: user.id,
          meeting_id: meetingId,
          action_item_index: index,
          completed: newValue,
          completed_at: newValue ? new Date().toISOString() : null,
        }, {
          onConflict: 'user_id,meeting_id,action_item_index'
        });

      if (error) {
        // Revert on error
        setCompletions(prev => {
          const next = new Map(prev);
          next.set(key, currentValue);
          return next;
        });
        console.error('Failed to update completion:', error);
        return false;
      }

      return true;
    } catch (err) {
      // Revert on error
      setCompletions(prev => {
        const next = new Map(prev);
        next.set(key, currentValue);
        return next;
      });
      console.error('Failed to update completion:', err);
      return false;
    }
  }, [user, completions]);

  // Get completion counts for a meeting
  const getCompletionStats = useCallback((meetingId: string, totalItems: number) => {
    let completed = 0;
    for (let i = 0; i < totalItems; i++) {
      if (isCompleted(meetingId, i)) {
        completed++;
      }
    }
    return {
      completed,
      total: totalItems,
      percentage: totalItems > 0 ? Math.round((completed / totalItems) * 100) : 0
    };
  }, [isCompleted]);

  return {
    loading,
    isCompleted,
    toggleCompletion,
    getCompletionStats,
  };
}
