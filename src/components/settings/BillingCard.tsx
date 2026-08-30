import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { CreditCard, ExternalLink, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface BillingProfile {
  subscription_status: string;
  subscription_renews_at: string | null;
  dodo_customer_id: string | null;
}

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

  const refresh = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('subscription_status, subscription_renews_at, dodo_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (data) setProfile(data);
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
          EchoBrief Pro — unlimited meeting bots, transcription and AI summaries.
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
      </div>
    </div>
  );
}
