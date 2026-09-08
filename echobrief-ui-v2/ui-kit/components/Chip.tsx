import * as React from 'react';

/** Tabs and segmented controls are ChipGroups. Active chip is dark-filled. */
export function Chip({ active, selected, children, onClick, size = 'md', icon }: { active?: boolean; selected?: boolean; children: React.ReactNode; onClick?: () => void; size?: 'md' | 'sm'; icon?: React.ReactNode }) {
  const h = size === 'sm' ? 28 : 32;
  const style: React.CSSProperties = active
    ? { background: 'var(--eb-sidebar)', color: '#fff', borderColor: 'var(--eb-sidebar)' }
    : selected
      ? { background: 'var(--eb-accent-soft)', color: 'var(--eb-accent-text)', borderColor: 'var(--eb-accent)' }
      : { background: '#fff', color: 'var(--eb-text-secondary)', borderColor: 'var(--eb-border)', boxShadow: 'var(--eb-shadow-card)' };
  return (
    <button onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: h, padding: `0 ${size === 'sm' ? 10 : 13}px`, borderRadius: 'var(--eb-r-pill)', border: '1px solid', fontFamily: 'var(--eb-font-body)', fontSize: size === 'sm' ? 12 : 13, fontWeight: 500, whiteSpace: 'nowrap', cursor: 'pointer', ...style }}>
      {icon}{children}
    </button>
  );
}

export function ChipGroup<T extends string>({ options, value, onChange }: { options: T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" style={{ display: 'flex', gap: 6 }}>
      {options.map(o => <Chip key={o} active={o === value} onClick={() => onChange(o)}>{o}</Chip>)}
    </div>
  );
}
