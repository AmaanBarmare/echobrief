import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type ThemeToggleProps = {
  className?: string;
  variant?: 'icon' | 'navbar';
};

export function ThemeToggle({ className, variant = 'icon' }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const toggle = () => {
    setTheme(isDark ? 'light' : 'dark');
  };

  if (variant === 'navbar') {
    return (
      <button
        type="button"
        onClick={toggle}
        className={cn(
          'inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border/80 bg-background/60 text-muted-foreground transition-colors',
          'hover:bg-secondary hover:text-foreground backdrop-blur-sm',
          className,
        )}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {isDark ? <Sun className="h-[18px] w-[18px]" strokeWidth={1.75} /> : <Moon className="h-[18px] w-[18px]" strokeWidth={1.75} />}
      </button>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      className={cn('h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground', className)}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <Sun className="h-[18px] w-[18px]" strokeWidth={1.75} /> : <Moon className="h-[18px] w-[18px]" strokeWidth={1.75} />}
    </Button>
  );
}
