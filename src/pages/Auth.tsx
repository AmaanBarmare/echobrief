import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { consumePostLoginRedirect } from '@/lib/postLoginRedirect';
import { checkPwnedPassword } from '@/lib/pwned';
import { supabase } from '@/integrations/supabase/client';
import { Mail, Lock, User, ArrowLeft, ArrowRight, Loader2, Check, type LucideIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';

// Signups are closed. The Supabase auth server also has `disable_signup: true`,
// so flipping this back to `true` alone will NOT re-open registration — the
// project's auth config has to be changed too.
const SIGNUPS_ENABLED = false;

// Google sign-in is live: the Supabase Auth Google provider was repointed at
// a fresh OAuth client on 2026-08-31 (the previous one had been deleted and
// returned `deleted_client`). The env gate stays so the button can be pulled
// without a code change if the provider breaks again (see docs/operations.md).
const GOOGLE_SIGNIN_ENABLED = import.meta.env.VITE_GOOGLE_SIGNIN === 'true';

const inputClass =
  'w-full rounded-md px-3 py-2.5 text-[14.5px] outline-none transition-colors placeholder:opacity-60';

const inputStyle = {
  background: 'var(--paper-card)',
  border: '1px solid var(--rule)',
  color: 'var(--ink)',
  fontFamily: 'var(--font-body)',
} as const;

export default function Auth() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { user, signIn, signUp, isPasswordRecovery, clearPasswordRecovery } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const isResetPassword = isPasswordRecovery;

  useEffect(() => {
    if (user && !isResetPassword) navigate(consumePostLoginRedirect() ?? '/dashboard');
  }, [user, isResetPassword, navigate]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    if (password.length < 10) {
      toast({ title: 'Password too short', description: 'Use at least 10 characters with letters and numbers.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const pwned = await checkPwnedPassword(password);
      if (pwned.breached) {
        toast({
          title: 'Choose a different password',
          description: `This password has appeared in ${pwned.count.toLocaleString()} known data breaches. Please choose a different one.`,
          variant: 'destructive',
        });
        return;
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: 'Password updated' });
      clearPasswordRecovery();
      navigate(consumePostLoginRedirect() ?? '/dashboard');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + '/dashboard' },
      });
      if (error) throw error;
      // On success the browser navigates away to Google — no state reset needed.
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      toast({ title: 'Error', description: message, variant: 'destructive' });
      setGoogleLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({ title: 'Enter your email', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth?type=recovery`,
      });
      if (error) throw error;
      toast({ title: 'Reset link sent', description: 'Check your email.' });
      setIsForgotPassword(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignUp && SIGNUPS_ENABLED) {
        if (password.length < 10) {
          toast({ title: 'Password too short', description: 'Use at least 10 characters with letters and numbers.', variant: 'destructive' });
          return;
        }
        const pwned = await checkPwnedPassword(password);
        if (pwned.breached) {
          toast({
            title: 'Choose a different password',
            description: `This password has appeared in ${pwned.count.toLocaleString()} known data breaches. Please choose a different one.`,
            variant: 'destructive',
          });
          return;
        }
        const { error } = await signUp(email, password, fullName);
        if (error) throw error;
        setEmailSent(true);
        return;
      } else {
        const { error } = await signIn(email, password);
        if (error) throw error;
      }
      navigate(consumePostLoginRedirect() ?? '/dashboard');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const title = isResetPassword
    ? 'Set a new password'
    : isForgotPassword
    ? 'Reset your password'
    : isSignUp
    ? 'Create your account'
    : 'Welcome back';

  const subtitle = isResetPassword
    ? 'Enter a new password below.'
    : isForgotPassword
    ? "We'll email you a reset link."
    : isSignUp
    ? 'Create your account to get started.'
    : 'Sign in to continue to your dashboard.';

  const bullets = [
    '22 Indian languages',
    'Auto-join Meet, Zoom & Teams',
    'Summaries delivered by email',
  ];

  return (
    <div className="relative flex min-h-screen" style={{ background: 'var(--paper)' }}>
      <div className="absolute left-6 top-5 z-20 md:left-8">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-[13px] no-underline"
          style={{ color: 'var(--ink-mid)' }}
        >
          <ArrowLeft className="h-[14px] w-[14px]" strokeWidth={1.75} />
          Back to home
        </Link>
      </div>
      <div className="absolute right-6 top-5 z-20 md:right-8">
        <ThemeToggle />
      </div>

      {/* Left — product pitch */}
      <div
        className="relative hidden overflow-hidden lg:flex lg:w-[48%] lg:flex-col lg:justify-between lg:p-12 xl:p-16"
        style={{ background: 'var(--paper-raised)', borderRight: '1px solid var(--rule)' }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 top-1/4 h-[380px] w-[380px] rounded-full blur-[80px]"
          style={{ background: 'color-mix(in oklch, var(--ember) 8%, transparent)' }}
        />

        <div className="relative">
          <Logo size="lg" linkTo="/" />
        </div>

        <div className="relative">
          <h1
            className="max-w-[16ch] text-[clamp(2.25rem,4vw,3rem)] font-semibold leading-[1.1]"
            style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
          >
            Meeting summaries that actually make sense.
          </h1>
          <p
            className="mt-4 max-w-[40ch] text-[15.5px] leading-[1.6]"
            style={{ color: 'var(--ink-mid)' }}
          >
            Auto-join your calls, transcribe accurately in 22 Indian languages,
            and deliver clear summaries straight to your inbox.
          </p>

          <ul className="mt-8 space-y-3">
            {bullets.map((b) => (
              <li key={b} className="flex items-center gap-2.5 text-[14.5px]" style={{ color: 'var(--ink)' }}>
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                  style={{ background: 'color-mix(in oklch, var(--ember) 12%, transparent)' }}
                >
                  <Check className="h-3 w-3" strokeWidth={2.5} style={{ color: 'var(--ember-deep)' }} />
                </span>
                {b}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
          Made in India · Transcription runs in India
        </p>
      </div>

      {/* Right — form */}
      <div className="flex flex-1 items-center justify-center px-6 py-24 md:px-12">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 flex justify-center lg:hidden">
            <Logo size="md" linkTo="/" />
          </div>

          {emailSent ? (
            <div>
              <h2 className="text-[26px] font-semibold leading-tight" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
                Check your email
              </h2>
              <p className="mt-3 text-[15px] leading-[1.6]" style={{ color: 'var(--ink-mid)' }}>
                We sent a verification link to{' '}
                <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{email}</span>.
                Click it to activate your account.
              </p>
              <button
                onClick={() => {
                  setEmailSent(false);
                  setIsSignUp(false);
                }}
                className="mt-6 inline-flex items-center gap-1.5 text-[13.5px] font-medium"
                style={{ color: 'var(--ember-deep)' }}
              >
                <ArrowLeft className="h-[14px] w-[14px]" strokeWidth={1.75} />
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h2 className="text-[28px] font-semibold leading-tight" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
                  {title}
                </h2>
                <p className="mt-2 text-[14.5px]" style={{ color: 'var(--ink-mid)' }}>
                  {subtitle}
                </p>
              </div>

              {isResetPassword ? (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <Field id="new-password" label="New password" icon={Lock}>
                    <input
                      id="new-password"
                      type="password"
                      placeholder="At least 10 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={inputClass}
                      style={{ ...inputStyle, paddingLeft: 36 }}
                      required
                      minLength={10}
                    />
                    <p className="mt-1.5 text-[12px]" style={{ color: 'var(--ink-soft)' }}>
                      At least 10 characters with letters and numbers
                    </p>
                  </Field>
                  <Field id="confirm-password" label="Confirm password" icon={Lock}>
                    <input
                      id="confirm-password"
                      type="password"
                      placeholder="Type it again"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={inputClass}
                      style={{ ...inputStyle, paddingLeft: 36 }}
                      required
                      minLength={10}
                    />
                  </Field>
                  <SubmitButton loading={loading}>Update password</SubmitButton>
                </form>
              ) : isForgotPassword ? (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <Field id="email" label="Email" icon={Mail}>
                    <input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={inputClass}
                      style={{ ...inputStyle, paddingLeft: 36 }}
                      required
                    />
                  </Field>
                  <SubmitButton loading={loading}>Send reset link</SubmitButton>
                  <button
                    type="button"
                    onClick={() => setIsForgotPassword(false)}
                    className="inline-flex items-center gap-1.5 text-[13.5px]"
                    style={{ color: 'var(--ink-mid)' }}
                  >
                    <ArrowLeft className="h-[14px] w-[14px]" strokeWidth={1.75} />
                    Back to sign in
                  </button>
                </form>
              ) : (
                <>
                  {GOOGLE_SIGNIN_ENABLED && (
                    <div className="mb-6">
                      <button
                        type="button"
                        onClick={handleGoogleSignIn}
                        disabled={googleLoading}
                        className="inline-flex w-full items-center justify-center gap-2.5 rounded-md px-5 py-2.5 text-[14.5px] font-medium transition-colors disabled:opacity-60"
                        style={{
                          border: '1px solid var(--rule)',
                          background: 'var(--paper-card)',
                          color: 'var(--ink)',
                        }}
                      >
                        {googleLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <GoogleGIcon />
                        )}
                        Continue with Google
                      </button>
                      <div className="mt-6 flex items-center gap-3" aria-hidden>
                        <span className="h-px flex-1" style={{ background: 'var(--rule)' }} />
                        <span className="text-[12px]" style={{ color: 'var(--ink-soft)' }}>or</span>
                        <span className="h-px flex-1" style={{ background: 'var(--rule)' }} />
                      </div>
                    </div>
                  )}
                  <form onSubmit={handleSubmit} className="space-y-4">
                    {isSignUp && (
                      <Field id="name" label="Full name" icon={User}>
                        <input
                          id="name"
                          type="text"
                          placeholder="Priya Kumar"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className={inputClass}
                          style={{ ...inputStyle, paddingLeft: 36 }}
                          required
                        />
                      </Field>
                    )}

                    <Field id="email" label="Email" icon={Mail}>
                      <input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={inputClass}
                        style={{ ...inputStyle, paddingLeft: 36 }}
                        required
                      />
                    </Field>

                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <Label
                          htmlFor="password"
                          className="text-[12.5px] font-medium"
                          style={{ color: 'var(--ink-mid)' }}
                        >
                          Password
                        </Label>
                        {!isSignUp && (
                          <button
                            type="button"
                            onClick={() => setIsForgotPassword(true)}
                            className="text-[12.5px] font-medium"
                            style={{ color: 'var(--ember-deep)' }}
                          >
                            Forgot?
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 h-[14px] w-[14px] -translate-y-1/2" style={{ color: 'var(--ink-soft)' }} strokeWidth={1.75} />
                        <input
                          id="password"
                          type="password"
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className={inputClass}
                          style={{ ...inputStyle, paddingLeft: 36 }}
                          required
                          minLength={isSignUp ? 10 : 6}
                        />
                      </div>
                      {isSignUp && (
                        <p className="mt-1.5 text-[12px]" style={{ color: 'var(--ink-soft)' }}>
                          At least 10 characters with letters and numbers
                        </p>
                      )}
                    </div>

                    <SubmitButton loading={loading}>
                      {isSignUp ? 'Create account' : 'Sign in'}
                    </SubmitButton>
                  </form>

                  {SIGNUPS_ENABLED ? (
                    <p className="mt-6 text-center text-[13.5px]" style={{ color: 'var(--ink-mid)' }}>
                      {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
                      <button
                        type="button"
                        onClick={() => setIsSignUp(!isSignUp)}
                        className="no-underline"
                        style={{ color: 'var(--ember-deep)', fontWeight: 600 }}
                      >
                        {isSignUp ? 'Sign in' : 'Sign up'}
                      </button>
                    </p>
                  ) : (
                    <p className="mt-6 text-center text-[13.5px]" style={{ color: 'var(--ink-mid)' }}>
                      New signups are closed right now.{' '}
                      <Link
                        to="/#waitlist"
                        className="no-underline"
                        style={{ color: 'var(--ember-deep)', fontWeight: 600 }}
                      >
                        Join the waitlist
                      </Link>
                    </p>
                  )}
                </>
              )}
            </>
          )}

          <p className="mt-8 text-center text-[12px]" style={{ color: 'var(--ink-soft)' }}>
            By continuing you agree to our Terms and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  icon: Icon,
  children,
}: {
  id: string;
  label: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label
        htmlFor={id}
        className="mb-1.5 block text-[12.5px] font-medium"
        style={{ color: 'var(--ink-mid)' }}
      >
        {label}
      </Label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 h-[14px] w-[14px] -translate-y-1/2" strokeWidth={1.75} style={{ color: 'var(--ink-soft)' }} />
        {children}
      </div>
    </div>
  );
}

function SubmitButton({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md px-5 py-3 text-[14.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      style={{ background: 'var(--ember)' }}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          <span>{children}</span>
          <ArrowRight className="h-4 w-4" strokeWidth={2} />
        </>
      )}
    </button>
  );
}

/** Official multicolour Google "G" — third-party brand mark, colours fixed by Google. */
function GoogleGIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
      <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />{/* brand-check-ignore */}
      <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z" />{/* brand-check-ignore */}
      <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />{/* brand-check-ignore */}
    </svg>
  );
}
