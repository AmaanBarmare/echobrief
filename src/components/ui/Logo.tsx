import { useId } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  linkTo?: string;
  className?: string;
  /** Subtle ripple animation on the logomark (sound-wave metaphor) */
  animated?: boolean;
}

const sizes = {
  sm: { svg: 24, text: 'text-[16px]' },
  md: { svg: 28, text: 'text-[19px]' },
  lg: { svg: 36, text: 'text-[24px]' },
  xl: { svg: 48, text: 'text-[32px]' },
};

function LogoMark({ size = 'md', animated = true }: { size?: LogoProps['size']; animated?: boolean }) {
  const s = sizes[size!].svg;
  const uid = useId().replace(/:/g, '');
  const gradId = `echobrief-grad-${uid}`;

  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn('shrink-0', animated && 'logo-mark-animated')}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" style={{ stopColor: 'var(--ember)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--gold)' }} />
        </linearGradient>
      </defs>
      <circle
        className="logo-ring logo-ring-outer"
        cx="16"
        cy="16"
        r="14"
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="1.2"
      />
      <circle
        className="logo-ring logo-ring-mid"
        cx="16"
        cy="16"
        r="9"
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="1.2"
      />
      <circle className="logo-core" cx="16" cy="16" r="4.5" fill={`url(#${gradId})`} />
    </svg>
  );
}

export function Logo({
  size = 'md',
  showText = true,
  linkTo,
  className,
  animated = true,
}: LogoProps) {
  const content = (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={size} animated={animated} />
      {showText && (
        <span
          className={cn('leading-none', sizes[size].text)}
          style={{ fontFamily: 'var(--font-brand-serif)', letterSpacing: '-0.04em' }}
        >
          <span style={{ color: 'var(--ink)', fontStyle: 'normal' }}>echo</span>
          <em style={{ color: 'var(--ember)', fontStyle: 'italic' }}>brief</em>
        </span>
      )}
    </span>
  );

  if (linkTo) {
    return (
      <Link to={linkTo} className="inline-flex">
        {content}
      </Link>
    );
  }

  return content;
}

export { LogoMark };
