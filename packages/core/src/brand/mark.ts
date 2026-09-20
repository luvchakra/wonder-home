/**
 * The WonderHome mark, as geometry.
 *
 * One source of truth for a shape that has to exist in two very different
 * places: as JSX inside the app, and as `.svg` and `.png` files on disk for
 * favicons, PWA icons and app stores. Both read this module —
 * `components/ui/brand.tsx` builds the JSX, `scripts/build-brand-assets.ts`
 * writes the files — so the icon on a home screen can never quietly drift
 * from the one in the header.
 *
 * The mark follows the brand sheet at `design/WonderHome-brand-guidelines.png`:
 * a house drawn as two thick strokes that meet at the roof. The left wall and
 * left slope are the brand's blue, running into teal and green as they cross
 * the apex; the right slope and right wall are warm yellow deepening to
 * orange at the ground. A four-pane window sits in the body, and a leaf
 * grows out of the bottom-right corner, over the yellow wall.
 *
 * The strokes end in flat cuts (butt caps): flat on the ground at the two
 * wall feet, and a clean diagonal seam where the blue tip overlaps the start
 * of the yellow slope. The leaf carries a halo in the surface colour, which is
 * what keeps it separate from the wall it sits over — so the mark must be told
 * what it is sitting on, which is what `surface` is for everywhere it is drawn.
 */

/** The box every path below is expressed in. */
export const VIEW_BOX = 64;

/**
 * The house's interior. Filled with the surface colour rather than left
 * transparent, so the body reads as a solid house on any background.
 */
export const HOUSE_PATH = "M17.5 50 L17.5 29.5 L32 17 L46.5 29.5 L46.5 50 Z";

/** Left foot, up the left wall, over the apex, and a little way down the right slope. */
export const BLUE_PATH = "M17.5 50 L17.5 29.5 L32 17 L36.1 20.5";
/** Starts just under the blue tip, down the right slope, and down the right wall to its foot. */
export const YELLOW_PATH = "M35.2 19.75 L46.5 29.5 L46.5 50";

export const LEAF_PATH = "M43.5 51.5 C42.5 42.5 48 35 57.5 34.5 C58.2 44 52.5 51.8 43.5 51.5 Z";
export const LEAF_VEIN_PATH = "M45.6 49.4 C48.4 44.6 51.8 40.2 55.6 36.6";

export const STROKE = { house: 8.5, vein: 1.3 } as const;

/** Wide enough to read as a gap at 16px, narrow enough not to eat the wall. */
export const HALO = { leaf: 2.6 } as const;

export const WINDOW_PANES = [
  { x: 26.8, y: 30.8 },
  { x: 32.8, y: 30.8 },
  { x: 26.8, y: 36.8 },
  { x: 32.8, y: 36.8 },
] as const;

export const PANE = { width: 4.4, height: 4.4, radius: 1.1 } as const;

export type GradientStop = { offset: number; color: string };

export type GradientSpec = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stops: readonly GradientStop[];
};

/** The palette from the brand sheet, as it runs along each shape. */
export const GRADIENTS: Record<"blue" | "yellow" | "leaf", GradientSpec> = {
  blue: {
    x1: 17.5,
    y1: 50,
    x2: 37,
    y2: 19,
    stops: [
      { offset: 0, color: "#0ea5e9" },
      { offset: 0.5, color: "#22b4f0" },
      { offset: 0.8, color: "#1cc0c0" },
      { offset: 1, color: "#22c55e" },
    ],
  },
  yellow: {
    x1: 35,
    y1: 20,
    x2: 46.5,
    y2: 50,
    stops: [
      { offset: 0, color: "#fbbf24" },
      { offset: 0.6, color: "#f8b020" },
      { offset: 1, color: "#f59e0b" },
    ],
  },
  leaf: {
    x1: 43.5,
    y1: 51.5,
    x2: 57.5,
    y2: 34.5,
    stops: [
      { offset: 0, color: "#15803d" },
      { offset: 0.5, color: "#22c55e" },
      { offset: 1, color: "#4ade80" },
    ],
  },
};

/**
 * The window panes: the brand's Primary Blue, lifted a step on a dark
 * surface so the panes still read as glass rather than as holes.
 */
export const WINDOW_COLOR = { light: "#0ea5e9", dark: "#38bdf8" } as const;

/** The surfaces the standalone icon files are drawn on: white, and the brand's Navy. */
export const TILE = { light: "#ffffff", dark: "#0f172a" } as const;

/**
 * The brand's own colours, for the wordmark and for anywhere a screen needs
 * to reach for the palette deliberately.
 */
export const BRAND_INK = "#0f172a";
export const BRAND_HOME_GRADIENT = { light: ["#0284c7", "#0ea5e9"], dark: ["#38bdf8", "#7dd3fc"] } as const;

export const TAGLINE = "A happier home. Everyday.";
