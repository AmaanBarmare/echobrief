import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Copy, Loader2, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ApiToken {
  id: string;
  name: string;
  token_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

const MCP_URL = 'https://www.echobrief.in/api/mcp';

export function ApiTokensCard() {
  const { toast } = useToast();
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [plaintext, setPlaintext] = useState<string | null>(null);

  const call = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('manage-api-tokens', { body });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await call({ action: 'list' });
      setTokens(data.tokens ?? []);
    } catch (err) {
      toast({ title: 'Could not load tokens', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [call, toast]);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const data = await call({ action: 'create', name: newName.trim() });
      setPlaintext(data.token);
      setNewName('');
      await refresh();
    } catch (err) {
      toast({ title: 'Could not create token', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await call({ action: 'revoke', id });
      await refresh();
      toast({ title: 'Token revoked' });
    } catch (err) {
      toast({ title: 'Could not revoke token', description: (err as Error).message, variant: 'destructive' });
    }
  };

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast({ title: 'Copied to clipboard' });
  };

  const active = tokens.filter((t) => !t.revoked_at);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <div className="mb-1 flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-foreground">Access tokens</h2>
          <Button size="sm" onClick={() => { setPlaintext(null); setDialogOpen(true); }}>
            <Plus className="mr-1.5 h-4 w-4" />
            New token
          </Button>
        </div>
        <p className="mb-5 text-[13px]" style={{ color: 'var(--ink-mid)' }}>
          Connect Claude, Cursor or any MCP client to your meetings. A token is shown once and
          can be revoked at any time.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--ink-mid)' }}>
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : active.length === 0 ? (
          <p className="text-[13px]" style={{ color: 'var(--ink-soft)' }}>
            No active tokens.
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--rule)' }}>
            {active.map((token) => (
              <li key={token.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-foreground">{token.name}</p>
                  <p className="text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
                    <code>{token.token_prefix}…</code>
                    {' · created '}{new Date(token.created_at).toLocaleDateString()}
                    {' · '}
                    {token.last_used_at
                      ? `last used ${new Date(token.last_used_at).toLocaleDateString()}`
                      : 'never used'}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => void handleRevoke(token.id)}>
                  <Trash2 className="h-4 w-4" />
                  <span className="sr-only">Revoke {token.name}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-foreground">Connect a client</h2>
        <p className="mb-3 text-[13px]" style={{ color: 'var(--ink-mid)' }}>
          Claude Code — run this in your terminal, with your token in place of <code>YOUR_TOKEN</code>:
        </p>
        <pre className="mb-5 overflow-x-auto rounded-lg bg-muted p-3 text-[12.5px] text-foreground">
{`claude mcp add --transport http echobrief ${MCP_URL} \\
  --header "Authorization: Bearer YOUR_TOKEN"`}
        </pre>
        <p className="mb-3 text-[13px]" style={{ color: 'var(--ink-mid)' }}>
          Claude Desktop or Cursor — add this to your MCP config file:
        </p>
        <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-[12.5px] text-foreground">
{`{
  "mcpServers": {
    "echobrief": {
      "type": "http",
      "url": "${MCP_URL}",
      "headers": { "Authorization": "Bearer YOUR_TOKEN" }
    }
  }
}`}
        </pre>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{plaintext ? 'Copy your token' : 'New access token'}</DialogTitle>
            <DialogDescription>
              {plaintext
                ? 'This is the only time this token will be shown. Copy it now — if you lose it, revoke it and create another.'
                : 'Give the token a name so you can recognise it later.'}
            </DialogDescription>
          </DialogHeader>

          {plaintext ? (
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-lg bg-muted p-3 text-[12.5px] text-foreground">
                {plaintext}
              </code>
              <Button size="sm" onClick={() => void copy(plaintext)}>
                <Copy className="h-4 w-4" />
                <span className="sr-only">Copy token</span>
              </Button>
            </div>
          ) : (
            <Input
              value={newName}
              maxLength={60}
              placeholder="Claude Code on my laptop"
              onChange={(e) => setNewName(e.target.value)}
            />
          )}

          <DialogFooter>
            {plaintext ? (
              <Button onClick={() => { setPlaintext(null); setDialogOpen(false); }}>Done</Button>
            ) : (
              <Button disabled={creating || !newName.trim()} onClick={() => void handleCreate()}>
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create token
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
