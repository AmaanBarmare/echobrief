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
  sm: { svg: 24, text: 'text-[15px]' },
  md: { svg: 28, text: 'text-[17px]' },
  lg: { svg: 36, text: 'text-[22px]' },
  xl: { svg: 48, text: 'text-[28px]' },
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
          <stop offset="0%" stopColor="#F97316" />
          <stop offset="100%" stopColor="#F59E0B" />
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
          className={cn('font-semibold tracking-tight', sizes[size].text)}
          style={{ fontFamily: 'Outfit, sans-serif', letterSpacing: '-0.3px' }}
        >
          <span className="text-foreground">echo</span>
          <span className="text-orange-600 dark:text-orange-400">brief</span>
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
