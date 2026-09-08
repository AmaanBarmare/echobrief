/**
 * Connect a Slack workspace and choose where meeting summaries land.
 *
 * The channel is picked from a list the connected bot token can actually post
 * to — never typed. The Slack integration removed in 2026-08 asked users to
 * paste a raw channel ID, which made a typo indistinguishable from a working
 * configuration until a meeting silently failed to deliver. It also had a
 * Disconnect button that never wrote to the database; here "connected" is the
 * existence of a `slack_connections` row, and Disconnect deletes it, so the two
 * cannot disagree.
 *
 * Connecting the workspace and choosing a channel are two separate steps on
 * purpose: until a channel is chosen nothing is posted, because there is no
 * safe default — posting into #general uninvited is how an app gets removed.
 */
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Hash, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface SlackStatus {
  connected: boolean;
  team_name?: string | null;
  channel_id?: string | null;
  channel_name?: string | null;
  needs_reconnect?: boolean;
}

interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
}

export function SlackCard() {
  const { session } = useAuth();
  const { toast } = useToast();
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

  const [status, setStatus] = useState<SlackStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [channels, setChannels] = useState<SlackChannel[] | null>(null);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [saving, setSaving] = useState(false);

  const callSlack = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('manage-slack', { body });
    if (error) {
      // The function returns its reason in the body even on a 4xx, and that
      // reason ("invite the app to the channel") is the only actionable part.
      const detail = (data as any)?.error;
      throw new Error(detail || error.message);
    }
    if ((data as any)?.error) throw new Error((data as any).error);
    return data as any;
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await callSlack({ action: 'status' }));
    } catch {
      // A status read that fails must not break the rest of the tab.
      setStatus({ connected: false });
    }
  }, [callSlack]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  // The redirect lands back here with slack_connected=1; the workspace is
  // connected but no channel is chosen yet, so open the picker straight away.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('slack_connected') === '1') {
      toast({ title: 'Slack connected', description: 'Pick the channel summaries should go to.' });
      void loadChannels();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = async () => {
    if (!session?.access_token) {
      toast({ title: 'Sign in first', description: 'Please sign in to connect Slack.', variant: 'destructive' });
      return;
    }
    setConnecting(true);
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/slack-oauth-start`, {
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
      toast({ title: 'Could not connect Slack', description: error.message, variant: 'destructive' });
      setConnecting(false);
    }
  };

  async function loadChannels() {
    setLoadingChannels(true);
    try {
      const data = await callSlack({ action: 'channels' });
      setChannels(data.channels ?? []);
    } catch (error: any) {
      toast({ title: 'Could not list channels', description: error.message, variant: 'destructive' });
      void loadStatus();
    } finally {
      setLoadingChannels(false);
    }
  }

  const handlePick = async (channelId: string) => {
    if (!channelId) return;
    setSaving(true);
    try {
      const data = await callSlack({ action: 'set_channel', channel_id: channelId });
      setStatus(prev => (prev ? { ...prev, channel_id: data.channel_id, channel_name: data.channel_name } : prev));
      toast({ title: 'Channel saved', description: `Summaries will post to #${data.channel_name}.` });
    } catch (error: any) {
      toast({ title: 'Could not save the channel', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await callSlack({ action: 'disconnect' });
      setStatus({ connected: false });
      setChannels(null);
      toast({ title: 'Slack disconnected' });
    } catch (error: any) {
      toast({ title: 'Could not disconnect', description: error.message, variant: 'destructive' });
    }
  };

  const connected = !!status?.connected;

  return (
    <div className="rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex flex-1 items-center gap-3">
          <Hash size={32} className="shrink-0 text-[#4A154B]" />
          <div>
            <h3 className="mb-1 text-[15px] font-semibold text-foreground">Slack</h3>
            <p className="text-[13px] text-muted-foreground">
              Post the summary, decisions and action items to a channel when a meeting finishes.
              The transcript is never sent to Slack.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {connected && (
            <Button variant="outline" onClick={handleDisconnect} title="Remove EchoBrief from your Slack workspace">
              Disconnect
            </Button>
          )}
          <Button
            onClick={handleConnect}
            disabled={connecting}
            className="bg-ember text-white hover:bg-ember-deep"
          >
            {connecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {connected ? 'Reconnect' : 'Connect Slack'}
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
          Slack revoked this app — reconnect to start posting summaries again.
        </div>
      )}

      {connected ? (
        <div className="flex flex-col gap-3 rounded-lg border border-success/40 bg-muted/30 px-4 py-3">
          <p className="m-0 text-[13px] font-medium text-foreground">
            {status?.team_name ? `Connected to ${status.team_name}` : 'Workspace connected'}
            <span className="ml-2 rounded px-2 py-0.5 text-[10px] font-semibold text-success dark:text-success bg-success/15">
              ✓ Connected
            </span>
          </p>

          {status?.channel_name ? (
            <p className="m-0 text-[12px] text-muted-foreground">
              Summaries post to <span className="font-medium text-foreground">#{status.channel_name}</span>.
            </p>
          ) : (
            <p className="m-0 text-[12px] text-muted-foreground">
              No channel chosen yet — nothing will be posted until you pick one.
            </p>
          )}

          {channels ? (
            <div className="flex items-center gap-2">
              <select
                className="h-9 flex-1 rounded-md border border-border bg-background px-2 text-[13px] text-foreground"
                value={status?.channel_id ?? ''}
                disabled={saving}
                onChange={(e) => handlePick(e.target.value)}
                aria-label="Slack channel for meeting summaries"
              >
                <option value="">Choose a channel…</option>
                {channels.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.is_private ? '🔒 ' : '#'}{c.name}
                  </option>
                ))}
              </select>
              {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          ) : (
            <div>
              <Button variant="outline" onClick={loadChannels} disabled={loadingChannels}>
                {loadingChannels ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {status?.channel_name ? 'Change channel' : 'Choose a channel'}
              </Button>
            </div>
          )}

          <p className="m-0 text-[11px] text-muted-foreground">
            Private channels appear here only after you invite EchoBrief to them in Slack.
          </p>
        </div>
      ) : (
        <p className="p-3 text-center text-xs text-muted-foreground">
          Not connected. Click &quot;Connect Slack&quot; to post meeting summaries to a channel.
        </p>
      )}
    </div>
  );
}
