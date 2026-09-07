import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * The second factor, asked for at sign-in.
 *
 * SecurityCard has let people enrol TOTP for a while, and nothing ever asked
 * for the code again. Supabase does not block a password sign-in for an
 * enrolled user — it issues an aal1 session and leaves the decision to the
 * app — so enrolling produced the appearance of protection and none of the
 * substance: the password alone still opened every meeting.
 *
 * This is the app half of the fix. The half that actually enforces it is in the
 * database (`public.mfa_satisfied()`, migration 20260907101000): an aal1 token
 * cannot read meetings, transcripts or insights once a factor is verified, so
 * skipping this screen by editing client state gets you an empty dashboard
 * rather than someone's conversations.
 */
export function MfaChallenge() {
  const { signOut, refreshMfaStatus } = useAuth();
  const [code, setCode] = useState('');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      if (!active) return;
      const verified = (data?.totp ?? []).find((f) => f.status === 'verified');
      setFactorId(verified?.id ?? null);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const verify = async () => {
    if (!factorId || code.trim().length < 6) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (verifyError) throw verifyError;
      // The session is now aal2. Re-checking is what releases the gate.
      await refreshMfaStatus();
    } catch (err) {
      // The codes rotate every 30s and phone clocks drift, so a wrong code is
      // an ordinary event, not an incident. Say what to do about it.
      setError(
        err instanceof Error && /invalid|expired/i.test(err.message)
          ? 'That code was not accepted. Wait for the next one and try again.'
          : err instanceof Error
            ? err.message
            : 'Could not verify that code.',
      );
      setCode('');
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <ShieldCheck className="w-8 h-8 mx-auto text-accent" />
          <h1 className="text-xl font-semibold text-foreground">Two-factor authentication</h1>
          <p className="text-sm text-muted-foreground">
            Enter the 6-digit code from your authenticator app to finish signing in.
          </p>
        </div>

        <div className="space-y-3">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void verify();
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="000000"
            aria-label="Six-digit authentication code"
            // text-base is 15px in this Tailwind config, which iOS zooms on
            // focus; 16px is the threshold. Same fix as the other auth inputs.
            className="text-center tracking-[0.4em] text-[16px]"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button className="w-full" onClick={() => void verify()} disabled={verifying}>
            {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify'}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>

        {!factorId && (
          <p className="text-sm text-muted-foreground text-center">
            No authenticator is registered on this account. Sign out and contact support to
            regain access.
          </p>
        )}
      </div>
    </div>
  );
}
