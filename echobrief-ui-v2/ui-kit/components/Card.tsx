import * as React from 'react';

export function Card({ children, padding = 16, style }: { children: React.ReactNode; padding?: number | string; style?: React.CSSProperties }) {
  return <div style={{ borderRadius: 'var(--eb-r-card)', background: 'var(--eb-card)', border: '1px solid var(--eb-border)', boxShadow: 'var(--eb-shadow-card)', padding, ...style }}>{children}</div>;
}

/** Settings-style section: header strip + body. No card inside a card — use <Divider/> rows inside. */
export function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card padding={0} style={{ overflow: 'hidden' }}>
      <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--eb-divider)' }}>
        <div style={{ font: 'var(--eb-h2)' }}>{title}</div>
        {description && <div style={{ font: 'var(--eb-body-sm)', color: 'var(--eb-text-secondary)', marginTop: 3 }}>{description}</div>}
      </div>
      <div style={{ padding: '18px 20px' }}>{children}</div>
    </Card>
  );
}

export function CardHeader({ title, count, right }: { title: string; count?: number; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 12px 12px 18px', borderBottom: '1px solid var(--eb-divider)' }}>
      <div style={{ font: 'var(--eb-h2)' }}>{title}{count !== undefined && <span style={{ font: 'var(--eb-caption)', color: 'var(--eb-text-muted)', marginLeft: 6 }}>{count}</span>}</div>
      {right}
    </div>
  );
}

export const Divider = () => <div style={{ height: 1, background: 'var(--eb-divider)' }} />;
