import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

/**
 * Two-factor enrolment.
 *
 * TOTP has been enabled in the Supabase Auth config the whole time and no
 * screen in the app let anyone turn it on — the September audit found a
 * security control that existed only in a settings file. Everything here runs
 * against supabase.auth.mfa on the caller's own session; there is no server
 * code and nothing new to secure.
 */

interface Factor {
  id: string;
  friendly_name?: string;
  status: string;
}

export function SecurityCard() {
  const { toast } = useToast();
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  // Enrolment in progress: the pending factor and its QR, held until the user
  // proves they can produce a code from it.
  const [pending, setPending] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (!error && data) {
      // Only verified factors count. An abandoned enrolment leaves an
      // unverified row behind and must not read as "you are protected".
      setFactors((data.totp ?? []).filter((f) => f.status === 'verified'));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const startEnrolment = async () => {
    setWorking(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (error) throw error;
      setPending({
        id: data.id,
        qr: data.totp.qr_code,
        secret: data.totp.secret,
      });
    } catch (err) {
      toast({
        title: 'Could not start setup',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setWorking(false);
    }
  };

  const confirmEnrolment = async () => {
    if (!pending || code.trim().length < 6) {
      toast({ title: 'Enter the 6-digit code', variant: 'destructive' });
      return;
    }
    setWorking(true);
    try {
      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId: pending.id });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: pending.id,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (verifyError) throw verifyError;

      setPending(null);
      setCode('');
      await refresh();
      toast({
        title: 'Two-factor authentication is on',
        description: 'You will be asked for a code the next time you sign in.',
      });
    } catch (err) {
      toast({
        title: 'That code was not accepted',
        description: err instanceof Error ? err.message : 'Check your authenticator app and try again.',
        variant: 'destructive',
      });
    } finally {
      setWorking(false);
    }
  };

  const cancelEnrolment = async () => {
    if (!pending) return;
    // Remove the half-finished factor rather than leaving an unverified row.
    await supabase.auth.mfa.unenroll({ factorId: pending.id });
    setPending(null);
    setCode('');
  };

  const removeFactor = async (factorId: string) => {
    setWorking(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      await refresh();
      toast({ title: 'Two-factor authentication removed' });
    } catch (err) {
      toast({
        title: 'Could not remove it',
        description: err instanceof Error ? err.message : 'Something went wrong.',
        variant: 'destructive',
      });
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4" style={{ color: 'var(--ink-mid)' }} />
        <h3 className="text-[15px] font-semibold text-foreground">Two-Factor Authentication</h3>
      </div>
      <p className="mb-5 text-[13px] text-muted-foreground">
        Require a code from your authenticator app as well as your password. Your meeting
        recordings are worth protecting with more than one factor.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : pending ? (
        <div className="space-y-4">
          <p className="text-[13px] text-muted-foreground">
            Scan this with Google Authenticator, 1Password, or any TOTP app, then enter the
            code it shows.
          </p>
          <div
            className="inline-block rounded-xl border border-border bg-white p-3"
            // Supabase returns the QR as an SVG data URI.
          >
            <img src={pending.qr} alt="Two-factor setup QR code" width={180} height={180} />
          </div>
          <p className="text-[12px] text-muted-foreground">
            Cannot scan? Enter this key manually:{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11.5px]">
              {pending.secret}
            </code>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="w-32 font-mono tracking-widest"
            />
            <Button size="sm" onClick={confirmEnrolment} disabled={working}>
              {working && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Turn on
            </Button>
            <Button size="sm" variant="ghost" onClick={cancelEnrolment} disabled={working}>
              Cancel
            </Button>
          </div>
        </div>
      ) : factors.length > 0 ? (
        <div className="space-y-3">
          {factors.map((factor) => (
            <div
              key={factor.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/40 px-4 py-3"
            >
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4" style={{ color: 'var(--ok)' }} />
                <span className="text-[13px] font-medium text-foreground">
                  {factor.friendly_name || 'Authenticator app'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => removeFactor(factor.id)}
                disabled={working}
                className="cursor-pointer border-none bg-transparent p-1 text-destructive hover:opacity-90 disabled:opacity-50"
                aria-label="Remove two-factor authentication"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <Button
          variant="outline"
          onClick={startEnrolment}
          disabled={working}
          className="border-border text-foreground hover:bg-muted"
        >
          {working ? <Loader2 size={14} className="mr-2 animate-spin" /> : <ShieldCheck size={14} className="mr-2" />}
          Set up two-factor
        </Button>
      )}
    </div>
  );
}
