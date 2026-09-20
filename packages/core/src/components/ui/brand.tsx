import {
  BLUE_PATH,
  GRADIENTS,
  HALO,
  HOUSE_PATH,
  LEAF_PATH,
  LEAF_VEIN_PATH,
  PANE,
  STROKE,
  TAGLINE,
  VIEW_BOX,
  WINDOW_PANES,
  WORDMARK_LETTERS,
  YELLOW_PATH,
  type WordmarkTone,
} from "../../brand/mark";
import { useId } from "react";

import { cn } from "../../lib/cn";

/**
 * The WonderHome mark: a house drawn in two strokes — blue on the left, warm
 * yellow on the right — with a leaf growing from its corner.
 *
 * Inline SVG rather than an image so it scales without a second asset, costs
 * no request, and can take its surface colour from the theme. The geometry
 * lives in `brand/mark.ts`, which the icon files on disk are generated from
 * too — the mark in the header and the icon on a home screen cannot drift.
 *
 * **Surface.** The house body is filled with, and the leaf is haloed in, the
 * colour of whatever the mark is sitting on — the halo is what keeps the leaf
 * separate from the wall it grows over. It reads `--wh-brand-surface`: the
 * page background by default, and `Card` re-declares it as the card's own
 * surface, so a mark inside a card gets the right surface through
 * inheritance rather than a prop threaded down through every screen.
 *
 * **Gradient ids.** Every instance gets its own ids. A page often carries the
 * mark twice with one copy hidden — the sign-in screen's illustrated panel
 * and its phone header — and a browser resolves `url(#…)` to the first
 * element with that id in the document, even one inside a `display: none`
 * subtree, whose gradients then paint nothing: the house vanished and only
 * the window panes were left. `useId` is stable across server and client.
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
  const surface = "var(--wh-brand-surface)";
  const generated = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const prefix = idPrefix ?? `wh-mark-${generated}`;
  const gradient = (name: keyof typeof GRADIENTS) => `${prefix}-${name}`;

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
        {(Object.keys(GRADIENTS) as (keyof typeof GRADIENTS)[]).map((name) => {
          const spec = GRADIENTS[name];
          return (
            <linearGradient
              key={name}
              id={gradient(name)}
              x1={spec.x1}
              y1={spec.y1}
              x2={spec.x2}
              y2={spec.y2}
              gradientUnits="userSpaceOnUse"
            >
              {spec.stops.map((stop) => (
                <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
              ))}
            </linearGradient>
          );
        })}
      </defs>

      <path d={HOUSE_PATH} fill={surface} />
      <path
        d={YELLOW_PATH}
        fill="none"
        stroke={`url(#${gradient("yellow")})`}
        strokeWidth={STROKE.house}
        strokeLinecap="butt"
        strokeLinejoin="round"
      />
      <path
        d={BLUE_PATH}
        fill="none"
        stroke={`url(#${gradient("blue")})`}
        strokeWidth={STROKE.house}
        strokeLinecap="butt"
        strokeLinejoin="round"
      />

      <g fill="var(--wh-brand-window)">
        {WINDOW_PANES.map((pane) => (
          <rect
            key={`${pane.x}-${pane.y}`}
            x={pane.x}
            y={pane.y}
            width={PANE.width}
            height={PANE.height}
            rx={PANE.radius}
          />
        ))}
      </g>

      <path d={LEAF_PATH} fill="none" stroke={surface} strokeWidth={HALO.leaf} strokeLinejoin="round" />
      <path d={LEAF_PATH} fill={`url(#${gradient("leaf")})`} />
      <path d={LEAF_VEIN_PATH} fill="none" stroke={surface} strokeWidth={STROKE.vein} strokeLinecap="round" />
    </svg>
  );
}

const LETTER_VAR: Record<WordmarkTone, string> = {
  blue: "var(--wh-brand-letter-blue)",
  yellow: "var(--wh-brand-letter-yellow)",
  green: "var(--wh-brand-letter-green)",
  navy: "var(--wh-brand-letter-navy)",
};

/**
 * The mark with the name beside it, as the brand sheet's lockup: the house
 * mark, then "WonderHome" running through the brand's rainbow letter by
 * letter (`WORDMARK_LETTERS`, the one source this and the share-card
 * generator both read), and the tagline set small, upper-case and
 * letter-spaced beneath.
 *
 * Colour is decoration on a word that is also spelled out in full — a
 * visually-hidden "WonderHome" carries the accessible name, and the coloured
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
