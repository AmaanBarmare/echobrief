import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { BotCustomization } from '@/components/dashboard/BotCustomization';
import { supabase } from '@/integrations/supabase/client';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Lock, Mail, Bell, LogOut, X, Trash2, Calendar, Copy, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { displayNameFromUserMetadata } from '@/lib/userDisplayName';
import { formatIST } from '@/lib/time';
import { checkPwnedPassword } from '@/lib/pwned';
import { ApiTokensCard } from '@/components/settings/ApiTokensCard';
import { BillingCard } from '@/components/settings/BillingCard';
import { ExportDataCard } from '@/components/settings/ExportDataCard';

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  google_calendar_connected: boolean;
  google_needs_reconnect: boolean | null;
  email_summaries_enabled: boolean | null;
  recording_preference: 'audio_only' | 'audio_video';
  custom_vocabulary: string[] | null;
  webhook_url: string | null;
  webhook_secret: string | null;
}

interface WebhookEvent {
  id: string;
  event_type: string;
  status_code: number | null;
  error: string | null;
  delivered_at: string | null;
  created_at: string;
  meeting_id: string | null;
}

interface GoogleCalendar {
  id: string;
  email: string;
  name: string;
  is_primary: boolean;
  connected_at: string;
}

type SettingsTab = 'account' | 'bot' | 'integrations' | 'billing' | 'security' | 'developer';

export default function Settings() {
  const { user, session } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  // Get initial tab from URL params
  const getInitialTab = (): SettingsTab => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam === 'integrations' || tabParam === 'bot' || tabParam === 'billing' || tabParam === 'security' || tabParam === 'developer') {
      return tabParam as SettingsTab;
    }
    return 'account';
  };
  
  const [activeTab, setActiveTab] = useState<SettingsTab>(getInitialTab());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Account settings
  const [fullName, setFullName] = useState('');
  const [saving, setSaving] = useState(false);

  // Custom vocabulary — canonical spellings the transcription pipeline enforces
  const [vocabulary, setVocabulary] = useState<string[]>([]);
  const [vocabInput, setVocabInput] = useState('');
  const [savingVocab, setSavingVocab] = useState(false);

  // Automation webhook — signed POST to the user's endpoint when insights land
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);
  const [savingWebhook, setSavingWebhook] = useState(false);
  const [regeneratingSecret, setRegeneratingSecret] = useState(false);
  const [webhookEvents, setWebhookEvents] = useState<WebhookEvent[]>([]);

  // Security settings
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Integrations
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [savingEmailPref, setSavingEmailPref] = useState(false);
  const [googleCalendars, setGoogleCalendars] = useState<GoogleCalendar[]>([]);

  // Delete account
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

  useEffect(() => {
    if (!user) return;

    const fetchProfile = async () => {
      // Fresh user from Auth API: JWT in memory can lag behind Dashboard edits to display name
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      const authUser = authData?.user ?? user;
      if (authErr) {
        console.warn('[Settings] getUser:', authErr);
      }

      const fromAuthMeta = displayNameFromUserMetadata(authUser);

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profileError) {
        console.error('[Settings] profile fetch:', profileError);
        setFullName(fromAuthMeta);
        setProfile(null);
      } else if (profileData) {
        setProfile(profileData as Profile);
        setVocabulary(Array.isArray(profileData.custom_vocabulary) ? profileData.custom_vocabulary : []);
        setWebhookUrl(profileData.webhook_url ?? '');
        setWebhookSecret(profileData.webhook_secret ?? null);
        const fromProfile = (profileData.full_name || '').trim();
        const resolvedName = fromProfile || fromAuthMeta;
        setFullName(resolvedName);

        if (!fromProfile && resolvedName) {
          await supabase
            .from('profiles')
            .update({ full_name: resolvedName })
            .eq('user_id', user.id);
        }
      } else {
        setProfile(null);
        setFullName(fromAuthMeta);
        if (fromAuthMeta || authUser.email) {
          const { error: insertErr } = await supabase.from('profiles').insert({
            user_id: user.id,
            email: authUser.email ?? null,
            full_name: fromAuthMeta || null,
          });
          if (insertErr?.code === '23505') {
            await supabase
              .from('profiles')
              .update({ full_name: fromAuthMeta || null })
              .eq('user_id', user.id);
          }
        }
      }

      // Fetch connected Google Calendars
      const { data: calendarsData, error: calendarsError } = await supabase
        .from('calendars')
        .select('id, email, calendar_name, is_primary, is_active')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('is_primary', { ascending: false });

      if (!calendarsError && calendarsData) {
        setGoogleCalendars(
          calendarsData.map((cal: any) => ({
            id: cal.id,
            email: cal.email || '',
            name: cal.calendar_name || 'Unnamed Calendar',
            is_primary: cal.is_primary,
            connected_at: new Date().toISOString(),
          }))
        );
      }

      // Last few automation webhook deliveries (written by the pipeline, read-only here)
      const { data: eventsData, error: eventsError } = await supabase
        .from('webhook_events')
        .select('id, event_type, status_code, error, delivered_at, created_at, meeting_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (eventsError) {
        console.warn('[Settings] webhook events fetch:', eventsError);
      } else if (eventsData) {
        setWebhookEvents(eventsData);
      }

      setLoading(false);
    };

    fetchProfile();
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

  // Security handlers
  const handleChangePassword = async () => {
    if (!newPassword || !confirmNewPassword) {
      toast({ title: 'Error', description: 'Please fill in both fields.', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast({ title: 'Error', description: 'Passwords do not match.', variant: 'destructive' });
      return;
    }
    if (newPassword.length < 10) {
      toast({ title: 'Error', description: 'Use at least 10 characters with letters and numbers.', variant: 'destructive' });
      return;
    }
    setChangingPassword(true);
    try {
      const pwned = await checkPwnedPassword(newPassword);
      if (pwned.breached) {
        toast({
          title: 'Choose a different password',
          description: `This password has appeared in ${pwned.count.toLocaleString()} known data breaches. Please choose a different one.`,
          variant: 'destructive',
        });
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: 'Password updated', description: 'Your password has been changed successfully.' });
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      toast({ title: 'Signed out', description: 'You have been signed out.' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== 'DELETE') {
      toast({ title: 'Error', description: 'Please type DELETE to confirm', variant: 'destructive' });
      return;
    }

    setDeletingAccount(true);
    try {
      // The delete-account edge function derives the user from the JWT and
      // removes the account plus all of its data server-side. (The old
      // supabase.auth.admin.deleteUser call could never work from the browser
      // — admin methods need the service role key.)
      const { data, error } = await supabase.functions.invoke('delete-account', {
        body: { confirm: 'DELETE' },
      });
      if (error) {
        let message = error.message || 'Failed to delete account';
        if (error instanceof FunctionsHttpError) {
          try {
            const body = await error.context.json();
            if (body?.error) message = body.error;
          } catch {
            // keep the generic message
          }
        }
        throw new Error(message);
      }
      if (data?.error) throw new Error(data.error);

      await supabase.auth.signOut();
      toast({ title: 'Account deleted', description: 'Your account has been permanently deleted.' });
      navigate('/');
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setDeletingAccount(false);
    }
  };

  const handleDisconnectGoogleCalendar = async (calendarId: string) => {
    try {
      // Mark calendar as inactive in database
      const { error } = await supabase
        .from('calendars')
        .update({ is_active: false })
        .eq('id', calendarId)
        .eq('user_id', user?.id);

      if (error) throw error;

      setGoogleCalendars(prev => prev.filter(cal => cal.id !== calendarId));
      toast({ title: 'Disconnected', description: 'Google Calendar has been removed.' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  // Integration handlers
  const handleConnectGoogle = async () => {
    if (!session?.access_token) {
      toast({ title: 'Error', description: 'Please sign in to connect Google Calendar', variant: 'destructive' });
      return;
    }
    setConnectingGoogle(true);
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/google-oauth-start`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ returnTo: '/settings?tab=integrations', origin: window.location.origin }),
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);
      if (data.authUrl) {
        // Mark that we're waiting for calendar sync after OAuth
        localStorage.setItem('awaiting-calendar-sync-' + user?.id, 'true');
        window.location.href = data.authUrl;
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setConnectingGoogle(false);
    }
  };

  // After OAuth redirect, read calendars from DB (OAuth callback saves them)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleConnected = params.get('google_connected');
    
    if (googleConnected === 'true' && user) {
      setTimeout(async () => {
        try {
          const { data: calendarsData } = await supabase
            .from('calendars')
            .select('id, email, calendar_name, is_primary')
            .eq('user_id', user.id)
            .eq('is_active', true);

          if (calendarsData && calendarsData.length > 0) {
            setGoogleCalendars(
              calendarsData.map((cal: any) => ({
                id: cal.id,
                email: cal.email || '',
                name: cal.calendar_name || 'Unnamed',
                is_primary: cal.is_primary,
                connected_at: new Date().toISOString(),
              }))
            );
            toast({ title: 'Success!', description: `Connected ${calendarsData.length} calendar(s).` });
          } else {
            toast({ title: 'Info', description: 'No calendars found' });
          }
        } catch (error: any) {
          toast({ title: 'Error', description: 'Failed to load calendars', variant: 'destructive' });
        }
      }, 500); // Small delay for DB write to complete
    }
  }, [user, toast]);

  // Backs deliverResults() in supabase/functions/_shared/insights.ts, which
  // treats a missing/true value as "send the summary".
  const handleToggleEmailSummaries = async (enabled: boolean) => {
    if (!user) return;
    setSavingEmailPref(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ email_summaries_enabled: enabled })
        .eq('user_id', user.id);

      if (error) throw error;
      setProfile(prev => (prev ? { ...prev, email_summaries_enabled: enabled } : null));
      toast({
        title: enabled ? 'Email summaries on' : 'Email summaries off',
        description: enabled
          ? 'You will get a summary email when a meeting finishes processing.'
          : 'Meeting summaries will no longer be emailed to you.',
      });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSavingEmailPref(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    if (!user || !session?.access_token) return;
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/disconnect-google`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setProfile(prev => prev ? { ...prev, google_calendar_connected: false, google_needs_reconnect: false } : null);
      setGoogleCalendars([]);
      toast({ title: 'Disconnected', description: 'Google Calendar integration has been removed.' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  // Refetch calendars when integrations tab is opened
  const handleTabChange = (tabId: SettingsTab) => {
    setActiveTab(tabId);
    
    // If switching to integrations tab, refetch calendars
    if (tabId === 'integrations' && user) {
      const refetchCalendars = async () => {
        const { data, error } = await supabase
          .from('calendars')
          .select('id, email, calendar_name, is_primary, is_active')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('is_primary', { ascending: false });

        if (!error && data) {
          setGoogleCalendars(
            data.map((cal: any) => ({
              id: cal.id,
              email: cal.email || '',
              name: cal.calendar_name || 'Unnamed Calendar',
              is_primary: cal.is_primary,
              connected_at: new Date().toISOString(),
            }))
          );
        }
      };
      refetchCalendars();
    }
  };

  const tabs = [
    { id: 'account' as const, label: 'Account', icon: '👤' },
    { id: 'bot' as const, label: 'Bot', icon: '🤖' },
    { id: 'integrations' as const, label: 'Integrations', icon: '🔗' },
    { id: 'billing' as const, label: 'Billing', icon: '💳' },
    { id: 'security' as const, label: 'Security', icon: '🔒' },
    { id: 'developer' as const, label: 'Developer', icon: '⌘' },
  ];

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[960px] px-6 py-8 md:px-8 md:py-10">
        <div className="mb-8">
          <h1
            className="text-[28px] font-semibold leading-tight"
            style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
          >
            Settings
          </h1>
          <p className="mt-1 text-[14px]" style={{ color: 'var(--ink-mid)' }}>
            Manage your account, integrations, and preferences.
          </p>
        </div>

        {/* Tabs */}
        <div
          className="mb-8 flex flex-wrap items-end gap-5"
          style={{ borderBottom: '1px solid var(--rule)' }}
        >
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className="relative pb-3 text-[13.5px] transition-colors"
                style={{
                  color: active ? 'var(--ink)' : 'var(--ink-soft)',
                  background: 'transparent',
                  fontWeight: active ? 600 : 500,
                }}
              >
                {tab.label}
                {active && (
                  <span
                    aria-hidden
                    className="absolute -bottom-px left-0 right-0 h-[2px]"
                    style={{ background: 'var(--ember)' }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Account Tab */}
        {activeTab === 'account' && (
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
              <Button onClick={handleSaveProfile} disabled={saving} className="bg-orange-500 text-white hover:bg-orange-600">
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
                  className="bg-orange-500 text-white hover:bg-orange-600"
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
                    className="bg-orange-500 text-white hover:bg-orange-600"
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
                              : 'shrink-0 rounded bg-green-500/15 px-2 py-0.5 text-[10px] font-semibold text-green-600 dark:text-green-400'
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
        )}

        {/* Bot Tab */}
        {activeTab === 'bot' && (
          <div>
            {user && <BotCustomization user_id={user.id} />}
          </div>
        )}

        {/* Integrations Tab */}
        {activeTab === 'integrations' && (
          <div className="space-y-6">
            {/* Google Calendar */}
            <div className="rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div className="flex flex-1 items-center gap-3">
                  <Calendar size={32} className="shrink-0 text-[#4285F4]" />
                  <div>
                    <h3 className="mb-1 text-[15px] font-semibold text-foreground">Google Calendar</h3>
                    <p className="text-[13px] text-muted-foreground">
                      Connect multiple calendars to detect and record meetings
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {profile?.google_calendar_connected && (
                    <Button
                      variant="outline"
                      onClick={handleDisconnectGoogle}
                      title="Revoke EchoBrief's access to your Google Calendar"
                    >
                      Disconnect
                    </Button>
                  )}
                  <Button
                    onClick={handleConnectGoogle}
                    disabled={connectingGoogle}
                    className="bg-orange-500 text-white hover:bg-orange-600"
                  >
                    {connectingGoogle ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {profile?.google_needs_reconnect ? 'Reconnect' : 'Add Calendar'}
                  </Button>
                </div>
              </div>

              {profile?.google_needs_reconnect && (
                <div
                  role="alert"
                  className="mb-4 rounded-md px-4 py-3 text-[13px]"
                  style={{
                    border: '1px solid color-mix(in oklch, hsl(var(--warning)) 35%, transparent)',
                    background: 'color-mix(in oklch, hsl(var(--warning)) 8%, transparent)',
                    color: 'var(--ink)',
                  }}
                >
                  Google Calendar disconnected — reconnect to keep auto-join working. Your saved
                  connection stopped refreshing; click Reconnect to sign in with Google again.
                </div>
              )}

              {googleCalendars.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {googleCalendars.map(cal => (
                    <div
                      key={cal.id}
                      className="flex items-center justify-between rounded-lg border border-green-500/40 bg-muted/30 px-4 py-3"
                    >
                      <div className="flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <p className="m-0 text-[13px] font-medium text-foreground">{cal.name}</p>
                          <span className="rounded px-2 py-0.5 text-[10px] font-semibold text-green-600 dark:text-green-400 bg-green-500/15">
                            ✓ Connected
                          </span>
                        </div>
                        <p className="m-0 text-[11px] text-muted-foreground">📧 {cal.email}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDisconnectGoogleCalendar(cal.id)}
                        className="ml-3 cursor-pointer border-none bg-transparent p-1 text-destructive hover:opacity-90"
                        title="Disconnect this calendar"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="p-3 text-center text-xs text-muted-foreground">
                  No calendars connected. Click &quot;Add Calendar&quot; to get started.
                </p>
              )}
            </div>

            {/* Email summaries */}
            <div className="rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-1 items-center gap-3">
                  <Mail size={32} className="shrink-0 text-orange-500" />
                  <div>
                    <h3 className="mb-1 text-[15px] font-semibold text-foreground">Email summaries</h3>
                    <p className="text-[13px] text-muted-foreground">
                      Get the summary, decisions and action items in your inbox when a meeting finishes processing.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => handleToggleEmailSummaries(profile?.email_summaries_enabled === false)}
                  disabled={savingEmailPref}
                  className="border-border"
                >
                  {savingEmailPref ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {profile?.email_summaries_enabled === false ? 'Turn on' : 'Turn off'}
                </Button>
              </div>
            </div>

          </div>
        )}

        {/* Security Tab */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            {/* Change Password */}
            <div className="rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm">
              <h3 className="mb-4 text-[15px] font-semibold text-foreground">Change Password</h3>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="mb-2 block text-[13px] font-medium text-foreground">New Password</label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={10}
                    className="border-border bg-background text-foreground"
                  />
                  <p className="mt-1.5 text-[12px] text-muted-foreground">
                    At least 10 characters with letters and numbers
                  </p>
                </div>
                <div>
                  <label className="mb-2 block text-[13px] font-medium text-foreground">Confirm Password</label>
                  <Input
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    className="border-border bg-background text-foreground"
                  />
                </div>
                <Button
                  onClick={handleChangePassword}
                  disabled={changingPassword}
                  className="bg-orange-500 text-white hover:bg-orange-600"
                >
                  {changingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Update Password
                </Button>
              </div>
            </div>

            {/* Sign Out */}
            <div className="rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm">
              <h3 className="mb-2 text-[15px] font-semibold text-foreground">Sign Out</h3>
              <p className="mb-4 text-[13px] text-muted-foreground">Sign out of your account on this device</p>
              <Button variant="outline" onClick={handleSignOut} className="border-border text-foreground hover:bg-muted">
                <LogOut size={14} className="mr-2" />
                Sign Out
              </Button>
            </div>

            {/* Export — the DPDP portability right the privacy policy promises. */}
            <ExportDataCard />

            {/* Delete Account */}
            <div className="rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm">
              <h3 className="mb-2 text-[15px] font-semibold text-foreground">Delete Account</h3>
              <p className="mb-4 text-[13px] text-muted-foreground">
                Permanently delete your account and all associated data. This action cannot be undone.
              </p>
              <Button
                variant="outline"
                onClick={() => setDeleteDialogOpen(true)}
                className="border-destructive text-destructive hover:bg-destructive/10"
              >
                <Trash2 size={14} className="mr-2" />
                Delete Account
              </Button>
            </div>

            {/* Delete Account Confirmation Dialog */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="text-destructive">Delete Account</DialogTitle>
                  <DialogDescription className="text-muted-foreground">
                    This will permanently delete your account, all meetings, transcripts, and data. This cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <div className="my-5">
                  <p className="mb-2 text-[13px] text-foreground">
                    Type <strong>DELETE</strong> to confirm:
                  </p>
                  <Input
                    value={deleteConfirmation}
                    onChange={(e) => setDeleteConfirmation(e.target.value)}
                    placeholder="Type DELETE"
                    className="border-border bg-background text-foreground"
                  />
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDeleteDialogOpen(false);
                      setDeleteConfirmation('');
                    }}
                    className="border-border text-muted-foreground hover:bg-muted"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleDeleteAccount}
                    disabled={deletingAccount || deleteConfirmation !== 'DELETE'}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                  >
                    {deletingAccount ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Delete Account
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* Developer Tab */}
        {activeTab === 'billing' && <BillingCard />}

        {/* Developer Tab */}
        {activeTab === 'developer' && <ApiTokensCard />}
      </div>
    </DashboardLayout>
  );
}
