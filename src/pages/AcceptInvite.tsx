import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Accept a workspace invitation.
 *
 * The token is in the URL but acceptance needs a session: the invite names an
 * email address and the membership row names a user id. A signed-out visitor is
 * sent to sign in and returned here.
 */
export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'working' | 'joined' | 'error'>('working');
  const [message, setMessage] = useState('');
  const [orgName, setOrgName] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      // Come back here once they are signed in.
      navigate(`/auth?redirect=${encodeURIComponent(`/invite/${token}`)}`, { replace: true });
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.functions.invoke('accept-org-invite', {
        body: { token },
      });
      if (cancelled) return;
      if (error || data?.error) {
        setStatus('error');
        setMessage(data?.error || error?.message || 'This invitation could not be accepted.');
        return;
      }
      setOrgName(data?.organization?.name ?? 'your workspace');
      setStatus('joined');
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, token, navigate]);

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-6"
      style={{ background: 'var(--paper)' }}
    >
      <div className="mb-8">
        <Logo size="lg" linkTo="/" />
      </div>
      <div
        className="w-full max-w-md rounded-2xl p-8 text-center"
        style={{ border: '1px solid var(--rule)', background: 'var(--paper-card)' }}
      >
        {status === 'working' && (
          <div
            className="flex items-center justify-center gap-2 text-[14px]"
            style={{ color: 'var(--ink-mid)' }}
          >
            <Loader2 className="h-4 w-4 animate-spin" /> Accepting your invitation…
          </div>
        )}

        {status === 'joined' && (
          <>
            <CheckCircle2 className="mx-auto mb-4 h-10 w-10" style={{ color: 'var(--ok)' }} />
            <h1 className="mb-2 text-[20px] font-semibold" style={{ color: 'var(--ink)' }}>
              You have joined {orgName}
            </h1>
            <p className="mb-6 text-[14px]" style={{ color: 'var(--ink-mid)' }}>
              Your own meetings stay private. Nothing is shared with the workspace until you
              choose to share it.
            </p>
            <Link to="/workspace">
              <Button>Open workspace</Button>
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <h1 className="mb-2 text-[20px] font-semibold" style={{ color: 'var(--ink)' }}>
              This invitation did not work
            </h1>
            <p className="mb-6 text-[14px]" style={{ color: 'var(--ink-mid)' }}>{message}</p>
            <Link to="/dashboard">
              <Button variant="outline">Go to dashboard</Button>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
