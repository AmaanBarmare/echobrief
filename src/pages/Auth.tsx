import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Mail, Lock, User, ArrowRight, ArrowLeft, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Logo } from '@/components/ui/Logo';

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
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  // Use the centralized recovery flag from AuthContext
  const isResetPassword = isPasswordRecovery;

  useEffect(() => {
    if (user && !isResetPassword) {
      navigate('/dashboard');
    }
  }, [user, isResetPassword, navigate]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: 'Error', description: 'Passwords do not match.', variant: 'destructive' });
      return;
    }
    if (password.length < 6) {
      toast({ title: 'Error', description: 'Password must be at least 6 characters.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: 'Password updated!', description: 'You can now sign in with your new password.' });
      clearPasswordRecovery();
      navigate('/dashboard');
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Something went wrong', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({ title: 'Error', description: 'Please enter your email address.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth?type=recovery`,
      });
      if (error) throw error;
      toast({ title: 'Reset link sent!', description: 'Check your email for a password reset link.' });
      setIsForgotPassword(false);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Something went wrong', variant: 'destructive' });
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
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Something went wrong', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: '#0C0A09' }}>
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1C1917 0%, #0C0A09 50%, #1C1917 100%)' }}>
        {/* Decorative gradient orbs */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-72 h-72 rounded-full blur-[100px]" style={{ background: 'rgba(249,115,22,0.12)' }} />
          <div className="absolute bottom-1/3 right-1/4 w-56 h-56 rounded-full blur-[80px]" style={{ background: 'rgba(245,158,11,0.08)' }} />
        </div>
        
        <div className="relative z-10 flex flex-col justify-center p-16">
          <div className="mb-16">
            <Logo size="lg" linkTo="/" />
          </div>

          <h1 
            className="text-4xl font-semibold mb-5 leading-tight"
            style={{ fontFamily: 'Outfit, sans-serif', color: '#FAFAF9', letterSpacing: '-0.02em' }}
          >
            Transform your meetings<br />into actionable insights
          </h1>
          <p className="text-lg max-w-md leading-relaxed" style={{ color: '#A8A29E' }}>
            Record, transcribe, and get AI-powered summaries in 22 Indian languages. Delivered to WhatsApp, Slack, or email.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-2 mt-10">
            {['22 Languages', 'Hinglish Support', 'WhatsApp Delivery', 'DPDP Compliant'].map((f) => (
              <span 
                key={f}
                className="px-3 py-1.5 rounded-full text-xs font-medium"
                style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.15)', color: '#FB923C' }}
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel - Auth Form */}
      <div className="flex-1 flex items-center justify-center p-8" style={{ background: '#0C0A09' }}>
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="flex lg:hidden justify-center mb-10">
            <Logo size="lg" linkTo="/" />
          </div>

          {/* Auth Card */}
          <div 
            className="rounded-2xl p-8"
            style={{ background: '#1C1917', border: '1px solid #292524' }}
          >
            {emailSent ? (
              <div className="text-center py-4">
                <div 
                  className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
                  style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.15)' }}
                >
                  <Mail className="w-8 h-8" style={{ color: '#FB923C' }} />
                </div>
                <h2 className="text-xl font-semibold mb-2" style={{ fontFamily: 'Outfit, sans-serif', color: '#FAFAF9' }}>
                  Check your email
                </h2>
                <p className="text-sm mb-6" style={{ color: '#A8A29E' }}>
                  We sent a verification link to <span className="font-medium" style={{ color: '#FAFAF9' }}>{email}</span>. Click the link to activate your account.
                </p>
                <p className="text-xs mb-6" style={{ color: '#78716C' }}>
                  Didn't receive it? Check your spam folder or try again.
                </p>
                <button
                  onClick={() => { setEmailSent(false); setIsSignUp(false); }}
                  className="inline-flex items-center gap-2 text-sm font-medium transition-colors"
                  style={{ color: '#A8A29E' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#FAFAF9')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#A8A29E')}
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to sign in
                </button>
              </div>
            ) : (
              <>
                <div className="text-center mb-8">
                  <h2 
                    className="text-2xl font-semibold mb-2"
                    style={{ fontFamily: 'Outfit, sans-serif', color: '#FAFAF9', letterSpacing: '-0.02em' }}
                  >
                    {isResetPassword ? 'Set new password' : isForgotPassword ? 'Reset your password' : isSignUp ? 'Create your account' : 'Welcome back'}
                  </h2>
                  <p className="text-sm" style={{ color: '#A8A29E' }}>
                    {isResetPassword
                      ? 'Enter your new password below'
                      : isForgotPassword
                        ? "Enter your email and we'll send you a reset link"
                        : isSignUp 
                          ? 'Start recording smarter meetings today' 
                          : 'Sign in to continue to your dashboard'}
                  </p>
                </div>

                {isResetPassword ? (
                  <form onSubmit={handleResetPassword} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="new-password" style={{ color: '#A8A29E', fontSize: 13 }}>New Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#78716C' }} />
                        <input
                          id="new-password"
                          type="password"
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full pl-10 pr-3 py-2.5 rounded-lg text-sm outline-none transition-colors"
                          style={{ background: '#0C0A09', border: '1px solid #292524', color: '#FAFAF9', fontFamily: 'inherit' }}
                          onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(249,115,22,0.4)')}
                          onBlur={(e) => (e.currentTarget.style.borderColor = '#292524')}
                          required
                          minLength={6}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirm-password" style={{ color: '#A8A29E', fontSize: 13 }}>Confirm Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#78716C' }} />
                        <input
                          id="confirm-password"
                          type="password"
                          placeholder="••••••••"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="w-full pl-10 pr-3 py-2.5 rounded-lg text-sm outline-none transition-colors"
                          style={{ background: '#0C0A09', border: '1px solid #292524', color: '#FAFAF9', fontFamily: 'inherit' }}
                          onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(249,115,22,0.4)')}
                          onBlur={(e) => (e.currentTarget.style.borderColor = '#292524')}
                          required
                          minLength={6}
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 rounded-xl text-[15px] font-semibold text-white flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg, #F97316, #F59E0B)', boxShadow: '0 2px 12px rgba(249,115,22,0.25)', fontFamily: 'inherit' }}
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Update Password <ArrowRight className="w-4 h-4" /></>}
                    </button>
                  </form>
                ) : isForgotPassword ? (
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email" style={{ color: '#A8A29E', fontSize: 13 }}>Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#78716C' }} />
                        <input
                          id="email"
                          type="email"
                          placeholder="you@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full pl-10 pr-3 py-2.5 rounded-lg text-sm outline-none transition-colors"
                          style={{ background: '#0C0A09', border: '1px solid #292524', color: '#FAFAF9', fontFamily: 'inherit' }}
                          onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(249,115,22,0.4)')}
                          onBlur={(e) => (e.currentTarget.style.borderColor = '#292524')}
                          required
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 rounded-xl text-[15px] font-semibold text-white flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
                      style={{ background: 'linear-gradient(135deg, #F97316, #F59E0B)', boxShadow: '0 2px 12px rgba(249,115,22,0.25)', fontFamily: 'inherit' }}
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Send Reset Link <ArrowRight className="w-4 h-4" /></>}
                    </button>
                    <div className="text-center mt-4">
                      <button
                        type="button"
                        onClick={() => setIsForgotPassword(false)}
                        className="text-sm inline-flex items-center gap-1 transition-colors"
                        style={{ color: '#A8A29E' }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#FAFAF9')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = '#A8A29E')}
                      >
                        <ArrowLeft className="w-3 h-3" /> Back to sign in
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <form onSubmit={handleSubmit} className="space-y-4">
                      {isSignUp && (
                        <div className="space-y-2">
                          <Label htmlFor="name" style={{ color: '#A8A29E', fontSize: 13 }}>Full Name</Label>
                          <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#78716C' }} />
                            <input
                              id="name"
                              type="text"
                              placeholder="John Doe"
                              value={fullName}
                              onChange={(e) => setFullName(e.target.value)}
                              className="w-full pl-10 pr-3 py-2.5 rounded-lg text-sm outline-none transition-colors"
                              style={{ background: '#0C0A09', border: '1px solid #292524', color: '#FAFAF9', fontFamily: 'inherit' }}
                              onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(249,115,22,0.4)')}
                              onBlur={(e) => (e.currentTarget.style.borderColor = '#292524')}
                              required={isSignUp}
                            />
                          </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label htmlFor="email" style={{ color: '#A8A29E', fontSize: 13 }}>Email</Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#78716C' }} />
                          <input
                            id="email"
                            type="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full pl-10 pr-3 py-2.5 rounded-lg text-sm outline-none transition-colors"
                            style={{ background: '#0C0A09', border: '1px solid #292524', color: '#FAFAF9', fontFamily: 'inherit' }}
                            onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(249,115,22,0.4)')}
                            onBlur={(e) => (e.currentTarget.style.borderColor = '#292524')}
                            required
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="password" style={{ color: '#A8A29E', fontSize: 13 }}>Password</Label>
                          {!isSignUp && (
                            <button
                              type="button"
                              onClick={() => setIsForgotPassword(true)}
                              className="text-xs font-medium transition-colors"
                              style={{ color: '#FB923C' }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = '#F97316')}
                              onMouseLeave={(e) => (e.currentTarget.style.color = '#FB923C')}
                            >
                              Forgot password?
                            </button>
                          )}
                        </div>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#78716C' }} />
                          <input
                            id="password"
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full pl-10 pr-3 py-2.5 rounded-lg text-sm outline-none transition-colors"
                            style={{ background: '#0C0A09', border: '1px solid #292524', color: '#FAFAF9', fontFamily: 'inherit' }}
                            onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(249,115,22,0.4)')}
                            onBlur={(e) => (e.currentTarget.style.borderColor = '#292524')}
                            required
                            minLength={6}
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 rounded-xl text-[15px] font-semibold text-white flex items-center justify-center gap-2 transition-opacity disabled:opacity-50 mt-2"
                        style={{ background: 'linear-gradient(135deg, #F97316, #F59E0B)', boxShadow: '0 2px 12px rgba(249,115,22,0.25)', fontFamily: 'inherit' }}
                      >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                          <>{isSignUp ? 'Create Account' : 'Sign In'} <ArrowRight className="w-4 h-4" /></>
                        )}
                      </button>
                    </form>

                    <div className="mt-6 text-center">
                      <button
                        type="button"
                        onClick={() => setIsSignUp(!isSignUp)}
                        className="text-sm transition-colors"
                        style={{ color: '#A8A29E' }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#FAFAF9')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = '#A8A29E')}
                      >
                        {isSignUp 
                          ? <>Already have an account? <span style={{ color: '#FB923C' }}>Sign in</span></> 
                          : <>Don't have an account? <span style={{ color: '#FB923C' }}>Sign up</span></>}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <p className="text-center mt-6 text-xs" style={{ color: '#78716C' }}>
            By signing in, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  );
}
