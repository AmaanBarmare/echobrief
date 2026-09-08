import * as React from 'react';

const eyebrowFor: Record<string, string> = { Meetings: 'Capture', Calendar: 'Capture', 'Action items': 'Capture', Contacts: 'Understand', Coaching: 'Understand', Ask: 'Understand', Workspace: 'Manage', Settings: 'Manage' };

/** Every page starts with this. Same x/y on every page. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  const eyebrow = eyebrowFor[title];
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 20 }}>
      <div>
        {eyebrow && <div style={{ font: 'var(--eb-eyebrow)', textTransform: 'uppercase', letterSpacing: '.09em', color: 'var(--eb-accent)', marginBottom: 6 }}>{eyebrow}</div>}
        <h1 style={{ margin: 0, font: 'var(--eb-h1)', letterSpacing: '-.02em' }}>{title}</h1>
        {subtitle && <div style={{ font: 'var(--eb-body-sm)', fontSize: 13.5, color: 'var(--eb-text-secondary)', marginTop: 4 }}>{subtitle}</div>}
      </div>
      {actions}
    </div>
  );
}

export function StatTile({ label, value, delta, icon, accent }: { label: string; value: string; delta?: string; icon?: React.ReactNode; accent?: boolean }) {
  return (
    <div style={{ borderRadius: 'var(--eb-r-card)', background: 'var(--eb-card)', border: '1px solid var(--eb-border)', boxShadow: 'var(--eb-shadow-card)', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', font: 'var(--eb-caption)', color: 'var(--eb-text-secondary)' }}>
        {label}
        {icon && <span style={{ display: 'flex', width: 28, height: 28, borderRadius: 'var(--eb-r-pill)', alignItems: 'center', justifyContent: 'center', background: accent ? 'var(--eb-accent-soft)' : 'var(--eb-bg)', color: accent ? 'var(--eb-accent)' : 'var(--eb-text-secondary)' }}>{icon}</span>}
      </div>
      <div style={{ font: 'var(--eb-stat)', letterSpacing: '-.02em', marginTop: 6, color: accent ? 'var(--eb-accent)' : 'inherit' }}>{value}</div>
      {delta && <div style={{ font: 'var(--eb-caption)', fontSize: 12, color: 'var(--eb-text-muted)', marginTop: 4 }}>{delta}</div>}
    </div>
  );
}

/** Uppercase section label used inside cards (DECISIONS, KEY NUMBERS…). */
export const Label = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--eb-text-secondary)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{children}</div>
);
