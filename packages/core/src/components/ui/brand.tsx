import { cn } from "../../lib/cn";

/**
 * The WonderHome mark: a house with a heart at its centre.
 *
 * Inline SVG rather than an image so it inherits colour, scales without a
 * second asset, and costs no request. The product and the landing page use the
 * same mark, which is most of what "the marketing feels like the product" means.
 */
export function BrandMark({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
    >
      <path
        d="M32 10 L56 30 L56 54 L8 54 L8 30 Z"
        fill="none"
        stroke="var(--wh-primary)"
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <path
        d="M32 45c-5.5-4.4-10-7.6-10-12a5 5 0 0 1 10-1.2A5 5 0 0 1 42 33c0 4.4-4.5 7.6-10 12z"
        fill="var(--wh-tone-meals)"
      />
    </svg>
  );
}

export function Wordmark({
  className,
  tagline = false,
  size = 28,
}: {
  className?: string;
  tagline?: boolean;
  size?: number;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark size={size} />
      <span className="leading-tight">
        <span className="block text-[1.0625rem] font-bold tracking-tight text-[var(--wh-foreground)]">
          WonderHome
        </span>
        {tagline ? (
          <span className="block text-[0.6875rem] font-medium text-[var(--wh-primary)]">
            Happier Homes. Brighter Tomorrows.
          </span>
        ) : null}
      </span>
    </span>
  );
}
