import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { BotCustomization } from '@/components/dashboard/BotCustomization';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Lock, Mail, Bell, LogOut } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  google_calendar_connected: boolean;
  slack_connected: boolean;
  slack_channel_id: string | null;
  slack_channel_name: string | null;
}

type SettingsTab = 'account' | 'bot' | 'integrations' | 'security';

export default function Settings() {
  const { user, session } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');
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

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

  useEffect(() => {
    if (!user) return;

    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (!error && data) {
        setProfile(data as Profile);
        setFullName(data.full_name || '');
        setSlackChannelId(data.slack_channel_id || '');
        setSlackChannelName(data.slack_channel_name || '');
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
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName })
        .eq('user_id', user.id);

      if (error) throw error;
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
        body: JSON.stringify({ returnTo: '/settings', origin: window.location.origin }),
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);
      if (data.authUrl) window.location.href = data.authUrl;
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setConnectingGoogle(false);
    }
  };

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

  const tabs = [
    { id: 'account' as const, label: 'Account', icon: '👤' },
    { id: 'bot' as const, label: 'Bot', icon: '🤖' },
    { id: 'integrations' as const, label: 'Integrations', icon: '🔗' },
    { id: 'security' as const, label: 'Security', icon: '🔒' },
  ];

  return (
    <DashboardLayout>
      <div className="px-8 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground" style={{ fontFamily: 'Outfit, sans-serif', letterSpacing: '-0.02em' }}>
            Settings
          </h1>
          <p className="text-sm mt-2" style={{ color: '#A8A29E' }}>
            Manage your account, integrations, and preferences
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 32, borderBottom: '1px solid #292524' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '12px 16px',
                fontSize: 13,
                fontWeight: activeTab === tab.id ? 600 : 500,
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid #F97316' : 'none',
                color: activeTab === tab.id ? '#FB923C' : '#78716C',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Account Tab */}
        {activeTab === 'account' && (
          <div className="space-y-6">
            {/* Profile */}
            <div style={{ background: '#1C1917', border: '1px solid #292524', borderRadius: 16, padding: 24 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: '#FAFAF9', marginBottom: 16 }}>Profile Information</h2>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#FAFAF9', marginBottom: 8 }}>
                  Full Name
                </label>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  style={{ background: '#1C1917', border: '1px solid #292524', color: '#FAFAF9' }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#FAFAF9', marginBottom: 8 }}>
                  Email
                </label>
                <Input
                  disabled
                  value={user?.email || ''}
                  style={{ background: '#1C1917', border: '1px solid #292524', color: '#78716C' }}
                />
              </div>
              <Button onClick={handleSaveProfile} disabled={saving} style={{ background: '#FB923C', color: 'white' }}>
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
            <div style={{ background: '#1C1917', border: '1px solid #292524', borderRadius: 16, padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                  {/* Google Calendar Icon */}
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="2" y="3" width="20" height="20" rx="2" fill="#4285F4" />
                    <rect x="3" y="3" width="18" height="4" fill="#FFFFFF" />
                    <line x1="8" y1="8" x2="8" y2="21" stroke="#FFFFFF" strokeWidth="1" />
                    <line x1="16" y1="8" x2="16" y2="21" stroke="#FFFFFF" strokeWidth="1" />
                    <rect x="3" y="12" width="18" height="1" fill="#E8E8E8" />
                  </svg>
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 600, color: '#FAFAF9', marginBottom: 4 }}>Google Calendar</h3>
                    <p style={{ fontSize: 13, color: '#78716C' }}>
                      Automatically detect and record meetings from your calendar
                    </p>
                  </div>
                </div>
                {profile?.google_calendar_connected ? (
                  <Button
                    onClick={handleDisconnectGoogle}
                    style={{ background: 'transparent', border: '1px solid #292524', color: '#A8A29E' }}
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    onClick={handleConnectGoogle}
                    disabled={connectingGoogle}
                    style={{ background: '#FB923C', color: 'white' }}
                  >
                    {connectingGoogle ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Connect
                  </Button>
                )}
              </div>
              {profile?.google_calendar_connected && (
                <p style={{ fontSize: 12, color: '#22C55E', marginTop: 12 }}>✓ Connected</p>
              )}
            </div>

            {/* Slack */}
            <div style={{ background: '#1C1917', border: '1px solid #292524', borderRadius: 16, padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                {/* Slack Icon */}
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <g clipPath="url(#clip0)">
                    <path d="M5.042 15.165a2.528 2.528 0 01-2.52 2.52H2.281a2.528 2.528 0 010-5.056h2.241a2.528 2.528 0 012.52 2.536z" fill="#E01E5A" />
                    <path d="M6.604 15.165a2.528 2.528 0 015.056 0v2.241a2.528 2.528 0 01-5.056 2.52v-4.761z" fill="#E01E5A" />
                    <path d="M6.604 5.042a2.528 2.528 0 01-2.52-2.52V2.281a2.528 2.528 0 015.056 0v2.241a2.528 2.528 0 01-2.536 2.52z" fill="#36C5F0" />
                    <path d="M6.604 6.604a2.528 2.528 0 000 5.056h4.761a2.528 2.528 0 002.52-2.52 2.528 2.528 0 00-2.52-2.536H6.604z" fill="#36C5F0" />
                    <path d="M16.727 6.604a2.528 2.528 0 012.52-2.52h2.241a2.528 2.528 0 010 5.056h-2.241a2.528 2.528 0 01-2.52-2.536z" fill="#2EB67D" />
                    <path d="M15.165 6.604a2.528 2.528 0 01-5.056 0v-4.761a2.528 2.528 0 015.056-2.52v4.761a2.528 2.528 0 010 2.52z" fill="#2EB67D" />
                    <path d="M15.165 16.727a2.528 2.528 0 010 5.056H10.404a2.528 2.528 0 01-2.52-2.52 2.528 2.528 0 012.52-2.536h4.761z" fill="#ECB22E" />
                    <path d="M16.727 15.165a2.528 2.528 0 015.056 0v4.761a2.528 2.528 0 01-5.056 2.52v-4.761a2.528 2.528 0 010-2.52z" fill="#ECB22E" />
                  </g>
                </svg>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: '#FAFAF9' }}>Slack</h3>
              </div>
              {!profile?.slack_connected ? (
                <div style={{ display: 'flex', gap: 12, flexDirection: 'column' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#FAFAF9', marginBottom: 8 }}>
                      Slack Channel ID
                    </label>
                    <Input
                      value={slackChannelId}
                      onChange={(e) => setSlackChannelId(e.target.value)}
                      placeholder="e.g., C0123456789"
                      style={{ background: '#1C1917', border: '1px solid #292524', color: '#FAFAF9' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#FAFAF9', marginBottom: 8 }}>
                      Channel Name (optional)
                    </label>
                    <Input
                      value={slackChannelName}
                      onChange={(e) => setSlackChannelName(e.target.value)}
                      placeholder="e.g., #meetings"
                      style={{ background: '#1C1917', border: '1px solid #292524', color: '#FAFAF9' }}
                    />
                  </div>
                  <Button
                    onClick={handleConnectSlack}
                    disabled={connectingSlack || !slackChannelId.trim()}
                    style={{ background: '#FB923C', color: 'white' }}
                  >
                    {connectingSlack ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    Connect
                  </Button>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: 13, color: '#22C55E', marginBottom: 12 }}>✓ Connected to {profile.slack_channel_name || profile.slack_channel_id}</p>
                  <Button
                    onClick={() => setProfile(prev => prev ? { ...prev, slack_connected: false } : null)}
                    style={{ background: 'transparent', border: '1px solid #292524', color: '#A8A29E' }}
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
            <div style={{ background: '#1C1917', border: '1px solid #292524', borderRadius: 16, padding: 24 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: '#FAFAF9', marginBottom: 16 }}>Change Password</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#FAFAF9', marginBottom: 8 }}>
                    New Password
                  </label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    style={{ background: '#1C1917', border: '1px solid #292524', color: '#FAFAF9' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#FAFAF9', marginBottom: 8 }}>
                    Confirm Password
                  </label>
                  <Input
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    style={{ background: '#1C1917', border: '1px solid #292524', color: '#FAFAF9' }}
                  />
                </div>
                <Button
                  onClick={handleChangePassword}
                  disabled={changingPassword}
                  style={{ background: '#FB923C', color: 'white' }}
                >
                  {changingPassword ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Update Password
                </Button>
              </div>
            </div>

            {/* Sign Out */}
            <div style={{ background: '#1C1917', border: '1px solid #292524', borderRadius: 16, padding: 24 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: '#FAFAF9', marginBottom: 8 }}>Sign Out</h3>
              <p style={{ fontSize: 13, color: '#78716C', marginBottom: 16 }}>Sign out of your account on this device</p>
              <Button
                onClick={handleSignOut}
                style={{ background: 'transparent', border: '1px solid #EF4444', color: '#EF4444' }}
              >
                <LogOut size={14} className="mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
