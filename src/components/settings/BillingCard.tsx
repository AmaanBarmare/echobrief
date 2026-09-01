import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { CreditCard, ExternalLink, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatHours, PLANS, periodStart, planForProfile } from '@/lib/plans';

interface BillingProfile {
  subscription_status: string;
  subscription_renews_at: string | null;
  dodo_customer_id: string | null;
  plan_override: string | null;
}

interface Usage {
  meetings: number;
  seconds: number;
}

// `usage_events` and `profiles.plan_override` post-date the generated types in
// src/integrations/supabase/types.ts. Same escape hatch Contacts.tsx uses for
// `contacts`; regenerating the types is a separate chore.
const db = supabase as unknown as SupabaseClient;

const STATUS_LABELS: Record<string, string> = {
  none: 'No subscription',
  active: 'Active',
  on_hold: 'On hold — payment failed',
  paused: 'Paused',
  cancelled: 'Cancelled',
  expired: 'Expired',
  failed: 'Payment failed',
};

export function BillingCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [profile, setProfile] = useState<BillingProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    // Profile and usage in parallel — the meter should not delay the card.
    const [profileResult, usageResult] = await Promise.all([
      db
        .from('profiles')
        .select('subscription_status, subscription_renews_at, dodo_customer_id, plan_override')
        .eq('user_id', user.id)
        .maybeSingle(),
      // RLS scopes this to the caller; the ledger is service-write, user-read.
      db
        .from('usage_events')
        .select('kind, seconds')
        .eq('user_id', user.id)
        .gte('occurred_at', periodStart()),
    ]);
    if (profileResult.data) setProfile(profileResult.data as BillingProfile);
    const rows = (usageResult.data ?? []) as Array<{ kind: string; seconds: number }>;
    setUsage({
      meetings: rows.filter((r) => r.kind === 'meeting_started').length,
      seconds: rows
        .filter((r) => r.kind === 'meeting_recorded')
        .reduce((total, r) => total + (r.seconds || 0), 0),
    });
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (searchParams.get('checkout') === 'success') {
      toast({
        title: 'Payment received',
        description: 'Your subscription will activate in a moment.',
      });
      searchParams.delete('checkout');
      setSearchParams(searchParams, { replace: true });
      // The webhook lands async; give it a beat, then re-read.
      const timer = setTimeout(refresh, 4000);
      return () => clearTimeout(timer);
    }
  }, [searchParams, setSearchParams, toast, refresh]);

  const invoke = useCallback(async (action: 'checkout' | 'portal') => {
    setWorking(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-billing', {
        body: { action },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (data?.url) window.location.href = data.url;
    } catch (err) {
      toast({
        title: 'Billing error',
        description: err instanceof Error ? err.message : 'Something went wrong',
        variant: 'destructive',
      });
      setWorking(false);
    }
  }, [toast]);

  const status = profile?.subscription_status ?? 'none';
  const isActive = status === 'active';
  const limits = PLANS[planForProfile(profile)];
  // Free plans are metered by meeting count, paid plans by recorded hours.
  const usedFraction = limits.meetingsPerPeriod !== null
    ? (usage?.meetings ?? 0) / limits.meetingsPerPeriod
    : (usage?.seconds ?? 0) / (limits.includedSeconds || 1);
  const allowanceLabel = limits.meetingsPerPeriod !== null
    ? `${usage?.meetings ?? 0} of ${limits.meetingsPerPeriod} meetings`
    : `${formatHours(usage?.seconds ?? 0)} of ${formatHours(limits.includedSeconds || 0)} hours`;
  const renewsAt = profile?.subscription_renews_at
    ? new Date(profile.subscription_renews_at).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <CreditCard className="h-4 w-4" style={{ color: 'var(--ink-mid)' }} />
          <h2 className="text-base font-semibold text-foreground">Subscription</h2>
        </div>
        <p className="mb-5 text-[13px]" style={{ color: 'var(--ink-mid)' }}>
          Meeting bots, transcription in 22 Indian languages, and AI summaries.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--ink-mid)' }}>
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[14px] font-medium text-foreground">
                {STATUS_LABELS[status] ?? status}
              </p>
              {isActive && renewsAt && (
                <p className="text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
                  Renews on {renewsAt}
                </p>
              )}
              {status === 'cancelled' && renewsAt && (
                <p className="text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
                  Access until {renewsAt}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {profile?.dodo_customer_id && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={working}
                  onClick={() => invoke('portal')}
                >
                  <ExternalLink className="mr-1.5 h-4 w-4" />
                  Manage billing
                </Button>
              )}
              {!isActive && (
                <Button size="sm" disabled={working} onClick={() => invoke('checkout')}>
                  {working && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Subscribe
                </Button>
              )}
            </div>
          </div>
        )}

        {!loading && usage && (
          <div className="mt-5 border-t border-border pt-5">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-medium text-foreground">
                {limits.label} plan — this month
              </span>
              <span className="text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
                {allowanceLabel}
              </span>
            </div>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full"
              style={{ background: 'var(--paper-deep)' }}
              role="progressbar"
              aria-valuenow={Math.round(usedFraction * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Plan usage this month"
            >
              <div
                className="h-full rounded-full transition-[width]"
                style={{
                  width: `${Math.min(100, usedFraction * 100)}%`,
                  background: usedFraction >= 1 ? 'var(--stop)' : 'var(--ember)',
                }}
              />
            </div>
            <p className="mt-2 text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
              Meetings are capped at {Math.round(limits.maxMeetingSeconds / 60)} minutes each,
              and content is kept for {limits.retentionDays} days.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
