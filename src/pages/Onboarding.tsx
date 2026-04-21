import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ChevronRight, Check, Calendar, Bell, Zap, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Step = 'welcome' | 'preferences' | 'calendar' | 'notifications' | 'complete';

export default function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('welcome');
  const [loading, setLoading] = useState(false);

  // Preferences
  const [languages, setLanguages] = useState<string[]>(['English']);
  const [notificationFreq, setNotificationFreq] = useState('daily');
  const [calendarEnabled, setCalendarEnabled] = useState(false);
  const [slackEnabled, setSlackEnabled] = useState(false);

  useEffect(() => {
    // Check if already onboarded
    if (!user) return;
    const checkOnboarding = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('user_id', user.id)
        .single();

      if (data?.onboarding_completed) {
        navigate('/dashboard');
      }
    };
    checkOnboarding();
  }, [user, navigate]);

  const handleCompleteOnboarding = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          onboarding_completed: true,
          onboarding_completed_at: new Date().toISOString(),
          preferred_languages: languages,
          notification_frequency: notificationFreq,
          google_calendar_connected: calendarEnabled,
          slack_connected: slackEnabled,
        })
        .eq('user_id', user.id);

      if (error) throw error;
      navigate('/dashboard');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      alert('Error completing onboarding: ' + message);
    } finally {
      setLoading(false);
    }
  };

  const steps_list = [
    { id: 'welcome', label: 'Welcome', icon: <Zap size={18} /> },
    { id: 'preferences', label: 'Preferences', icon: <Settings size={18} /> },
    { id: 'calendar', label: 'Calendar', icon: <Calendar size={18} /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell size={18} /> },
    { id: 'complete', label: 'Done', icon: <Check size={18} /> },
  ];

  const currentStepIndex = steps_list.findIndex(s => s.id === step);

  const primaryBtn = 'btn-primary-ember flex-1 text-[14px]';

  return (
    <div className="min-h-screen" style={{ background: 'var(--paper)' }}>
      <div className="mx-auto flex min-h-screen max-w-[520px] flex-col justify-center px-6 py-12">
        <div className="mb-8">
          <h1
            className="text-[28px] font-semibold leading-tight"
            style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
          >
            Welcome to EchoBrief
          </h1>
          <p className="mt-2 text-[14.5px]" style={{ color: 'var(--ink-mid)', lineHeight: 1.6 }}>
            A quick setup and you're ready to record your first meeting.
          </p>
        </div>

        {/* Progress */}
        <div
          className="mb-10 flex gap-1.5"
          role="progressbar"
          aria-valuenow={currentStepIndex + 1}
          aria-valuemin={1}
          aria-valuemax={steps_list.length}
        >
          {steps_list.map((s, i) => (
            <div
              key={s.id}
              className="h-[2px] flex-1 rounded-full transition-all duration-300"
              style={{
                background: currentStepIndex >= i ? 'var(--ember)' : 'var(--rule)',
              }}
            />
          ))}
        </div>

        {/* Step content */}
        <div
          className="flex min-h-[22rem] flex-col rounded-xl p-6 sm:p-8"
          style={{
            background: 'var(--paper-card)',
            border: '1px solid var(--rule)',
            boxShadow: 'var(--shadow-paper-sm)',
          }}
        >
          {/* ═══ WELCOME STEP ═══ */}
          {step === 'welcome' && (
            <div className="flex flex-1 flex-col">
              <h2 className="mb-3 text-2xl font-semibold text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
                Let&apos;s get started
              </h2>
              <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
                EchoBrief captures and analyzes your meetings in real time. Set your preferences to get the most out of
                summaries, action items, and insights tailored to how you work.
              </p>
              <div className="flex-1" />
              <Button type="button" onClick={() => setStep('preferences')} className={primaryBtn}>
                Get Started <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}

          {/* ═══ PREFERENCES STEP ═══ */}
          {step === 'preferences' && (
            <div className="flex flex-1 flex-col">
              <h2 className="mb-6 text-2xl font-semibold text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
                Your Preferences
              </h2>

              <div className="mb-6">
                <label className="mb-3 block text-[13px] font-medium text-foreground">Preferred Languages</label>
                <div className="grid grid-cols-2 gap-2">
                  {['English', 'Hindi', 'Spanish', 'French'].map(lang => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => {
                        if (languages.includes(lang)) {
                          setLanguages(languages.filter(l => l !== lang));
                        } else {
                          setLanguages([...languages, lang]);
                        }
                      }}
                      className={cn(
                        'rounded-lg border px-3 py-3 text-[13px] font-medium transition-all',
                        languages.includes(lang)
                          ? 'border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-400'
                          : 'border-border bg-transparent text-muted-foreground hover:border-orange-500/40 hover:bg-muted/60'
                      )}
                    >
                      {languages.includes(lang) && '✓ '}
                      {lang}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1" />
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={() => setStep('welcome')} className="flex-1 border-border text-muted-foreground hover:bg-muted">
                  Back
                </Button>
                <Button type="button" onClick={() => setStep('calendar')} className={primaryBtn}>
                  Next <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ═══ CALENDAR STEP ═══ */}
          {step === 'calendar' && (
            <div className="flex flex-1 flex-col">
              <h2 className="mb-6 text-2xl font-semibold text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
                Calendar Integration
              </h2>

              <div className="mb-5">
                <button
                  type="button"
                  onClick={() => setCalendarEnabled(!calendarEnabled)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-all',
                    calendarEnabled
                      ? 'border-orange-500/60 bg-orange-500/10'
                      : 'border-border bg-transparent hover:border-orange-500/30 hover:bg-muted/40'
                  )}
                >
                  <div
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors',
                      calendarEnabled ? 'border-orange-500 bg-orange-500' : 'border-border bg-transparent'
                    )}
                  >
                    {calendarEnabled && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                  </div>
                  <div>
                    <div className="text-[13px] font-medium text-foreground">Google Calendar Sync</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">Auto-join meetings from your calendar</div>
                  </div>
                </button>
              </div>

              <p className="text-xs leading-relaxed text-muted-foreground">
                You can enable integrations later in Settings. For now, focus on getting familiar with EchoBrief.
              </p>

              <div className="flex-1" />
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={() => setStep('preferences')} className="flex-1 border-border text-muted-foreground hover:bg-muted">
                  Back
                </Button>
                <Button type="button" onClick={() => setStep('notifications')} className={primaryBtn}>
                  Next <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ═══ NOTIFICATIONS STEP ═══ */}
          {step === 'notifications' && (
            <div className="flex flex-1 flex-col">
              <h2 className="mb-6 text-2xl font-semibold text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
                Notification Frequency
              </h2>

              <div className="grid grid-cols-1 gap-2">
                {['instant', 'daily', 'weekly', 'never'].map(freq => (
                  <button
                    key={freq}
                    type="button"
                    onClick={() => setNotificationFreq(freq)}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border p-4 text-left text-[13px] font-medium transition-all',
                      notificationFreq === freq
                        ? 'border-orange-500 bg-orange-500/10 text-orange-800 dark:text-orange-300'
                        : 'border-border text-muted-foreground hover:border-orange-500/30 hover:bg-muted/40'
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                        notificationFreq === freq ? 'border-orange-500 bg-orange-500' : 'border-border bg-transparent'
                      )}
                    >
                      {notificationFreq === freq && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                    </div>
                    <div>
                      <div className={cn('capitalize', notificationFreq === freq ? 'text-foreground' : 'text-foreground/80')}>
                        {freq}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {freq === 'instant' && 'Get alerts immediately'}
                        {freq === 'daily' && 'Once per day'}
                        {freq === 'weekly' && 'Once per week'}
                        {freq === 'never' && 'Turn off notifications'}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex-1" />
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={() => setStep('calendar')} className="flex-1 border-border text-muted-foreground hover:bg-muted">
                  Back
                </Button>
                <Button type="button" onClick={() => setStep('complete')} className={primaryBtn}>
                  Next <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ═══ COMPLETE STEP ═══ */}
          {step === 'complete' && (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-orange-500/15 ring-8 ring-orange-500/5">
                <Check className="h-10 w-10 text-orange-500" strokeWidth={2.5} />
              </div>
              <h2 className="mb-2 text-2xl font-semibold text-foreground" style={{ fontFamily: 'var(--font-display)' }}>
                You&apos;re all set
              </h2>
              <p className="mb-8 max-w-sm text-sm leading-relaxed text-muted-foreground">
                You&apos;re ready to capture and analyze your meetings. Use Record on the dashboard to get started.
              </p>

              <div className="flex w-full max-w-md gap-3">
                <Button type="button" variant="outline" onClick={() => setStep('notifications')} className="flex-1 border-border text-muted-foreground hover:bg-muted">
                  Back
                </Button>
                <Button type="button" onClick={handleCompleteOnboarding} disabled={loading} className={cn(primaryBtn, loading && 'opacity-60')}>
                  {loading ? 'Setting up…' : 'Go to Dashboard'}
                </Button>
              </div>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Step {currentStepIndex + 1} of {steps_list.length}
        </p>
      </div>
    </div>
  );
}
