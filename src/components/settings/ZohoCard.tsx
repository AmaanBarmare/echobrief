/**
 * Connect Zoho CRM and see whether the grant still works.
 *
 * EchoBrief writes ONE note per meeting onto the Contact or Lead whose email
 * matches an external attendee. It never creates records and never edits a
 * field — a CRM is a sales team's system of record, and an integration that
 * invents rows in it gets switched off within a week.
 *
 * The "Test connection" button exists because a Zoho grant can die quietly:
 * tokens are datacentre-bound, refresh tokens can be revoked from Zoho's side,
 * and the first sign would otherwise be a meeting that failed to sync hours
 * later, with nobody watching.
 */
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Building2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface ZohoStatus {
  connected: boolean;
  org_name?: string | null;
  location?: string | null;
  needs_reconnect?: boolean;
  last_synced_at?: string | null;
}

export function ZohoCard() {
  const { session } = useAuth();
  const { toast } = useToast();
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

  const [status, setStatus] = useState<ZohoStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);

  const callZoho = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('manage-zoho', { body });
    if (error) throw new Error((data as any)?.error || error.message);
    if ((data as any)?.error) throw new Error((data as any).error);
    return data as any;
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await callZoho({ action: 'status' }));
    } catch {
      setStatus({ connected: false });
    }
  }, [callZoho]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('zoho_connected') === '1') {
      toast({ title: 'Zoho CRM connected', description: 'Meeting notes will be written to matching contacts.' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = async () => {
    if (!session?.access_token) {
      toast({ title: 'Sign in first', description: 'Please sign in to connect Zoho.', variant: 'destructive' });
      return;
    }
    setConnecting(true);
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/zoho-oauth-start`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ returnTo: '/settings?tab=integrations', origin: window.location.origin }),
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      if (data.authUrl) window.location.href = data.authUrl;
    } catch (error: any) {
      toast({ title: 'Could not connect Zoho', description: error.message, variant: 'destructive' });
      setConnecting(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const data = await callZoho({ action: 'test' });
      toast({
        title: 'Zoho connection is healthy',
        description: `Talking to ${String(data.api_domain || '').replace('https://', '')}.`,
      });
      await loadStatus();
    } catch (error: any) {
      toast({ title: 'Zoho check failed', description: error.message, variant: 'destructive' });
      await loadStatus();
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await callZoho({ action: 'disconnect' });
      setStatus({ connected: false });
      toast({ title: 'Zoho CRM disconnected' });
    } catch (error: any) {
      toast({ title: 'Could not disconnect', description: error.message, variant: 'destructive' });
    }
  };

  const connected = !!status?.connected;

  return (
    <div className="rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex flex-1 items-center gap-3">
          <Building2 size={32} className="shrink-0 text-ember" />
          <div>
            <h3 className="mb-1 text-[15px] font-semibold text-foreground">Zoho CRM</h3>
            <p className="text-[13px] text-muted-foreground">
              After a meeting, EchoBrief adds a note to the contact or lead whose email was on
              the invite — summary, decisions, action items and next steps.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {connected && (
            <Button variant="outline" onClick={handleDisconnect} title="Remove EchoBrief's access to your Zoho CRM">
              Disconnect
            </Button>
          )}
          <Button
            onClick={handleConnect}
            disabled={connecting}
            className="bg-ember text-white hover:bg-ember-deep"
          >
            {connecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {connected ? 'Reconnect' : 'Connect Zoho'}
          </Button>
        </div>
      </div>

      {status?.needs_reconnect && (
        <div
          role="alert"
          className="mb-4 rounded-md px-4 py-3 text-[13px]"
          style={{
            border: '1px solid color-mix(in oklch, hsl(var(--warning)) 35%, transparent)',
            background: 'color-mix(in oklch, hsl(var(--warning)) 8%, transparent)',
            color: 'var(--ink)',
          }}
        >
          Zoho rejected the saved connection — reconnect to resume writing meeting notes.
        </div>
      )}

      {connected ? (
        <div className="flex flex-col gap-3 rounded-lg border border-success/40 bg-muted/30 px-4 py-3">
          <p className="m-0 text-[13px] font-medium text-foreground">
            {status?.org_name ? `Connected to ${status.org_name}` : 'Zoho CRM connected'}
            <span className="ml-2 rounded px-2 py-0.5 text-[10px] font-semibold text-success dark:text-success bg-success/15">
              ✓ Connected
            </span>
          </p>
          <p className="m-0 text-[12px] text-muted-foreground">
            {status?.last_synced_at
              ? `Last note written ${new Date(status.last_synced_at).toLocaleString()}.`
              : 'No notes written yet. A note is added when a meeting has an external attendee who exists in your CRM.'}
          </p>
          <div>
            <Button variant="outline" onClick={handleTest} disabled={testing}>
              {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Test connection
            </Button>
          </div>
          <p className="m-0 text-[11px] text-muted-foreground">
            EchoBrief only adds notes. It never creates contacts, never edits fields, and never
            sends the transcript or recording.
          </p>
        </div>
      ) : (
        <p className="p-3 text-center text-xs text-muted-foreground">
          Not connected. Click &quot;Connect Zoho&quot; to write meeting notes back to your CRM.
        </p>
      )}
    </div>
  );
}
