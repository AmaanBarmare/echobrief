import * as React from 'react';

const control: React.CSSProperties = { height: 'var(--eb-input-h)', padding: '0 12px', borderRadius: 'var(--eb-r-input)', border: '1px solid var(--eb-border)', background: '#fff', boxShadow: 'var(--eb-inset-input)', font: 'var(--eb-body)', color: 'var(--eb-text)', width: '100%', outline: 'none' };

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ font: 'var(--eb-label)' }}>{label}</span>
      {children}
      {hint && <span style={{ font: 'var(--eb-caption)', color: 'var(--eb-text-muted)' }}>{hint}</span>}
    </label>
  );
}

export const Input = (p: React.InputHTMLAttributes<HTMLInputElement>) => <input {...p} style={{ ...control, ...p.style }} />;
export const Textarea = (p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} style={{ ...control, height: 'auto', padding: '10px 12px', lineHeight: 1.5, resize: 'vertical', ...p.style }} />;

/** Pill select. */
export const Select = (p: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...p} style={{ height: 34, padding: '0 34px 0 14px', borderRadius: 'var(--eb-r-pill)', border: '1px solid var(--eb-border)', background: `#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23A8A29E' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") no-repeat right 10px center`, appearance: 'none', font: 'var(--eb-body-sm)', boxShadow: 'var(--eb-shadow-btn)', ...p.style }} />
);

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button role="switch" aria-checked={on} onClick={() => onChange(!on)} style={{ width: 38, height: 22, borderRadius: 'var(--eb-r-pill)', background: on ? 'var(--eb-accent)' : '#D9D1C8', position: 'relative', border: 0, padding: 0, cursor: 'pointer', boxShadow: 'inset 0 1px 2px rgba(28,25,23,.12)', flex: 'none' }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(28,25,23,.25)', transition: 'left .15s' }} />
    </button>
  );
}

export function Checkbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button role="checkbox" aria-checked={checked} onClick={() => onChange(!checked)} style={{ width: 18, height: 18, borderRadius: 6, padding: 0, cursor: 'pointer', flex: 'none', border: checked ? 0 : '1.5px solid #CFC6BC', background: checked ? 'var(--eb-accent)' : '#fff', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: checked ? 'inset 0 1px 0 rgba(255,255,255,.2)' : 'var(--eb-inset-input)' }}>
      {checked && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-10" /></svg>}
    </button>
  );
}
