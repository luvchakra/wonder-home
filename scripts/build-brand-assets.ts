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
  GRADIENTS,
  HALO,
  HOUSE_PATH,
  LEAF_PATH,
  PANE,
  ROOF_PATH,
  STEM_PATH,
  STROKE,
  TILE,
  VIEW_BOX,
  WAVE_PATH,
  WINDOW_COLOR,
  WINDOW_PANES,
} from "../packages/core/src/brand/mark.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "apps", "web", "public");

type Scheme = "light" | "dark";

/**
 * The mark on its own rounded tile.
 *
 * Every asset here is tiled: a file on disk cannot adapt to what it lands on,
 * so it brings its own surface, and that surface is also what the halos are
 * cut out of. The bare, surface-aware mark is the React component's job.
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
  <path d="${ROOF_PATH}" fill="none" stroke="url(#roof)" stroke-width="${STROKE.roof}" stroke-linecap="round" stroke-linejoin="round"/>
  <g fill="${WINDOW_COLOR[scheme]}">${panes}</g>
  <path d="${STEM_PATH}" fill="none" stroke="${surface}" stroke-width="${HALO.stem}" stroke-linecap="round"/>
  <path d="${STEM_PATH}" fill="none" stroke="url(#stem)" stroke-width="${STROKE.stem}" stroke-linecap="round"/>
  <path d="${LEAF_PATH}" fill="none" stroke="${surface}" stroke-width="${HALO.leaf}" stroke-linejoin="round"/>
  <path d="${LEAF_PATH}" fill="url(#leaf)"/>
  <path d="${WAVE_PATH}" fill="none" stroke="${surface}" stroke-width="${HALO.wave}" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${WAVE_PATH}" fill="none" stroke="url(#wave)" stroke-width="${STROKE.wave}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;
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
