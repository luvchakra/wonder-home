import { Skeleton } from "@wonderhome/core/ui/states";
import { BrandMark } from "@wonderhome/core/ui/brand";

/**
 * What appears the instant a navigation starts, before any data has arrived:
 * the shape of the shell and of a screen. Next streams this immediately —
 * on a soft navigation it is even prefetched — so a tap is answered on the
 * next frame and the real screen replaces it as its data lands.
 */
export default function Loading() {
  return (
    <div className="min-h-dvh" role="status" aria-live="polite" aria-label="Loading">
      <div className="wh-glass sticky top-0 z-30 border-b border-[var(--wh-border)]/70">
        <div className="mx-auto flex h-[var(--wh-header-height)] max-w-[var(--wh-content-wide)] items-center gap-3 px-4 lg:px-8">
          <BrandMark size={30} className="lg:hidden" />
          <Skeleton className="h-4 w-32" />
          <span className="flex-1" />
          <Skeleton className="size-8 rounded-full" />
        </div>
      </div>

      <div className="mx-auto w-full max-w-[var(--wh-content-max)] space-y-5 px-4 pt-5 lg:px-8 lg:pt-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-16 rounded-[var(--wh-radius)]" />
          ))}
        </div>
        <div className="space-y-3">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="flex items-center gap-3 rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-3">
              <Skeleton className="size-10 rounded-[var(--wh-radius-sm)]" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-8 w-16 rounded-[var(--wh-radius-pill)]" />
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
