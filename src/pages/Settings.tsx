import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { BotCustomization } from '@/components/dashboard/BotCustomization';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Lock, Mail, Bell, LogOut, X, Trash2, Calendar, MessageCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { displayNameFromUserMetadata } from '@/lib/userDisplayName';

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  google_calendar_connected: boolean;
  slack_connected: boolean;
  slack_channel_id: string | null;
  slack_channel_name: string | null;
  auto_join_meetings: boolean;
  recording_preference: 'audio_only' | 'audio_video';
}

interface GoogleCalendar {
  id: string;
  email: string;
  name: string;
  is_primary: boolean;
  connected_at: string;
}

type SettingsTab = 'account' | 'bot' | 'integrations' | 'security';

export default function Settings() {
  const { user, session } = useAuth();
  const { toast } = useToast();
  
  // Get initial tab from URL params
  const getInitialTab = (): SettingsTab => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam === 'integrations' || tabParam === 'bot' || tabParam === 'security') {
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

  // Security settings
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Integrations
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [connectingSlack, setConnectingSlack] = useState(false);
  const [slackChannelId, setSlackChannelId] = useState('');
  const [slackChannelName, setSlackChannelName] = useState('');
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
        const fromProfile = (profileData.full_name || '').trim();
        const resolvedName = fromProfile || fromAuthMeta;
        setFullName(resolvedName);

        if (!fromProfile && resolvedName) {
          await supabase
            .from('profiles')
            .update({ full_name: resolvedName })
            .eq('user_id', user.id);
        }
        setSlackChannelId(profileData.slack_channel_id || '');
        setSlackChannelName(profileData.slack_channel_name || '');
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
    if (newPassword.length < 6) {
      toast({ title: 'Error', description: 'Password must be at least 6 characters.', variant: 'destructive' });
      return;
    }
    setChangingPassword(true);
    try {
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
      // Delete user account
      const { error } = await supabase.auth.admin.deleteUser(user?.id || '');
      if (error) throw error;

      // Sign out
      await supabase.auth.signOut();
      toast({ title: 'Account deleted', description: 'Your account has been permanently deleted.' });
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
  }, [user]);

  const handleConnectSlack = async () => {
    if (!user || !slackChannelId.trim()) return;
    setConnectingSlack(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          slack_connected: true,
          slack_channel_id: slackChannelId.trim(),
          slack_channel_name: slackChannelName.trim() || slackChannelId.trim(),
        })
        .eq('user_id', user.id);

      if (error) throw error;
      setProfile(prev => prev ? { ...prev, slack_connected: true, slack_channel_id: slackChannelId, slack_channel_name: slackChannelName } : null);
      toast({ title: 'Connected!', description: 'Slack integration is now active.' });
      setSlackChannelId('');
      setSlackChannelName('');
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setConnectingSlack(false);
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
      setProfile(prev => prev ? { ...prev, google_calendar_connected: false } : null);
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
    { id: 'security' as const, label: 'Security', icon: '🔒' },
  ];

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl px-6 py-8 md:px-10 md:py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-[-0.02em] text-foreground" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Settings
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage your account, integrations, and preferences
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-8 flex gap-2 border-b border-border">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={`border-b-2 px-4 py-3 text-[13px] transition-colors ${
                activeTab === tab.id
                  ? 'border-orange-500 font-semibold text-orange-600 dark:text-orange-400'
                  : 'border-transparent font-medium text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
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
                <Button
                  onClick={handleConnectGoogle}
                  disabled={connectingGoogle}
                  className="bg-orange-500 text-white hover:bg-orange-600"
                >
                  {connectingGoogle ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Add Calendar
                </Button>
              </div>

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

            {/* Slack */}
            <div className="rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <MessageCircle size={32} className="shrink-0 text-[#E01E5A]" />
                <h3 className="text-[15px] font-semibold text-foreground">Slack</h3>
              </div>
              {!profile?.slack_connected ? (
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="mb-2 block text-[13px] font-medium text-foreground">Slack Channel ID</label>
                    <Input
                      value={slackChannelId}
                      onChange={(e) => setSlackChannelId(e.target.value)}
                      placeholder="e.g., C0123456789"
                      className="border-border bg-background text-foreground"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-[13px] font-medium text-foreground">Channel Name (optional)</label>
                    <Input
                      value={slackChannelName}
                      onChange={(e) => setSlackChannelName(e.target.value)}
                      placeholder="e.g., #meetings"
                      className="border-border bg-background text-foreground"
                    />
                  </div>
                  <Button
                    onClick={handleConnectSlack}
                    disabled={connectingSlack || !slackChannelId.trim()}
                    className="bg-orange-500 text-white hover:bg-orange-600"
                  >
                    {connectingSlack ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Connect
                  </Button>
                </div>
              ) : (
                <div>
                  <p className="mb-3 text-[13px] text-green-600 dark:text-green-400">
                    ✓ Connected to {profile.slack_channel_name || profile.slack_channel_id}
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setProfile(prev => (prev ? { ...prev, slack_connected: false } : null))}
                    className="border-border text-muted-foreground hover:bg-muted"
                  >
                    Disconnect
                  </Button>
                </div>
              )}
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
                    className="border-border bg-background text-foreground"
                  />
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
      </div>
    </DashboardLayout>
  );
}
