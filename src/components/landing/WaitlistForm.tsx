import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { onWaitlistOpen } from '@/lib/waitlist';

const fieldClass =
  'w-full rounded-lg px-3.5 py-3 text-[16px] outline-none transition-colors placeholder:opacity-55 md:text-[14.5px]';

const fieldStyle = {
  background: 'var(--paper)',
  border: '1px solid var(--rule)',
  color: 'var(--ink)',
  fontFamily: 'var(--font-brand-body)',
} as const;

export function WaitlistForm() {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [company, setCompany] = useState('');
  // Honeypot: real people never see this field, bots fill everything.
  const [website, setWebsite] = useState('');
  const [source, setSource] = useState('cta');
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'already'>('idle');
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(
    () =>
      onWaitlistOpen((from) => {
        setSource(from);
        // Let the smooth scroll start before stealing focus, or the browser
        // jumps straight to the field and cancels the animation.
        window.setTimeout(() => nameRef.current?.focus(), 450);
      }),
    [],
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'saving') return;
    setError(null);

    if (website.trim()) {
      // Bot. Show the same success state rather than telling it it was caught.
      setStatus('done');
      return;
    }

    setStatus('saving');
    const { error: insertError } = await supabase.from('waitlist').insert({
      email: email.trim(),
      full_name: fullName.trim(),
      company: company.trim() || null,
      source,
    });

    if (insertError) {
      // 23505 = the unique index on lower(email). Being on the list twice is
      // not a failure worth showing someone a red error for.
      if (insertError.code === '23505') {
        setStatus('already');
        return;
      }
      setStatus('idle');
      setError('Could not save that just now. Try again in a moment?');
      return;
    }
    setStatus('done');
  };

  if (status === 'done' || status === 'already') {
    return (
      <div
        className="relative mx-auto mt-9 flex max-w-[440px] flex-col items-center gap-3 rounded-2xl px-6 py-8"
        style={{ background: 'var(--paper)', border: '1px solid var(--rule)' }}
      >
        <span
          className="flex h-11 w-11 items-center justify-center rounded-full"
          style={{ background: 'color-mix(in oklch, var(--ember) 14%, transparent)' }}
        >
          <Check className="h-5 w-5" style={{ color: 'var(--ember)' }} strokeWidth={2.5} />
        </span>
        <p
          className="text-[17px]"
          style={{ fontFamily: 'var(--font-brand-serif)', color: 'var(--ink)' }}
        >
          {status === 'already' ? "We already have your details." : 'Thanks — got it.'}
        </p>
        <p className="text-center text-[13.5px] leading-[1.6]" style={{ color: 'var(--ink-mid)' }}>
          We'll email {email.trim() || 'you'} about a team plan. If you just want to start
          on your own, Starter and Pro are self-serve above.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="relative mx-auto mt-9 max-w-[440px] text-left">
      <div className="flex flex-col gap-2.5">
        <input
          ref={nameRef}
          type="text"
          required
          maxLength={120}
          placeholder="Full name"
          aria-label="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className={fieldClass}
          style={fieldStyle}
        />
        <input
          type="email"
          required
          maxLength={254}
          placeholder="Work email"
          aria-label="Work email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={fieldClass}
          style={fieldStyle}
        />
        <input
          type="text"
          maxLength={160}
          placeholder="Company (optional)"
          aria-label="Company"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          className={fieldClass}
          style={fieldStyle}
        />

        <input
          type="text"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
        />

        <button
          type="submit"
          disabled={status === 'saving'}
          className="group mt-1.5 inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3.5 text-[15px] font-bold text-white transition-all hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-70"
          style={{
            background: 'var(--ember)',
            boxShadow: '0 8px 28px color-mix(in oklch, var(--ember) 30%, transparent)',
            fontFamily: 'var(--font-brand-body)',
          }}
        >
          {status === 'saving' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} />
              Sending
            </>
          ) : (
            <>
              Send
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                strokeWidth={2.25}
              />
            </>
          )}
        </button>
      </div>

      {error && (
        <p className="mt-3 text-center text-[13px]" style={{ color: 'var(--ember-deep)' }}>
          {error}
        </p>
      )}
    </form>
  );
}
