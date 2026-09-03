import { Skeleton } from '@/components/ui/skeleton';

interface ListSkeletonProps {
  rows?: number;
  /** Renders the rows inside the same bordered card the real list uses. */
  boxed?: boolean;
}

/**
 * The one loading state for list content.
 *
 * Before this the app spoke four different loading languages: a hand-rolled
 * spinner on the dashboard, `Skeleton` blocks on Action items / Coaching /
 * Meeting detail, eleven `Loader2`s in Settings, and nothing at all on
 * Calendar. Skeletons are for content that is arriving; spinners stay for
 * actions the user just triggered.
 */
export function ListSkeleton({ rows = 4, boxed = true }: ListSkeletonProps) {
  const body = Array.from({ length: rows }).map((_, i) => (
    <div
      key={i}
      className="flex items-center gap-3 px-4 py-4 sm:gap-4 sm:px-5 md:px-6"
      style={{ borderTop: i === 0 ? 'none' : '1px solid var(--rule-soft)' }}
    >
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-[15px] w-[min(60%,240px)]" />
        <Skeleton className="h-[12px] w-[min(40%,170px)]" />
      </div>
      <Skeleton className="h-4 w-4 shrink-0 rounded" />
    </div>
  ));

  if (!boxed) return <div className="space-y-3">{body}</div>;

  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{ border: '1px solid var(--rule)', background: 'var(--paper-card)' }}
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      {body}
    </div>
  );
}
