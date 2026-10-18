/**
 * Pictures for the everyday catalog items (HomeFood 25-010), from Wikimedia
 * Commons, chosen in supabase/seed/grocery-catalog/pictures.csv.
 *
 *   npm run catalog:pictures            check the file
 *   npm run catalog:pictures -- --apply copy each picture into storage and credit it
 *
 * Only the items search actually shows by default (common = true) get one.
 * Each picture is a 330 px thumbnail (Commons' own rounding) fetched from upload.wikimedia.org only,
 * copied into WonderHome's `grocery-catalog` bucket (so a household's browser
 * never loads it from a third party) and recorded with its author, licence and
 * file page, which the app shows beside it — CC BY and CC BY-SA require that.
 * Only CC0, public-domain, CC BY and CC BY-SA pictures are accepted.
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { parseCsv } from "../packages/core/src/commerce/catalog-curated.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const apply = process.argv.includes("--apply");
const AGENT = "WonderHome/1.0 (connect@wonderapps.biz)";
const LICENCE = /^(CC0( 1\.0)?|Public domain|PD.*|CC BY(-SA)? (2\.0|2\.5|3\.0|4\.0))$/i;
const MAX_BYTES = 400_000;

type Picture = { slug: string; title: string; url: string; licence: string; artist: string; page: string };

const [header, ...body] = parseCsv(await readFile(join(ROOT, "supabase", "seed", "grocery-catalog", "pictures.csv"), "utf8"));
if (header?.join(",") !== "slug,file_title,thumb_url,licence,artist,file_page") {
  console.error("pictures.csv header must be slug,file_title,thumb_url,licence,artist,file_page");
  process.exit(1);
}
const problems: string[] = [];
const pictures: Picture[] = [];
const seen = new Set<string>();
for (const [slug = "", title = "", url = "", licence = "", artist = "", page = ""] of body) {
  if (!slug || seen.has(slug)) problems.push(`duplicate or missing slug "${slug}"`);
  else if (!/^https:\/\/upload\.wikimedia\.org\//.test(url)) problems.push(`${slug}: picture is not on upload.wikimedia.org`);
  else if (!LICENCE.test(licence.trim())) problems.push(`${slug}: licence "${licence}" is not accepted`);
  else if (!/^https:\/\/commons\.wikimedia\.org\//.test(page)) problems.push(`${slug}: file page is not on commons.wikimedia.org`);
  else {
    seen.add(slug);
    pictures.push({ slug, title, url, licence: licence.trim(), artist: (artist.trim() || "Unknown author").slice(0, 120), page });
  }
}
if (problems.length > 0) {
  for (const problem of problems) console.error(`pictures.csv: ${problem}`);
  process.exit(1);
}
console.log(`${pictures.length} pictures, all from Wikimedia Commons under an accepted licence.`);
if (!apply) {
  console.log("Checked. Run with --apply to copy them.");
  process.exit(0);
}

const text = await readFile(join(ROOT, "apps", "web", ".env.local"), "utf8").catch(() => "");
const vars: Record<string, string | undefined> = {
  ...Object.fromEntries(
    text
      .split("\n")
      .filter((line) => /^[A-Z0-9_]+=/.test(line))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
  ),
  ...process.env,
};
if (!vars.NEXT_PUBLIC_SUPABASE_URL || !vars.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed to apply.");
  process.exit(1);
}
const admin = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let copied = 0;
const failed: string[] = [];
for (const picture of pictures) {
  const { data: item } = await admin.from("grocery_catalog").select("id, common").eq("source", "wonderhome").eq("source_id", picture.slug).maybeSingle();
  if (!item) {
    failed.push(`${picture.slug} (no such item)`);
    continue;
  }
  if (!item.common) {
    failed.push(`${picture.slug} (not an everyday item)`);
    continue;
  }
  const response = await fetch(picture.url, { headers: { "User-Agent": AGENT } }).catch(() => null);
  const type = response?.headers.get("content-type") ?? "";
  if (!response?.ok || !/^image\/(jpeg|png|webp)$/.test(type)) {
    failed.push(`${picture.slug} (${response?.status ?? "no response"} ${type})`);
    continue;
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) {
    failed.push(`${picture.slug} (${bytes.byteLength} bytes)`);
    continue;
  }
  const extension = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const path = `wonderhome/${picture.slug}.${extension}`;
  const { error: uploadError } = await admin.storage.from("grocery-catalog").upload(path, bytes, { contentType: type, upsert: true, cacheControl: "604800" });
  if (uploadError) {
    failed.push(`${picture.slug} (upload)`);
    continue;
  }
  const { error } = await admin
    .from("grocery_catalog")
    .update({ image_path: path, image_licence: picture.licence.slice(0, 60), image_attribution: picture.artist, image_source_url: picture.page })
    .eq("id", item.id as string);
  if (error) failed.push(`${picture.slug} (record)`);
  else copied += 1;
  // Gentle on Wikimedia's servers.
  await new Promise((resolve) => setTimeout(resolve, 250));
}
console.log(`Applied: ${copied} pictures copied and credited.${failed.length ? ` Not copied: ${failed.join(", ")}` : ""}`);
