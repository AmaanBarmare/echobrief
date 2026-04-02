import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ChevronRight, Check, Calendar, Bell, Zap, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
    } catch (err: any) {
      alert('Error completing onboarding: ' + err.message);
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

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#0F0E0D',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{ maxWidth: 500, width: '100%' }}>
        {/* Header with gradient */}
        <div style={{
          background: 'linear-gradient(135deg, #F97316, #F59E0B)',
          borderRadius: 16,
          padding: 40,
          textAlign: 'center',
          marginBottom: 40,
          color: 'white',
        }}>
          <h1 style={{
            fontSize: 32,
            fontWeight: 700,
            margin: '0 0 8px 0',
            fontFamily: 'Outfit, sans-serif',
            letterSpacing: '-0.02em',
          }}>
            Welcome to EchoBrief
          </h1>
          <p style={{
            fontSize: 14,
            opacity: 0.9,
            margin: 0,
          }}>
            AI-powered meeting intelligence
          </p>
        </div>

        {/* Progress steps */}
        <div style={{
          display: 'flex',
          gap: 8,
          marginBottom: 40,
          justifyContent: 'center',
        }}>
          {steps_list.map((s, i) => (
            <div
              key={s.id}
              style={{
                flex: 1,
                height: 6,
                borderRadius: 3,
                background: currentStepIndex >= i ? '#F97316' : '#292524',
                transition: 'all 0.3s ease',
              }}
            />
          ))}
        </div>

        {/* Step content */}
        <div style={{
          background: '#1C1917',
          border: '1px solid #292524',
          borderRadius: 16,
          padding: 32,
          minHeight: 350,
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* ═══ WELCOME STEP ═══ */}
          {step === 'welcome' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <h2 style={{
                fontSize: 24,
                fontWeight: 600,
                color: '#FAFAF9',
                marginBottom: 16,
                fontFamily: 'Outfit, sans-serif',
              }}>
                Let's get started
              </h2>
              <p style={{
                color: '#A8A29E',
                fontSize: 14,
                lineHeight: 1.6,
                marginBottom: 24,
              }}>
                EchoBrief captures and analyzes your meetings in real-time. Set your preferences to get the most out of AI-powered summaries, action items, and insights.
              </p>
              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', gap: 12 }}>
                <Button
                  onClick={() => setStep('preferences')}
                  style={{
                    flex: 1,
                    background: '#FB923C',
                    color: 'white',
                  }}
                >
                  Get Started <ChevronRight size={16} style={{ marginLeft: 8 }} />
                </Button>
              </div>
            </div>
          )}

          {/* ═══ PREFERENCES STEP ═══ */}
          {step === 'preferences' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <h2 style={{
                fontSize: 24,
                fontWeight: 600,
                color: '#FAFAF9',
                marginBottom: 24,
                fontFamily: 'Outfit, sans-serif',
              }}>
                Your Preferences
              </h2>

              <div style={{ marginBottom: 24 }}>
                <label style={{
                  display: 'block',
                  color: '#FAFAF9',
                  fontSize: 13,
                  fontWeight: 500,
                  marginBottom: 12,
                }}>
                  Preferred Languages
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  {['English', 'Hindi', 'Spanish', 'French'].map(lang => (
                    <button
                      key={lang}
                      onClick={() => {
                        if (languages.includes(lang)) {
                          setLanguages(languages.filter(l => l !== lang));
                        } else {
                          setLanguages([...languages, lang]);
                        }
                      }}
                      style={{
                        padding: '12px',
                        borderRadius: 8,
                        border: `1px solid ${languages.includes(lang) ? '#F97316' : '#292524'}`,
                        background: languages.includes(lang) ? 'rgba(249,115,22,0.1)' : 'transparent',
                        color: languages.includes(lang) ? '#FB923C' : '#A8A29E',
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 500,
                        fontFamily: 'inherit',
                        transition: 'all 0.2s',
                      }}
                    >
                      {languages.includes(lang) && '✓ '}{lang}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', gap: 12 }}>
                <Button
                  onClick={() => setStep('welcome')}
                  variant="outline"
                  style={{ flex: 1, color: '#A8A29E' }}
                >
                  Back
                </Button>
                <Button
                  onClick={() => setStep('calendar')}
                  style={{
                    flex: 1,
                    background: '#FB923C',
                    color: 'white',
                  }}
                >
                  Next <ChevronRight size={16} style={{ marginLeft: 8 }} />
                </Button>
              </div>
            </div>
          )}

          {/* ═══ CALENDAR STEP ═══ */}
          {step === 'calendar' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <h2 style={{
                fontSize: 24,
                fontWeight: 600,
                color: '#FAFAF9',
                marginBottom: 24,
                fontFamily: 'Outfit, sans-serif',
              }}>
                Calendar Integration
              </h2>

              <div style={{ marginBottom: 20 }}>
                <button
                  onClick={() => setCalendarEnabled(!calendarEnabled)}
                  style={{
                    width: '100%',
                    padding: '16px',
                    borderRadius: 8,
                    border: `1px solid ${calendarEnabled ? '#F97316' : '#292524'}`,
                    background: calendarEnabled ? 'rgba(249,115,22,0.1)' : 'transparent',
                    color: '#FAFAF9',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    transition: 'all 0.2s',
                  }}
                >
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 4,
                      border: `2px solid ${calendarEnabled ? '#FB923C' : '#292524'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: calendarEnabled ? '#FB923C' : 'transparent',
                    }}
                  >
                    {calendarEnabled && <Check size={14} color="white" />}
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                      Google Calendar Sync
                    </div>
                    <div style={{ fontSize: 12, color: '#78716C' }}>
                      Auto-join meetings from your calendar
                    </div>
                  </div>
                </button>
              </div>

              <p style={{
                color: '#78716C',
                fontSize: 12,
                lineHeight: 1.5,
              }}>
                💡 You can enable integrations later in settings. For now, focus on getting familiar with EchoBrief.
              </p>

              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', gap: 12 }}>
                <Button
                  onClick={() => setStep('preferences')}
                  variant="outline"
                  style={{ flex: 1, color: '#A8A29E' }}
                >
                  Back
                </Button>
                <Button
                  onClick={() => setStep('notifications')}
                  style={{
                    flex: 1,
                    background: '#FB923C',
                    color: 'white',
                  }}
                >
                  Next <ChevronRight size={16} style={{ marginLeft: 8 }} />
                </Button>
              </div>
            </div>
          )}

          {/* ═══ NOTIFICATIONS STEP ═══ */}
          {step === 'notifications' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <h2 style={{
                fontSize: 24,
                fontWeight: 600,
                color: '#FAFAF9',
                marginBottom: 24,
                fontFamily: 'Outfit, sans-serif',
              }}>
                Notification Frequency
              </h2>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                {['instant', 'daily', 'weekly', 'never'].map(freq => (
                  <button
                    key={freq}
                    onClick={() => setNotificationFreq(freq)}
                    style={{
                      padding: '16px',
                      borderRadius: 8,
                      border: `1px solid ${notificationFreq === freq ? '#F97316' : '#292524'}`,
                      background: notificationFreq === freq ? 'rgba(249,115,22,0.1)' : 'transparent',
                      color: notificationFreq === freq ? '#FB923C' : '#A8A29E',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      fontSize: 13,
                      fontWeight: 500,
                      fontFamily: 'inherit',
                      transition: 'all 0.2s',
                      textAlign: 'left',
                    }}
                  >
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 50,
                        border: `2px solid ${notificationFreq === freq ? '#FB923C' : '#292524'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: notificationFreq === freq ? '#FB923C' : 'transparent',
                        flexShrink: 0,
                      }}
                    >
                      {notificationFreq === freq && <Check size={12} color="white" />}
                    </div>
                    <div>
                      <div style={{ textTransform: 'capitalize' }}>{freq}</div>
                      <div style={{ fontSize: 11, opacity: 0.7 }}>
                        {freq === 'instant' && 'Get alerts immediately'}
                        {freq === 'daily' && 'Once per day'}
                        {freq === 'weekly' && 'Once per week'}
                        {freq === 'never' && 'Turn off notifications'}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', gap: 12 }}>
                <Button
                  onClick={() => setStep('calendar')}
                  variant="outline"
                  style={{ flex: 1, color: '#A8A29E' }}
                >
                  Back
                </Button>
                <Button
                  onClick={() => setStep('complete')}
                  style={{
                    flex: 1,
                    background: '#FB923C',
                    color: 'white',
                  }}
                >
                  Next <ChevronRight size={16} style={{ marginLeft: 8 }} />
                </Button>
              </div>
            </div>
          )}

          {/* ═══ COMPLETE STEP ═══ */}
          {step === 'complete' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center' }}>
              <div style={{
                width: 80,
                height: 80,
                borderRadius: '50%',
                background: 'rgba(249,115,22,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 24px',
              }}>
                <Check size={40} color="#FB923C" />
              </div>
              <h2 style={{
                fontSize: 24,
                fontWeight: 600,
                color: '#FAFAF9',
                marginBottom: 12,
                fontFamily: 'Outfit, sans-serif',
              }}>
                All set! 🎉
              </h2>
              <p style={{
                color: '#A8A29E',
                fontSize: 14,
                lineHeight: 1.6,
                marginBottom: 32,
              }}>
                You're ready to capture and analyze your meetings. Click Record to get started.
              </p>

              <div style={{ display: 'flex', gap: 12 }}>
                <Button
                  onClick={() => setStep('notifications')}
                  variant="outline"
                  style={{ flex: 1, color: '#A8A29E' }}
                >
                  Back
                </Button>
                <Button
                  onClick={handleCompleteOnboarding}
                  disabled={loading}
                  style={{
                    flex: 1,
                    background: '#FB923C',
                    color: 'white',
                    opacity: loading ? 0.6 : 1,
                  }}
                >
                  {loading ? '⏳ Setting up...' : 'Go to Dashboard'}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <p style={{
          textAlign: 'center',
          color: '#78716C',
          fontSize: 12,
          marginTop: 24,
        }}>
          Step {currentStepIndex + 1} of {steps_list.length}
        </p>
      </div>
    </div>
  );
}
