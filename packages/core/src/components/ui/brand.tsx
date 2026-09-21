import {
  GRADIENTS,
  HEART_PATH,
  HOUSE_PATH,
  TAGLINE,
  VIEW_BOX,
  WORDMARK_LETTERS,
  type WordmarkTone,
} from "../../brand/mark";
import { useId } from "react";

import { cn } from "../../lib/cn";

/**
 * The WonderHome mark: a rounded tile carrying the brand's Primary-to-
 * Secondary gradient, a white house silhouette, and a heart cut from its
 * centre so the gradient shows through.
 *
 * Inline SVG rather than an image so it scales without a second asset, costs
 * no request, and needs no per-surface variant — unlike the previous mark,
 * this one carries its own tile rather than reading the page it sits on, so
 * it looks identical in a header, a card or a dark footer. The geometry
 * lives in `brand/mark.ts`, which the icon files on disk are generated from
 * too — the mark in the header and the icon on a home screen cannot drift.
 *
 * **Gradient ids.** Every instance gets its own id. A page can carry the
 * mark twice with one copy hidden — the sign-in screen's illustrated panel
 * and its phone header — and a browser resolves `url(#…)` to the first
 * element with that id in the document, even one inside a `display: none`
 * subtree, whose gradient then paints nothing. `useId` is stable across
 * server and client.
 */
export function BrandMark({
  className,
  size = 28,
  idPrefix,
  title,
}: {
  className?: string;
  size?: number;
  idPrefix?: string;
  /** Give the mark a name when it is the only thing identifying the product. */
  title?: string;
}) {
  const generated = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const prefix = idPrefix ?? `wh-mark-${generated}`;
  const gradientId = `${prefix}-tile`;
  const tile = GRADIENTS.tile;
  const radius = VIEW_BOX * 0.2237;

  return (
    <svg
      viewBox={`0 0 ${VIEW_BOX} ${VIEW_BOX}`}
      width={size}
      height={size}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={cn("shrink-0", className)}
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1={tile.x1}
          y1={tile.y1}
          x2={tile.x2}
          y2={tile.y2}
          gradientUnits="userSpaceOnUse"
        >
          {tile.stops.map((stop) => (
            <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
          ))}
        </linearGradient>
      </defs>

      <rect x={0} y={0} width={VIEW_BOX} height={VIEW_BOX} rx={radius} fill={`url(#${gradientId})`} />
      <path d={HOUSE_PATH} fill="#ffffff" />
      <path d={HEART_PATH} fill={`url(#${gradientId})`} />
    </svg>
  );
}

const LETTER_VAR: Record<WordmarkTone, string> = {
  ink: "var(--wh-brand-letter-ink)",
};

/**
 * The mark with the name beside it, as the brand sheet's lockup: the house
 * tile, then "WonderHome" in the brand's ink (`WORDMARK_LETTERS`, the one
 * source this and the share-card generator both read), and the tagline set
 * small, upper-case and letter-spaced beneath.
 *
 * Colour is decoration on a word that is also spelled out in full — a
 * visually-hidden "WonderHome" carries the accessible name, and the styled
 * letters are `aria-hidden`, so nothing here is the only way to read it.
 */
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
        <span className="block text-[1.0625rem] font-bold tracking-tight">
          <span className="sr-only">WonderHome</span>
          <span aria-hidden>
            {WORDMARK_LETTERS.map((letter, index) => (
              <span key={index} style={{ color: LETTER_VAR[letter.tone] }}>
                {letter.char}
              </span>
            ))}
          </span>
        </span>
        {tagline ? (
          <span className="mt-0.5 block text-[0.5625rem] font-semibold tracking-[0.14em] whitespace-nowrap text-[var(--wh-foreground-muted)] uppercase">
            {TAGLINE}
          </span>
        ) : null}
      </span>
    </span>
  );
}
