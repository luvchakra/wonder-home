import {
  GRADIENTS,
  HALO,
  HOUSE_PATH,
  LEAF_PATH,
  PANE,
  ROOF_PATH,
  STEM_PATH,
  STROKE,
  TAGLINE,
  VIEW_BOX,
  WAVE_PATH,
  WINDOW_PANES,
} from "../../brand/mark";
import { cn } from "../../lib/cn";

/**
 * The WonderHome mark: a house drawn in two strokes, with a leaf growing past
 * the roofline.
 *
 * Inline SVG rather than an image so it scales without a second asset, costs
 * no request, and can take its surface colour from the theme. The geometry
 * lives in `brand/mark.ts`, which the icon files on disk are generated from
 * too — the mark in the header and the icon on a home screen cannot drift.
 *
 * **Surface.** Three of the shapes are painted with a halo underneath, which
 * is what produces the clean separations where the leaf, the stem and the
 * wave cross the roof. The halo has to be the colour of whatever the mark is
 * sitting on, so it reads `--wh-brand-surface`: the page background by
 * default, and `Card` re-declares it as the card's own surface, so a mark
 * inside a card gets the right halo through inheritance rather than a prop
 * threaded down through every screen.
 *
 * **Gradient ids.** Every instance defines the same four gradients under the
 * same ids, and a duplicate id means the browser resolves `url(#…)` to the
 * first one — which is identical, and expressed in viewBox units, so it
 * renders the same at any size. `idPrefix` exists for the rare case of
 * wanting genuinely separate definitions; it is not needed to be correct.
 */
export function BrandMark({
  className,
  size = 28,
  idPrefix = "wh-mark",
  title,
}: {
  className?: string;
  size?: number;
  idPrefix?: string;
  /** Give the mark a name when it is the only thing identifying the product. */
  title?: string;
}) {
  const surface = "var(--wh-brand-surface)";
  const gradient = (name: keyof typeof GRADIENTS) => `${idPrefix}-${name}`;

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
        d={ROOF_PATH}
        fill="none"
        stroke={`url(#${gradient("roof")})`}
        strokeWidth={STROKE.roof}
        strokeLinecap="round"
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

      <path d={STEM_PATH} fill="none" stroke={surface} strokeWidth={HALO.stem} strokeLinecap="round" />
      <path
        d={STEM_PATH}
        fill="none"
        stroke={`url(#${gradient("stem")})`}
        strokeWidth={STROKE.stem}
        strokeLinecap="round"
      />

      <path d={LEAF_PATH} fill="none" stroke={surface} strokeWidth={HALO.leaf} strokeLinejoin="round" />
      <path d={LEAF_PATH} fill={`url(#${gradient("leaf")})`} />

      <path
        d={WAVE_PATH}
        fill="none"
        stroke={surface}
        strokeWidth={HALO.wave}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={WAVE_PATH}
        fill="none"
        stroke={`url(#${gradient("wave")})`}
        strokeWidth={STROKE.wave}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The mark with the name beside it.
 *
 * "Wonder" takes the page's own ink so it stays legible in either theme;
 * "Home" carries the brand gradient, which is decoration on a word that is
 * also spelled out in full — nothing here is the only way to read it.
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
        <span className="block text-[1.0625rem] font-bold tracking-tight text-[var(--wh-foreground)]">
          Wonder
          <span className="bg-[linear-gradient(90deg,var(--wh-brand-home-from),var(--wh-brand-home-to))] bg-clip-text text-transparent">
            Home
          </span>
        </span>
        {tagline ? (
          <span className="block text-[0.6875rem] font-medium text-[var(--wh-primary)]">{TAGLINE}</span>
        ) : null}
      </span>
    </span>
  );
}
