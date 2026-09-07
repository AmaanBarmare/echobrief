import { useEffect, useState } from 'react';
import { SectionTabs } from '@/components/ui/SectionTabs';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { BotCustomization } from '@/components/dashboard/BotCustomization';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { displayNameFromUserMetadata } from '@/lib/userDisplayName';
import { ApiTokensCard } from '@/components/settings/ApiTokensCard';
import { BillingCard } from '@/components/settings/BillingCard';
import { AccountPanel } from '@/components/settings/AccountPanel';
import { IntegrationsPanel } from '@/components/settings/IntegrationsPanel';
import { SecurityPanel } from '@/components/settings/SecurityPanel';
import type { Profile } from '@/components/settings/types';

/**
 * The settings shell: which tab is showing, and the one profile read they all
 * depend on.
 *
 * This file was 1,217 lines — six tabs' worth of forms, twenty-five pieces of
 * state and nineteen handlers in a single component. It was the file every new
 * setting had to land in, and the reason none of them could be added quickly.
 * Each tab is now its own panel; what stays here is the routing and the profile
 * fetch, because more than one panel needs the profile and fetching it twice
 * would be worse than passing it down.
 *
 * Deliberately still on local state rather than TanStack Query: this is a form
 * page with write-on-load side effects (it creates a missing profile row) and
 * user-mutated lists, which is a poor fit for read-caching. See
 * docs/engineering-notes.md #21.
 */

type SettingsTab = 'account' | 'bot' | 'integrations' | 'billing' | 'security' | 'developer';

const TABS = [
  { id: 'account' as const, label: 'Account', icon: '👤' },
  { id: 'bot' as const, label: 'Bot', icon: '🤖' },
  { id: 'integrations' as const, label: 'Integrations', icon: '🔗' },
  { id: 'billing' as const, label: 'Billing', icon: '💳' },
  { id: 'security' as const, label: 'Security', icon: '🔒' },
  { id: 'developer' as const, label: 'Developer', icon: '⌘' },
];

export default function Settings() {
  const { user } = useAuth();

  const getInitialTab = (): SettingsTab => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (
      tabParam === 'integrations' || tabParam === 'bot' || tabParam === 'billing' ||
      tabParam === 'security' || tabParam === 'developer'
    ) {
      return tabParam as SettingsTab;
    }
    return 'account';
  };

  const [activeTab, setActiveTab] = useState<SettingsTab>(getInitialTab());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchProfile = async () => {
      // Fresh user from the Auth API: the JWT in memory can lag behind a display
      // name edited on the Dashboard.
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
        setProfile(null);
      } else if (profileData) {
        const fromProfile = (profileData.full_name || '').trim();
        const resolvedName = fromProfile || fromAuthMeta;
        setProfile({ ...(profileData as Profile), full_name: resolvedName || null });

        if (!fromProfile && resolvedName) {
          await supabase
            .from('profiles')
            .update({ full_name: resolvedName })
            .eq('user_id', user.id);
        }
      } else {
        setProfile(null);
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

      setLoading(false);
    };

    fetchProfile();
  }, [user]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[960px] px-4 py-6 sm:px-6 md:px-8 md:py-10">
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

        <SectionTabs
          label="Settings sections"
          tabs={TABS}
          value={activeTab}
          onChange={(tabId: SettingsTab) => setActiveTab(tabId)}
        />

        {activeTab === 'account' && <AccountPanel profile={profile} setProfile={setProfile} />}

        {activeTab === 'bot' && (
          <div>
            {user && <BotCustomization user_id={user.id} />}
          </div>
        )}

        {activeTab === 'integrations' && (
          <IntegrationsPanel profile={profile} setProfile={setProfile} />
        )}

        {activeTab === 'billing' && <BillingCard />}

        {activeTab === 'security' && <SecurityPanel />}

        {activeTab === 'developer' && <ApiTokensCard />}
      </div>
    </DashboardLayout>
  );
}
