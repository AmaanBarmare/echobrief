import { useState, useEffect } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface BotCustomizationProps {
  user_id?: string;
  onSave?: () => void;
}

const COLOR_OPTIONS = [
  { name: 'Orange', hex: '#F97316', bg: 'rgba(249,115,22,0.1)' },
  { name: 'Blue', hex: '#3B82F6', bg: 'rgba(59,130,246,0.1)' },
  { name: 'Green', hex: '#22C55E', bg: 'rgba(34,197,94,0.1)' },
  { name: 'Purple', hex: '#A855F7', bg: 'rgba(168,85,247,0.1)' },
  { name: 'Pink', hex: '#EC4899', bg: 'rgba(236,72,153,0.1)' },
  { name: 'Cyan', hex: '#06B6D4', bg: 'rgba(6,182,212,0.1)' },
];

export function BotCustomization({ user_id, onSave }: BotCustomizationProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [botName, setBotName] = useState('EchoBrief Notetaker');
  const [botColor, setBotColor] = useState('#F97316');
  const [autoJoin, setAutoJoin] = useState(true);

  useEffect(() => {
    if (!user_id) return;

    const fetchSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('notetaker_name, bot_color, auto_join_enabled')
          .eq('user_id', user_id)
          .single();

        if (data) {
          if (data.notetaker_name) setBotName(data.notetaker_name);
          if (data.bot_color) setBotColor(data.bot_color);
          if (data.auto_join_enabled !== null) setAutoJoin(data.auto_join_enabled);
        }
      } catch (err) {
        console.log('Using defaults');
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [user_id]);

  const handleSave = async () => {
    if (!user_id || !botName.trim()) {
      toast({ title: 'Error', description: 'Bot name cannot be empty', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          notetaker_name: botName,
          bot_color: botColor,
          auto_join_enabled: autoJoin,
        })
        .eq('user_id', user_id);

      if (error) throw error;

      toast({ title: 'Saved', description: 'Bot customization updated' });
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

  return (
    <div className="rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm">
      <h3 className="mb-6 text-[15px] font-semibold text-foreground" style={{ fontFamily: 'Outfit, sans-serif' }}>
        🤖 Bot Customization
      </h3>

      <div className="space-y-6">
        {/* Bot Name */}
        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">Bot Name</label>
          <Input
            type="text"
            value={botName}
            onChange={(e) => setBotName(e.target.value)}
            placeholder="e.g., Meeting Recorder"
            maxLength={50}
            className="rounded-lg border-border bg-background px-3 py-2.5 text-[13px] text-foreground"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            This name appears in meeting notifications and calendar invites
          </p>
        </div>

        {/* Bot Color */}
        <div>
          <label className="mb-3 block text-sm font-medium text-foreground">Bot Icon Color</label>
          <div className="grid grid-cols-3 gap-3">
            {COLOR_OPTIONS.map(color => (
              <button
                key={color.hex}
                type="button"
                onClick={() => setBotColor(color.hex)}
                className="flex cursor-pointer flex-col items-center gap-2 rounded-lg p-4 transition-all"
                style={{
                  border:
                    botColor === color.hex ? `2px solid ${color.hex}` : '1px solid hsl(var(--border))',
                  background: color.bg,
                }}
              >
                <div
                  className="h-8 w-8 rounded-lg"
                  style={{ background: color.hex }}
                />
                <span
                  className={cn('text-[11px] font-medium', botColor !== color.hex && 'text-muted-foreground')}
                  style={botColor === color.hex ? { color: color.hex } : undefined}
                >
                  {color.name}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-semibold text-white"
                style={{ background: botColor }}
              >
                E
              </div>
              <div className="text-xs text-muted-foreground">
                Preview: {botName}
              </div>
            </div>
          </div>
        </div>

        {/* Auto Join */}
        <div>
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={autoJoin}
              onChange={(e) => setAutoJoin(e.target.checked)}
              className="h-[18px] w-[18px] cursor-pointer accent-orange-500"
            />
            <span className="text-[13px] font-medium text-foreground">
              Auto-join meetings from calendar
            </span>
          </label>
          <p className="ml-7 mt-2 text-xs text-muted-foreground">
            Automatically record and analyze meetings from your Google Calendar
          </p>
        </div>

        {/* Save Button */}
        <div className="flex gap-2 pt-4">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-orange-500 text-white hover:bg-orange-600"
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save size={14} className="mr-2" />}
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}
