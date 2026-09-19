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
 * The coordinates are traced from the supplied artwork rather than eyeballed:
 * every centreline and stroke width below was measured off the light app-icon
 * tile at 322px and scaled into this 64-unit box.
 *
 * The mark is a house drawn in two strokes. The roof is a chevron running
 * blue through teal to a warm green; the wave beneath it is the house's
 * walls, and reads as a W, running blue through deep navy to coral and
 * amber. A four-pane window sits under the apex, and a leaf on a short stem
 * grows past the roofline on the right.
 *
 * Three of the shapes carry a halo painted in the surface colour. That is
 * what produces the clean separations the original has where the leaf, the
 * stem and the wave cross the roof — so the mark must be told what it is
 * sitting on, which is what `surface` is for everywhere it is drawn.
 */

/** The box every path below is expressed in. */
export const VIEW_BOX = 64;

/**
 * The house's interior. Filled with the surface colour rather than left
 * transparent, so the roof's inner edge stays crisp against the wave.
 */
export const HOUSE_PATH = "M14.5 32.2 L31.55 20.6 L45.6 31.4 L45.6 44 L14.5 44 Z";

export const ROOF_PATH = "M12.9 32.5 L31.55 18.6 L47.2 32.2";
export const WAVE_PATH =
  "M13.2 41.6 C16.4 45 20.2 50.7 23.9 50.7 C27.4 50.7 28.8 45.5 31.3 45.5 " +
  "C33.8 45.5 35.2 50.7 38.4 50.7 C42.2 50.7 46 44.8 50.2 41.2";
export const STEM_PATH = "M50.3 35.3 L50.3 27.3";
export const LEAF_PATH =
  "M45.7 23.9 C44.8 16.4 49.1 11.8 54.4 11.2 C55.6 18 52.1 23.2 45.7 23.9 Z";

export const STROKE = { roof: 6.3, wave: 6.3, stem: 6.1 } as const;

/** Wide enough to read as a gap at 16px, narrow enough not to eat the roof. */
export const HALO = { wave: 9.2, stem: 9.2, leaf: 2.6 } as const;

export const WINDOW_PANES = [
  { x: 26.8, y: 30.1 },
  { x: 31.7, y: 30.1 },
  { x: 26.8, y: 35 },
  { x: 31.7, y: 35 },
] as const;

export const PANE = { width: 3.9, height: 3.7, radius: 1.05 } as const;

export type GradientStop = { offset: number; color: string };

export type GradientSpec = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stops: readonly GradientStop[];
};

export const GRADIENTS: Record<"roof" | "wave" | "leaf" | "stem", GradientSpec> = {
  roof: {
    x1: 11,
    y1: 33,
    x2: 47,
    y2: 24,
    stops: [
      { offset: 0, color: "#0d8cdf" },
      { offset: 0.32, color: "#2fb3d6" },
      { offset: 0.55, color: "#56c7c8" },
      { offset: 0.78, color: "#8ecba3" },
      { offset: 1, color: "#c8c67b" },
    ],
  },
  wave: {
    x1: 13,
    y1: 46,
    x2: 50,
    y2: 46,
    stops: [
      { offset: 0, color: "#2ba5e0" },
      { offset: 0.2, color: "#0d76c2" },
      { offset: 0.42, color: "#04497f" },
      { offset: 0.58, color: "#0d6094" },
      { offset: 0.7, color: "#f4747f" },
      { offset: 0.86, color: "#fb9d73" },
      { offset: 1, color: "#fcbb6a" },
    ],
  },
  leaf: {
    x1: 46,
    y1: 23,
    x2: 54,
    y2: 13,
    stops: [
      { offset: 0, color: "#2f9e6d" },
      { offset: 1, color: "#9ccf5c" },
    ],
  },
  stem: {
    x1: 50,
    y1: 38.5,
    x2: 50,
    y2: 24,
    stops: [
      { offset: 0, color: "#1f9f90" },
      { offset: 1, color: "#45b673" },
    ],
  },
};

/**
 * The window, which is the one part of the mark that cannot keep its colour
 * on a dark surface.
 *
 * Everything else here is a saturated gradient that holds up against cream and
 * against navy alike. The panes are a single deep blue, and deep blue on a
 * dark background is a hole rather than a window — so on dark they become the
 * light blue the supplied dark tile uses.
 */
export const WINDOW_COLOR = { light: "#0e6aa1", dark: "#35beec" } as const;

/** The surfaces the standalone icon files are drawn on. */
export const TILE = { light: "#ffffff", dark: "#16243a" } as const;

/**
 * The brand's own colours, for the wordmark and for anywhere a screen needs
 * to reach for the palette deliberately.
 */
export const BRAND_INK = "#182638";
export const BRAND_HOME_GRADIENT = { light: ["#0f83be", "#3fb897"], dark: ["#4cb8ec", "#63d4a8"] } as const;

export const TAGLINE = "A happier home. Everyday.";
