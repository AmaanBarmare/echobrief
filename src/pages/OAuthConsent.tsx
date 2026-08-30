import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Loader2, ShieldAlert } from 'lucide-react';
import { rememberPostLoginRedirect } from '@/lib/postLoginRedirect';

const APPROVE_URL = '/api/oauth/approve';

const SCOPE_COPY: Record<string, string> = {
  read: 'Read your meetings, transcripts, insights and action items',
  'write:action_items': 'Tick and untick your action items',
};

export default function OAuthConsent() {
  const { user, session, loading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState<'approve' | 'deny' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const request = useMemo(() => ({
    client_id: params.get('client_id') ?? '',
    client_name: params.get('client_name') ?? 'An application',
    redirect_uri: params.get('redirect_uri') ?? '',
    code_challenge: params.get('code_challenge') ?? '',
    code_challenge_method: params.get('code_challenge_method') ?? '',
    resource: params.get('resource') ?? '',
    scope: params.get('scope') ?? 'read',
    state: params.get('state') ?? '',
  }), [params]);

  useEffect(() => {
    if (!loading && !user) {
      rememberPostLoginRedirect(`${window.location.pathname}${window.location.search}`);
      navigate('/auth', { replace: true });
    }
  }, [loading, user, navigate]);

  const redirectHost = (() => {
    try { return new URL(request.redirect_uri).host; } catch { return request.redirect_uri; }
  })();
  const isLoopback = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(redirectHost);

  const decide = async (decision: 'approve' | 'deny') => {
    if (!session) return;
    setBusy(decision);
    setError(null);
    try {
      const res = await fetch(APPROVE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ decision, ...request }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.redirect_to) {
        throw new Error(data.error_description ?? data.error ?? `Request failed (${res.status})`);
      }
      window.location.assign(data.redirect_to);
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  const invalid = !request.client_id || !request.redirect_uri || !request.code_challenge;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Connect to EchoBrief</p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">
          {request.client_name} wants access to your meetings
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Signed in as <span className="text-foreground">{user.email}</span>
        </p>

        {invalid ? (
          <p className="mt-6 text-sm text-destructive">
            This authorization link is incomplete. Start again from the app that sent you here.
          </p>
        ) : (
          <>
            <ul className="mt-6 space-y-2 text-sm text-foreground">
              {request.scope.split(' ').filter(Boolean).map((s) => (
                <li key={s} className="flex gap-2">
                  <span className="text-accent">•</span>
                  <span>{SCOPE_COPY[s] ?? s}</span>
                </li>
              ))}
            </ul>

            <div className="mt-6 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
              After you approve, you will be sent to{' '}
              <span className="font-medium text-foreground">{redirectHost}</span>.
              {isLoopback && (
                <span className="mt-2 flex items-start gap-2 text-foreground">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  This is a program running on your own computer. Only approve if you started this connection yourself.
                </span>
              )}
            </div>

            {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

            <div className="mt-6 flex gap-3">
              <Button variant="outline" className="flex-1" disabled={busy !== null} onClick={() => decide('deny')}>
                {busy === 'deny' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cancel'}
              </Button>
              <Button className="flex-1" disabled={busy !== null} onClick={() => decide('approve')}>
                {busy === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Allow access'}
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              You can revoke this at any time from Settings → Developer.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
