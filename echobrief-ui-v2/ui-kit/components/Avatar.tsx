import * as React from 'react';

/** Initial avatar. Colour is stable per initial. `round` for people lists, square (9px) for meeting rows. */
export function Avatar({ name, size = 34, round }: { name: string; size?: number; round?: boolean }) {
  const initial = (name.trim()[0] || '?').toUpperCase();
  const i = (initial.charCodeAt(0) + size) % 6;
  return (
    <span style={{ width: size, height: size, borderRadius: round ? '50%' : 'var(--eb-r-tile)', background: `var(--eb-av-${i}-bg)`, color: `var(--eb-av-${i}-fg)`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--eb-font-heading)', fontWeight: 600, fontSize: Math.round(size * .38), flex: 'none', boxShadow: 'inset 0 0 0 1px rgba(28,25,23,.05)' }}>
      {initial}
    </span>
  );
}

/** Brand mark on a white bordered tile. Put SVG/PNGs in public/brands/. */
export function BrandTile({ brand, size = 36 }: { brand: 'gcal' | 'outlook' | 'gmail' | 'whatsapp' | 'slack' | 'zoho' | 'meet' | 'zoom'; size?: number }) {
  const img = Math.round(size * .54);
  return (
    <span style={{ width: size, height: size, borderRadius: 'var(--eb-r-tile)', background: '#fff', border: '1px solid var(--eb-border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', boxShadow: 'var(--eb-shadow-card)' }}>
      <img src={`/brands/${brand}.svg`} onError={(e) => { (e.currentTarget as HTMLImageElement).src = `/brands/${brand}.png`; }} alt={brand} width={img} height={img} style={{ objectFit: 'contain', display: 'block' }} />
    </span>
  );
}
