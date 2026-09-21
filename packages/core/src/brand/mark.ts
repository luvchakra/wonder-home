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
 * The mark follows the current brand sheet: a rounded-square tile carrying a
 * diagonal gradient from the brand's Primary (indigo) to Secondary
 * (emerald), with a simple white house silhouette centred on it and a heart
 * cut from the house so the gradient shows through — "the home with heart"
 * reading the sheet's app icon is built around. No leaf, no two-tone stroke:
 * the house is one filled shape, and the heart is the only accent inside it.
 */

/** The box every path below is expressed in. */
export const VIEW_BOX = 64;

/**
 * The house, as a single rounded silhouette — a roof running straight into
 * the walls, with softened corners at the eaves and the base so it reads as
 * one continuous shape rather than a box with a roof bolted on.
 */
export const HOUSE_PATH =
  "M32 13.5 L47.5 26.5 L47.5 44.5 C47.5 48.09 44.59 51 41 51 L23 51 C19.41 51 16.5 48.09 16.5 44.5 L16.5 26.5 Z";

/**
 * The heart cut from the house's centre — a standard twin-lobe heart,
 * sized to sit comfortably inside the body below the roofline.
 */
export const HEART_PATH =
  "M32 43.5 C26.5 38.8 22.5 35.1 22.5 30.6 C22.5 27 25.3 24.3 28.7 24.3 C30.6 24.3 32 25.1 32 25.1 C32 25.1 33.4 24.3 35.3 24.3 C38.7 24.3 41.5 27 41.5 30.6 C41.5 35.1 37.5 38.8 32 43.5 Z";

export type GradientStop = { offset: number; color: string };

export type GradientSpec = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stops: readonly GradientStop[];
};

/** The tile's gradient — Primary (indigo) running into Secondary (emerald), top-left to bottom-right. */
export const GRADIENTS: Record<"tile", GradientSpec> = {
  tile: {
    x1: 4,
    y1: 4,
    x2: 60,
    y2: 60,
    stops: [
      { offset: 0, color: "#6366f1" },
      { offset: 0.55, color: "#34b3a6" },
      { offset: 1, color: "#10b981" },
    ],
  },
};

/** The surfaces the standalone icon files are drawn on: white, and the brand's Neutral. */
export const TILE = { light: "#ffffff", dark: "#1f2937" } as const;

/**
 * The wordmark, one letter at a time.
 *
 * The current sheet's lockup is a solid word — "WonderHome" set once in the
 * brand's Neutral ink, never a rainbow — but the letter-array shape stays
 * (every letter tagged `"ink"`) so the live `Wordmark` component and the
 * share-card generator, which both iterate `WORDMARK_LETTERS`, needed no
 * structural change to pick up the new look.
 */
export type WordmarkTone = "ink";

/** `dark` lightens what would otherwise vanish on a dark surface. */
export const WORDMARK_COLORS: Record<"light" | "dark", Record<WordmarkTone, string>> = {
  light: {
    ink: "#1f2937",
  },
  dark: {
    ink: "#f8fafc",
  },
};

export const WORDMARK_LETTERS: readonly { char: string; tone: WordmarkTone }[] = [
  { char: "W", tone: "ink" },
  { char: "o", tone: "ink" },
  { char: "n", tone: "ink" },
  { char: "d", tone: "ink" },
  { char: "e", tone: "ink" },
  { char: "r", tone: "ink" },
  { char: "H", tone: "ink" },
  { char: "o", tone: "ink" },
  { char: "m", tone: "ink" },
  { char: "e", tone: "ink" },
] as const;

export const TAGLINE = "Less mental load. More family time!";
