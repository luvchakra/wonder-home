/**
 * Writes every brand asset on disk from the one geometry module.
 *
 * Icons are the assets most likely to rot: they are binary, they live far
 * from the component they should match, and nobody notices a stale one until
 * it is on somebody's home screen. So none of them are hand-made. This reads
 * `packages/core/src/brand/mark.ts` — the same module the React mark renders
 * from — and writes the SVGs and PNGs `apps/web/public` serves.
 *
 * Run it with `npm run brand`. `npm run brand -- --check` re-renders
 * everything into memory and fails if what is on disk differs, which is what
 * CI runs, so an edit to the mark that does not reach the icons cannot merge.
 *
 * Two surfaces, because an icon cannot adapt once it is a PNG on a home
 * screen: a light tile for light contexts and a dark one for dark. The
 * maskable variants carry the extra padding the Android safe zone needs —
 * without them a launcher crops a circle straight through the roof.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import {
  BLUE_PATH,
  GRADIENTS,
  HALO,
  HOUSE_PATH,
  LEAF_PATH,
  LEAF_VEIN_PATH,
  PANE,
  STROKE,
  TILE,
  VIEW_BOX,
  WINDOW_COLOR,
  WINDOW_PANES,
  WORDMARK_COLORS,
  WORDMARK_LETTERS,
  YELLOW_PATH,
  TAGLINE,
} from "../packages/core/src/brand/mark.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "apps", "web", "public");

type Scheme = "light" | "dark";

/**
 * The mark on its own rounded tile.
 *
 * Every asset here is tiled: a file on disk cannot adapt to what it lands on,
 * so it brings its own surface, and that surface is also what fills the house
 * body and cuts the leaf's halo. The bare, surface-aware mark is the React component's job.
 *
 * `padding` is in viewBox units, and is the only difference between an icon
 * meant to be shown whole and a maskable one a launcher may crop.
 */
function markSvg(options: { scheme: Scheme; padding?: number }): string {
  const { scheme, padding = 0 } = options;
  const surface = TILE[scheme];
  const span = VIEW_BOX + padding * 2;

  const defs = (Object.keys(GRADIENTS) as (keyof typeof GRADIENTS)[])
    .map((name) => {
      const spec = GRADIENTS[name];
      const stops = spec.stops
        .map((stop) => `<stop offset="${stop.offset}" stop-color="${stop.color}"/>`)
        .join("");
      return `<linearGradient id="${name}" x1="${spec.x1}" y1="${spec.y1}" x2="${spec.x2}" y2="${spec.y2}" gradientUnits="userSpaceOnUse">${stops}</linearGradient>`;
    })
    .join("\n    ");

  const panes = WINDOW_PANES.map(
    (pane) =>
      `<rect x="${pane.x}" y="${pane.y}" width="${PANE.width}" height="${PANE.height}" rx="${PANE.radius}"/>`,
  ).join("");

  const background = `<rect x="${-padding}" y="${-padding}" width="${span}" height="${span}" rx="${span * 0.2237}" fill="${surface}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-padding} ${-padding} ${span} ${span}" width="${span}" height="${span}">
  <defs>
    ${defs}
  </defs>
  ${background}
  <path d="${HOUSE_PATH}" fill="${surface}"/>
  <path d="${YELLOW_PATH}" fill="none" stroke="url(#yellow)" stroke-width="${STROKE.house}" stroke-linecap="butt" stroke-linejoin="round"/>
  <path d="${BLUE_PATH}" fill="none" stroke="url(#blue)" stroke-width="${STROKE.house}" stroke-linecap="butt" stroke-linejoin="round"/>
  <g fill="${WINDOW_COLOR[scheme]}">${panes}</g>
  <path d="${LEAF_PATH}" fill="none" stroke="${surface}" stroke-width="${HALO.leaf}" stroke-linejoin="round"/>
  <path d="${LEAF_PATH}" fill="url(#leaf)"/>
  <path d="${LEAF_VEIN_PATH}" fill="none" stroke="${surface}" stroke-width="${STROKE.vein}" stroke-linecap="round"/>
</svg>
`;
}


/** The page's own background, which the share card brings with it. */
const CARD_SURFACE = "#fbf8f3";
const MUTED = "#5b6577";

const FONTS = join(ROOT, "assets", "fonts");

/**
 * The card a link turns into when somebody shares it.
 *
 * WhatsApp, iMessage and every group chat that matters show this and
 * nothing else — no CSS, no fonts of the page's own, one flat image. So it
 * is rendered here from the same geometry the header draws, against the
 * product's own cream, with Sora from `assets/fonts` because nothing
 * outside the browser has the brand's typeface otherwise.
 *
 * 1200x630 is the size every platform crops from safely, and the content
 * sits well inside that so a square crop still contains the whole mark and
 * the name.
 */
async function shareCard(): Promise<Buffer> {
  const width = 1200;
  const height = 630;

  const markSize = 200;
  const mark = await sharp(Buffer.from(markSvg({ scheme: "light" })))
    .resize(markSize, markSize)
    .png()
    .toBuffer();

  // Pango markup, one span per letter, so the card's wordmark is the exact
  // same rainbow WORDMARK_LETTERS draws live rather than a second logo
  // guessed into alignment by hand.
  const wordmarkText = WORDMARK_LETTERS.map(
    (letter) => `<span foreground="${WORDMARK_COLORS.light[letter.tone]}">${letter.char}</span>`,
  ).join("");
  const wordmark = await sharp({
    text: {
      text: wordmarkText,
      font: "Sora Bold",
      fontfile: join(FONTS, "Sora-Bold.ttf"),
      rgba: true,
      dpi: 900,
    },
  })
    .png()
    .toBuffer();

  const tagline = await sharp({
    text: {
      text: `<span foreground="${MUTED}">${TAGLINE}</span>`,
      font: "Sora",
      fontfile: join(FONTS, "Sora-Regular.ttf"),
      rgba: true,
      dpi: 330,
    },
  })
    .png()
    .toBuffer();

  const wordmarkMeta = await sharp(wordmark).metadata();
  const taglineMeta = await sharp(tagline).metadata();

  // Laid out as one centred column, measured rather than guessed, so a
  // longer tagline re-centres itself instead of drifting off the card.
  const gapAfterMark = 44;
  const gapAfterWordmark = 28;
  const block = markSize + gapAfterMark + (wordmarkMeta.height ?? 0) + gapAfterWordmark + (taglineMeta.height ?? 0);
  const top = Math.round((height - block) / 2);

  return sharp({
    create: { width, height, channels: 4, background: CARD_SURFACE },
  })
    .composite([
      { input: mark, top, left: Math.round((width - markSize) / 2) },
      {
        input: wordmark,
        top: top + markSize + gapAfterMark,
        left: Math.round((width - (wordmarkMeta.width ?? 0)) / 2),
      },
      {
        input: tagline,
        top: top + markSize + gapAfterMark + (wordmarkMeta.height ?? 0) + gapAfterWordmark,
        left: Math.round((width - (taglineMeta.width ?? 0)) / 2),
      },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

type Asset = { path: string; bytes: Buffer };

async function png(svg: string, size: number): Promise<Buffer> {
  return sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
}

async function build(): Promise<Asset[]> {
  const assets: Asset[] = [];
  const add = (path: string, bytes: Buffer | string) =>
    assets.push({ path, bytes: typeof bytes === "string" ? Buffer.from(bytes) : bytes });

  for (const scheme of ["light", "dark"] as Scheme[]) {
    const tile = markSvg({ scheme });
    // Maskable icons lose their outer ~10% to whatever shape a launcher wants.
    const maskable = markSvg({ scheme, padding: VIEW_BOX * 0.14 });
    const suffix = scheme === "light" ? "" : "-dark";

    add(`icon${suffix}.svg`, tile);
    add(`icon-192${suffix}.png`, await png(tile, 192));
    add(`icon-512${suffix}.png`, await png(tile, 512));
    add(`icon-maskable-512${suffix}.png`, await png(maskable, 512));
  }

  // Apple ignores the manifest and takes this one flat file, which is always
  // shown on the user's own wallpaper — so it is the light tile, full bleed.
  add("apple-touch-icon.png", await png(markSvg({ scheme: "light" }), 180));

  // What a shared link looks like in a group chat.
  add("og.png", await shareCard());

  return assets;
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const assets = await build();
  const stale: string[] = [];

  for (const asset of assets) {
    const target = join(PUBLIC, asset.path);

    if (check) {
      const current = await readFile(target).catch(() => null);
      const same = current !== null && digest(current) === digest(asset.bytes);
      if (!same) stale.push(relative(ROOT, target));
      continue;
    }

    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, asset.bytes);
  }

  if (check && stale.length > 0) {
    console.error(
      `Brand assets are out of date:\n${stale.map((path) => `  ${path}`).join("\n")}\n\n` +
        "The mark changed but the icons on disk did not. Run `npm run brand`.",
    );
    process.exit(1);
  }

  console.log(
    check
      ? `Brand assets are current (${assets.length} files).`
      : `Wrote ${assets.length} brand assets to apps/web/public.`,
  );
}

function digest(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

await main();
