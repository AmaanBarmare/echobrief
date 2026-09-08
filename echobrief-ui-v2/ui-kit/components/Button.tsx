import * as React from 'react';

type Variant = 'primary' | 'secondary' | 'dark' | 'destructive';
type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: 'md' | 'sm';
  icon?: React.ReactNode;       // a lucide icon, e.g. <Mic size={15} />
  iconRight?: React.ReactNode;
  block?: boolean;              // full width (mobile save buttons)
};

const base: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  borderRadius: 'var(--eb-r-pill)', fontFamily: 'var(--eb-font-body)', fontWeight: 500,
  cursor: 'pointer', border: '1px solid transparent', whiteSpace: 'nowrap', letterSpacing: '-.005em',
};

const variants: Record<Variant, React.CSSProperties> = {
  primary: { background: 'linear-gradient(180deg, var(--eb-accent-top) 0%, var(--eb-accent) 100%)', color: '#fff', boxShadow: 'var(--eb-shadow-primary)' },
  secondary: { background: 'linear-gradient(180deg, #FFFFFF, #FAF8F5)', color: 'var(--eb-text)', borderColor: 'var(--eb-border)', boxShadow: 'var(--eb-shadow-btn)' },
  dark: { background: 'var(--eb-sidebar)', color: '#fff', boxShadow: 'var(--eb-shadow-dark)' },
  destructive: { background: '#fff', color: 'var(--eb-red)', borderColor: 'var(--eb-red-border)', boxShadow: 'var(--eb-shadow-btn)' },
};

export function Button({ variant = 'secondary', size = 'md', icon, iconRight, block, style, children, ...rest }: Props) {
  const h = size === 'sm' ? 32 : 36;
  const iconOnly = !children;
  return (
    <button
      {...rest}
      style={{
        ...base, ...variants[variant], height: h, fontSize: size === 'sm' ? 12.5 : 13.5,
        padding: iconOnly ? 0 : icon ? '0 16px 0 14px' : '0 18px',
        width: iconOnly ? h : block ? '100%' : undefined,
        ...style,
      }}
    >
      {icon && <span style={{ display: 'flex', color: variant === 'secondary' && children ? 'var(--eb-text-secondary)' : 'inherit' }}>{icon}</span>}
      {children}
      {iconRight && <span style={{ display: 'flex' }}>{iconRight}</span>}
    </button>
  );
}

/** Record split button: main action + chevron menu. */
export function SplitButton({ children, icon, onMenu, ...rest }: Props & { onMenu?: () => void }) {
  return (
    <div style={{ display: 'inline-flex', height: 36, borderRadius: 'var(--eb-r-pill)', overflow: 'hidden', background: 'linear-gradient(180deg, var(--eb-accent-top), var(--eb-accent))', color: '#fff', boxShadow: 'var(--eb-shadow-primary)' }}>
      <button {...rest} style={{ ...base, background: 'transparent', color: 'inherit', padding: '0 12px 0 14px', fontSize: 13.5 }}>
        <span style={{ display: 'flex' }}>{icon}</span>{children}
      </button>
      <button onClick={onMenu} aria-label="More" style={{ ...base, background: 'transparent', color: 'inherit', padding: '0 10px 0 8px', borderLeft: '1px solid rgba(255,255,255,.22)', borderRadius: 0 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>
    </div>
  );
}
