import { cn } from "../../lib/cn";

/**
 * The botanical corner.
 *
 * The mockups frame their warm surfaces — the splash, the sign up card, the
 * landing hero — with soft greenery rather than a hard edge. It is drawn
 * rather than photographed so it inherits the household's own tones, costs
 * one inline SVG, and stays crisp at any size.
 *
 * Purely decorative: it is hidden from assistive technology, never carries
 * meaning, and is placed so that nothing readable ever sits on top of it.
 */
export type LeafDecorProps = {
  corner?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  size?: number;
  /** 0–1. The mockups keep it faint; anything bolder competes with the content. */
  opacity?: number;
  className?: string;
};

const CORNERS = {
  "top-left": "top-0 left-0 -translate-x-1/4 -translate-y-1/4",
  "top-right": "top-0 right-0 translate-x-1/4 -translate-y-1/4 scale-x-[-1]",
  "bottom-left": "bottom-0 left-0 -translate-x-1/4 translate-y-1/4 scale-y-[-1]",
  "bottom-right": "right-0 bottom-0 translate-x-1/4 translate-y-1/4 scale-[-1]",
} as const;

export function LeafDecor({
  corner = "top-right",
  size = 220,
  opacity = 0.5,
  className,
}: LeafDecorProps) {
  return (
    <svg
      aria-hidden
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      className={cn("pointer-events-none absolute select-none", CORNERS[corner], className)}
      style={{ opacity }}
    >
      {/* Stems first, so every leaf sits over its own branch. */}
      <path
        d="M196 12C160 28 126 54 104 92c-14 24-22 50-26 78"
        stroke="var(--wh-leaf-stem)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M198 62c-26 6-52 20-72 42-12 13-21 28-27 44"
        stroke="var(--wh-leaf-stem)"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Leaves: one teardrop shape, rotated and scaled around the stems. */}
      <g fill="var(--wh-leaf)">
        <Leaf x={168} y={22} rotate={-28} scale={1} />
        <Leaf x={186} y={44} rotate={18} scale={0.82} />
        <Leaf x={142} y={44} rotate={-52} scale={0.9} />
        <Leaf x={158} y={72} rotate={12} scale={0.74} />
        <Leaf x={118} y={74} rotate={-70} scale={0.86} />
        <Leaf x={136} y={104} rotate={6} scale={0.68} />
        <Leaf x={96} y={112} rotate={-86} scale={0.78} />
        <Leaf x={112} y={142} rotate={-4} scale={0.6} />
        <Leaf x={80} y={150} rotate={-100} scale={0.66} />
      </g>
      <g fill="var(--wh-leaf-light)">
        <Leaf x={178} y={8} rotate={-8} scale={0.62} />
        <Leaf x={128} y={26} rotate={-40} scale={0.58} />
        <Leaf x={100} y={92} rotate={-62} scale={0.54} />
        <Leaf x={74} y={176} rotate={-92} scale={0.5} />
      </g>
    </svg>
  );
}

/** One teardrop leaf with a centre vein, drawn at the origin and placed by transform. */
function Leaf({ x, y, rotate, scale }: { x: number; y: number; rotate: number; scale: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
      <path d="M0 0C14 -4 28 2 34 14 24 24 8 24 0 14-3 9-3 4 0 0Z" />
      <path
        d="M2 7C11 8 21 11 30 15"
        stroke="var(--wh-leaf-vein)"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
      />
    </g>
  );
}
