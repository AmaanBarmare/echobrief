import { useState, useEffect } from 'react';
import { Mail, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface DigestSettingsProps {
  user_id?: string;
  onSave?: () => void;
}

export function DigestSettings({ user_id, onSave }: DigestSettingsProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [frequency, setFrequency] = useState<'weekly' | 'monthly' | 'disabled'>('weekly');
  const [dayOfWeek, setDayOfWeek] = useState(1); // Monday
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [emails, setEmails] = useState('');

  useEffect(() => {
    if (!user_id) return;

    const fetchSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('digest_schedules')
          .select('*')
          .eq('user_id', user_id)
          .single();

        if (data) {
          setFrequency(data.frequency);
          setDayOfWeek(data.day_of_week);
          setDayOfMonth(data.day_of_month);
          setHour(data.hour_of_day);
          setMinute(data.minute_of_hour);
        }
      } catch (err) {
        console.log('No existing settings');
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [user_id]);

  const handleSave = async () => {
    if (!user_id || !emails.trim()) {
      toast({ title: 'Error', description: 'Please enter at least one email', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const emailList = emails.split(',').map(e => e.trim()).filter(e => e);

      const { error } = await supabase
        .from('digest_schedules')
        .upsert({
          user_id,
          frequency,
          day_of_week: dayOfWeek,
          day_of_month: dayOfMonth,
          hour_of_day: hour,
          minute_of_hour: minute,
          enabled: frequency !== 'disabled',
        }, {
          onConflict: 'user_id',
        });

      if (error) throw error;

      toast({ title: 'Saved', description: 'Digest settings updated' });
      onSave?.();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-muted-foreground">Loading settings...</div>;
  }

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = [0, 15, 30, 45];

  const selectClass =
    'w-full cursor-pointer rounded-lg border border-border bg-background px-3 py-2 font-[inherit] text-foreground';

  return (
    <div className="rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm">
      <h3 className="mb-4 text-[15px] font-semibold text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
        <Mail size={16} className="mr-2 inline-block text-orange-500" />
        Digest Report Settings
      </h3>

      <div className="space-y-4">
        {/* Frequency */}
        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">Frequency</label>
          <div className="flex gap-2">
            {(['weekly', 'monthly', 'disabled'] as const).map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setFrequency(f)}
                className={cn(
                  'cursor-pointer rounded-lg border px-4 py-2 text-[13px] font-medium font-[inherit] transition-colors',
                  frequency === f
                    ? 'border-orange-500 bg-orange-500/10 text-orange-600 dark:text-orange-400'
                    : 'border-border bg-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {f === 'disabled' ? 'Disabled' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {frequency !== 'disabled' && (
          <>
            {/* Day Selection */}
            {frequency === 'weekly' ? (
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Send on</label>
                <select value={dayOfWeek} onChange={(e) => setDayOfWeek(parseInt(e.target.value))} className={selectClass}>
                  {days.map((d, i) => (
                    <option key={i} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Day of month</label>
                <select value={dayOfMonth} onChange={(e) => setDayOfMonth(parseInt(e.target.value))} className={selectClass}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Time Selection */}
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Time</label>
              <div className="flex gap-2">
                <select value={hour} onChange={(e) => setHour(parseInt(e.target.value))} className={cn(selectClass, 'flex-1')}>
                  {hours.map(h => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, '0')}
                    </option>
                  ))}
                </select>
                <span className="self-center text-muted-foreground">:</span>
                <select value={minute} onChange={(e) => setMinute(parseInt(e.target.value))} className={cn(selectClass, 'flex-1')}>
                  {minutes.map(m => (
                    <option key={m} value={m}>
                      {String(m).padStart(2, '0')}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </>
        )}

        {/* Recipient Emails */}
        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">Recipient emails (comma-separated)</label>
          <textarea
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder="your@email.com, team@example.com"
            rows={3}
            className="w-full resize-y rounded-lg border border-border bg-background p-3 font-[inherit] text-[13px] text-foreground"
          />
          <p className="mt-1 text-xs text-muted-foreground">Leave empty to disable digest reports</p>
        </div>

        {/* Save Button */}
        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave} disabled={saving} className="flex-1 bg-orange-500 text-white hover:bg-orange-600">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save size={14} className="mr-2" />}
            Save Settings
          </Button>
        </div>
      </div>
    </div>
  );
}
