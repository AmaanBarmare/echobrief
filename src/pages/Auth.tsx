import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Mail, Lock, User, ArrowLeft, ArrowRight, Loader2, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';

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
  const { user, signIn, signUp, isPasswordRecovery, clearPasswordRecovery } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const isResetPassword = isPasswordRecovery;

  useEffect(() => {
    if (user && !isResetPassword) navigate('/dashboard');
  }, [user, isResetPassword, navigate]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    if (password.length < 6) {
      toast({ title: 'Password too short', description: 'Use at least 6 characters.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: 'Password updated' });
      clearPasswordRecovery();
      navigate('/dashboard');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
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
      if (isSignUp) {
        const { error } = await signUp(email, password, fullName);
        if (error) throw error;
        setEmailSent(true);
        return;
      } else {
        const { error } = await signIn(email, password);
        if (error) throw error;
      }
      navigate('/dashboard');
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
    ? '3 meetings free. No credit card required.'
    : 'Sign in to continue to your dashboard.';

  const bullets = [
    '22 Indian languages',
    'Auto-join Meet, Zoom & Teams',
    'Delivered to Slack, WhatsApp, email',
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
            and deliver clear summaries to Slack, WhatsApp, or email.
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
          Made in India · Data stays in India
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
                      placeholder="At least 6 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={inputClass}
                      style={{ ...inputStyle, paddingLeft: 36 }}
                      required
                      minLength={6}
                    />
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
                      minLength={6}
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
                          minLength={6}
                        />
                      </div>
                    </div>

                    <SubmitButton loading={loading}>
                      {isSignUp ? 'Create account' : 'Sign in'}
                    </SubmitButton>
                  </form>

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
  icon: React.ComponentType<{ className?: string; strokeWidth?: number; style?: React.CSSProperties }>;
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
