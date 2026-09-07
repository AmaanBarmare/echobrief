/**
 * Profile, custom vocabulary and the automation webhook.
 *
 * Split out of Settings.tsx, which had reached 1,217 lines holding six tabs'
 * worth of state and handlers in one component — the file every new setting
 * had to land in, and the one nobody could change quickly.
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, Loader2, RefreshCw, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { formatIST } from '@/lib/time';
import type { Profile, WebhookEvent } from './types';

interface PanelProps {
  profile: Profile | null;
  setProfile: React.Dispatch<React.SetStateAction<Profile | null>>;
}

export function AccountPanel({ profile, setProfile }: PanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [fullName, setFullName] = useState('');
  const [saving, setSaving] = useState(false);

  const [vocabulary, setVocabulary] = useState<string[]>([]);
  const [vocabInput, setVocabInput] = useState('');
  const [savingVocab, setSavingVocab] = useState(false);

  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [regeneratingSecret, setRegeneratingSecret] = useState(false);
  const [webhookEvents, setWebhookEvents] = useState<WebhookEvent[]>([]);

  // The shell owns the profile fetch; these forms mirror it once it lands.
  useEffect(() => {
    if (!profile) return;
    setFullName((profile.full_name || '').trim());
    setVocabulary(Array.isArray(profile.custom_vocabulary) ? profile.custom_vocabulary : []);
    setWebhookUrl(profile.webhook_url ?? '');
    setWebhookSecret(profile.webhook_secret ?? null);
  }, [profile]);

  // Delivery history is only ever shown here, so it is fetched here rather than
  // being loaded for every tab.
  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data, error } = await supabase
        .from('webhook_events')
        .select('id, event_type, status_code, error, delivered_at, created_at, meeting_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) {
        console.warn('[Settings] webhook events fetch:', error);
      } else if (data) {
        setWebhookEvents(data);
      }
    })();
  }, [user]);

  // Account handlers
  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const trimmed = fullName.trim();
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: trimmed })
        .eq('user_id', user.id);

      if (error) throw error;

      const { error: authErr } = await supabase.auth.updateUser({
        data: { full_name: trimmed, name: trimmed },
      });
      if (authErr) {
        console.warn('[Settings] Auth display name sync:', authErr);
      }

      toast({ title: 'Saved', description: 'Your profile has been updated.' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Custom vocabulary handlers. Each add/remove persists immediately, same as
  // the other single-field profile updates on this page.
  const saveVocabulary = async (next: string[]) => {
    if (!user) return;
    const previous = vocabulary;
    setSavingVocab(true);
    setVocabulary(next);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ custom_vocabulary: next })
        .eq('user_id', user.id);

      if (error) throw error;
      setProfile(prev => (prev ? { ...prev, custom_vocabulary: next } : null));
      toast({ title: 'Saved', description: 'Your custom vocabulary has been updated.' });
      return true;
    } catch (error: any) {
      setVocabulary(previous);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return false;
    } finally {
      setSavingVocab(false);
    }
  };

  const handleAddVocabularyTerm = async () => {
    const term = vocabInput.trim();
    if (term.length < 3) {
      toast({ title: 'Error', description: 'Terms must be at least 3 characters.', variant: 'destructive' });
      return;
    }
    if (vocabulary.some(v => v.toLowerCase() === term.toLowerCase())) {
      toast({ title: 'Error', description: `"${term}" is already in your vocabulary.`, variant: 'destructive' });
      return;
    }
    const saved = await saveVocabulary([...vocabulary, term]);
    if (saved) setVocabInput('');
  };

  const handleRemoveVocabularyTerm = (term: string) => {
    saveVocabulary(vocabulary.filter(v => v !== term));
  };

  // Automation webhook handlers. The secret is minted client-side and stored on
  // the profile; supabase/functions/_shared/webhooks.ts signs deliveries with it.
  const generateWebhookSecret = () => {
    const bytes = new Uint8Array(24); // 24 bytes → exactly 32 base64url chars, no padding
    crypto.getRandomValues(bytes);
    const base64 = btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
    return `whsec_${base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
  };

  const isHttpsUrl = (value: string) => {
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  };

  const handleSaveWebhookUrl = async () => {
    if (!user) return;
    const trimmed = webhookUrl.trim();
    if (trimmed && !isHttpsUrl(trimmed)) {
      toast({ title: 'Error', description: 'Endpoint URL must start with https://', variant: 'destructive' });
      return;
    }
    // The first saved endpoint mints a signing secret so delivery #1 is already verifiable.
    const mintedSecret = trimmed && !webhookSecret ? generateWebhookSecret() : null;
    setSavingWebhook(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update(
          mintedSecret
            ? { webhook_url: trimmed || null, webhook_secret: mintedSecret }
            : { webhook_url: trimmed || null }
        )
        .eq('user_id', user.id);

      if (error) throw error;
      setWebhookUrl(trimmed);
      if (mintedSecret) setWebhookSecret(mintedSecret);
      setProfile(prev =>
        prev
          ? { ...prev, webhook_url: trimmed || null, webhook_secret: mintedSecret ?? prev.webhook_secret }
          : null
      );
      toast({
        title: 'Saved',
        description: trimmed
          ? 'Meeting insights will be posted to your endpoint.'
          : 'Automation webhook turned off.',
      });
    } catch (error) {
      toast({ title: 'Error', description: (error as Error).message, variant: 'destructive' });
    } finally {
      setSavingWebhook(false);
    }
  };

  const handleRegenerateWebhookSecret = async () => {
    if (!user) return;
    setRegeneratingSecret(true);
    try {
      const next = generateWebhookSecret();
      const { error } = await supabase
        .from('profiles')
        .update({ webhook_secret: next })
        .eq('user_id', user.id);

      if (error) throw error;
      setWebhookSecret(next);
      setProfile(prev => (prev ? { ...prev, webhook_secret: next } : null));
      toast({
        title: 'Secret regenerated',
        description: 'Update the secret on your receiver — deliveries signed with the old one will no longer verify.',
      });
    } catch (error) {
      toast({ title: 'Error', description: (error as Error).message, variant: 'destructive' });
    } finally {
      setRegeneratingSecret(false);
    }
  };

  const handleCopyWebhookSecret = async () => {
    if (!webhookSecret) return;
    try {
      await navigator.clipboard.writeText(webhookSecret);
      toast({ title: 'Copied to clipboard' });
    } catch (error) {
      toast({ title: 'Error', description: (error as Error).message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Profile */}
      <div className="rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-foreground">Profile Information</h2>
        <div className="mb-4">
          <label className="mb-2 block text-[13px] font-medium text-foreground">Full Name</label>
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="border-border bg-background text-foreground"
          />
        </div>
        <div className="mb-4">
          <label className="mb-2 block text-[13px] font-medium text-foreground">Email</label>
          <Input
            disabled
            value={user?.email || ''}
            className="border-border bg-muted/50 text-muted-foreground"
          />
        </div>
        <Button onClick={handleSaveProfile} disabled={saving} className="bg-ember text-white hover:bg-ember-deep">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Save Changes
        </Button>
      </div>

      {/* Custom vocabulary */}
      <div className="rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h2 className="mb-1 text-base font-semibold text-foreground">Custom vocabulary</h2>
        <p className="mb-4 text-[13px] text-muted-foreground">
          Canonical spellings of company, product and client names. These exact spellings are
          enforced in your transcripts and summaries.
        </p>
        <div className="mb-4 flex gap-2">
          <Input
            value={vocabInput}
            onChange={(e) => setVocabInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddVocabularyTerm();
              }
            }}
            placeholder='e.g. "Oltaflock"'
            className="border-border bg-background text-foreground"
          />
          <Button
            onClick={handleAddVocabularyTerm}
            disabled={savingVocab}
            className="bg-ember text-white hover:bg-ember-deep"
          >
            {savingVocab ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Add
          </Button>
        </div>
        {vocabulary.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {vocabulary.map((term) => (
              <span
                key={term}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-[13px] text-foreground"
              >
                {term}
                <button
                  type="button"
                  onClick={() => handleRemoveVocabularyTerm(term)}
                  disabled={savingVocab}
                  className="cursor-pointer border-none bg-transparent p-0 text-muted-foreground hover:text-destructive disabled:opacity-50"
                  title={`Remove ${term}`}
                >
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No terms yet. Add names the transcriber tends to misspell.
          </p>
        )}
      </div>

      {/* Automation webhook */}
      <div className="rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h2 className="mb-1 text-base font-semibold text-foreground">Automation webhook</h2>
        <p className="mb-4 text-[13px] text-muted-foreground">
          When a meeting&apos;s insights are ready, EchoBrief POSTs a JSON payload (summary, action
          items, extracted facts, coaching summary — never the transcript) to this URL. Requests are
          signed with Standard Webhooks headers (<code>webhook-id</code>, <code>webhook-timestamp</code>,{' '}
          <code>webhook-signature</code> = <code>v1,&lt;base64 HMAC-SHA256 of id.timestamp.body&gt;</code>)
          so n8n, Make, Zapier or your own endpoint can verify them. Events:{' '}
          <code>meeting.insights_ready</code>, <code>meeting.insights_regenerated</code>.
        </p>

        <div className="mb-4">
          <label className="mb-2 block text-[13px] font-medium text-foreground">Endpoint URL</label>
          <div className="flex gap-2">
            <Input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSaveWebhookUrl();
                }
              }}
              placeholder="https://your-n8n.example.com/webhook/echobrief"
              className="border-border bg-background text-foreground"
            />
            <Button
              onClick={handleSaveWebhookUrl}
              disabled={savingWebhook}
              className="bg-ember text-white hover:bg-ember-deep"
            >
              {savingWebhook ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            https:// only. Save an empty field to turn the webhook off.
          </p>
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-[13px] font-medium text-foreground">Signing secret</label>
          {webhookSecret ? (
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-[13px] text-foreground">
                {webhookSecret.slice(0, 8)}••••••••••••••••
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyWebhookSecret}
                className="border-border text-foreground hover:bg-muted"
              >
                <Copy size={14} className="mr-2" />
                Copy
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRegenerateWebhookSecret}
                disabled={regeneratingSecret}
                className="border-border text-foreground hover:bg-muted"
              >
                {regeneratingSecret ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw size={14} className="mr-2" />
                )}
                Regenerate
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              A secret is generated the first time you save an endpoint URL.
            </p>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-[13px] font-medium text-foreground">Recent deliveries</h3>
          {webhookEvents.length > 0 ? (
            <div className="flex flex-col gap-2">
              {webhookEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="m-0 text-[13px] font-medium text-foreground">{ev.event_type}</p>
                    <p className="m-0 text-[11px] text-muted-foreground">
                      {formatIST(ev.created_at, 'MMM d, yyyy h:mm a')}
                    </p>
                    {ev.error ? (
                      <p className="m-0 mt-1 truncate text-[11px] text-destructive" title={ev.error}>
                        {ev.error}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={
                      ev.error
                        ? 'shrink-0 rounded bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive'
                        : 'shrink-0 rounded bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success dark:text-success'
                    }
                  >
                    {ev.status_code ? `HTTP ${ev.status_code}` : ev.error ? 'Failed' : 'Delivered'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No deliveries yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
