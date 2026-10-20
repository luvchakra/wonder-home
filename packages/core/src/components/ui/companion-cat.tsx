import { cn } from "../../lib/cn";

/**
 * The child's companion cat (story 08-018), drawn in the kit so every screen
 * that shows it shows the same cat. Decoration: it carries no meaning of its
 * own — the card's words do (rule 3) — so it is hidden from screen readers.
 */
export function CompanionCat({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" aria-hidden className={cn("shrink-0", className)}>
      <g className="wh-cat-tail">
        <path d="M86 98c16-2 26-14 22-30-2-8-10-10-12-3 3 10-2 20-14 22z" fill="var(--wh-cat-fur)" stroke="var(--wh-cat-fur-dark)" strokeWidth="2" />
      </g>
      <ellipse cx="58" cy="90" rx="30" ry="22" fill="var(--wh-cat-fur)" stroke="var(--wh-cat-fur-dark)" strokeWidth="2" />
      <ellipse cx="58" cy="94" rx="16" ry="13" fill="var(--wh-cat-cream)" />
      <path d="M30 34 26 10l20 14z" fill="var(--wh-cat-fur)" stroke="var(--wh-cat-fur-dark)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M86 34 90 10 70 24z" fill="var(--wh-cat-fur)" stroke="var(--wh-cat-fur-dark)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M32 28 31 17l9 7zM84 28l1-11-9 7z" fill="var(--wh-cat-blush)" />
      <circle cx="58" cy="48" r="30" fill="var(--wh-cat-fur)" stroke="var(--wh-cat-fur-dark)" strokeWidth="2" />
      <path d="M50 22c2 5 6 7 8 7s6-2 8-7" fill="none" stroke="var(--wh-cat-fur-dark)" strokeWidth="2.5" strokeLinecap="round" />
      <g className="wh-cat-eyes">
        <ellipse cx="46" cy="46" rx="4.5" ry="6" fill="var(--wh-cat-ink)" />
        <ellipse cx="70" cy="46" rx="4.5" ry="6" fill="var(--wh-cat-ink)" />
        <circle cx="47.5" cy="43.5" r="1.6" fill="var(--wh-cat-shine)" />
        <circle cx="71.5" cy="43.5" r="1.6" fill="var(--wh-cat-shine)" />
      </g>
      <ellipse cx="40" cy="57" rx="5" ry="3" fill="var(--wh-cat-blush)" opacity="0.8" />
      <ellipse cx="76" cy="57" rx="5" ry="3" fill="var(--wh-cat-blush)" opacity="0.8" />
      <path d="M55 54h6l-3 3.5z" fill="var(--wh-cat-blush)" stroke="var(--wh-cat-ink)" strokeWidth="1" strokeLinejoin="round" />
      <path d="M58 57.5c0 3-2.5 5-5 4M58 57.5c0 3 2.5 5 5 4" fill="none" stroke="var(--wh-cat-ink)" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M30 52 16 50M30 56 17 59M86 52l14-2M86 56l13 3" stroke="var(--wh-cat-fur-dark)" strokeWidth="1.4" strokeLinecap="round" />
      <ellipse cx="44" cy="108" rx="9" ry="5" fill="var(--wh-cat-cream)" stroke="var(--wh-cat-fur-dark)" strokeWidth="1.5" />
      <ellipse cx="70" cy="108" rx="9" ry="5" fill="var(--wh-cat-cream)" stroke="var(--wh-cat-fur-dark)" strokeWidth="1.5" />
    </svg>
  );
}
