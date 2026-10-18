import type { SupabaseClient } from "@supabase/supabase-js";

import { CATALOG_BUCKET, fromOpenFoodFacts, type CatalogRow } from "./catalog";

/**
 * Filling the shared grocery catalog (HomeFood 25-006). Server only, with the
 * service role: no household session can write the catalog.
 *
 * Open Food Facts is searched through its public search service with an
 * identifying User-Agent, as its API terms ask. Each product's front picture
 * (the 200 px one) is copied into the catalog bucket, so a household's
 * browser only ever loads it from WonderHome's own storage. A product with no
 * barcode or name is skipped; a picture that is not a small JPEG or PNG is
 * left out, and the entry stays without one.
 *
 * Idempotent: a product is one row per (source, source_id), updated in place.
 */

export const OFF_USER_AGENT = "WonderHome/1.0 (connect@wonderapps.biz)";
const OFF_SEARCH = "https://search.openfoodfacts.org/search";
const OFF_FIELDS = "code,product_name,product_name_en,generic_name,brands,quantity,image_front_small_url,nutriments,categories_tags,countries_tags,last_modified_t";
const MAX_PICTURE_BYTES = 300_000;

/** The everyday things a household adds first: what the catalog is seeded with. */
export const STAPLE_QUERIES = [
  "milk", "curd", "paneer", "butter", "ghee", "cheese", "eggs", "bread", "atta", "maida", "rice", "basmati rice", "poha",
  "toor dal", "moong dal", "chana dal", "masoor dal", "rajma", "besan", "sugar", "salt", "jaggery", "tea", "coffee",
  "sunflower oil", "mustard oil", "olive oil", "turmeric", "chilli powder", "garam masala", "jeera", "biscuits", "noodles",
  "pasta", "oats", "cornflakes", "honey", "jam", "ketchup", "pickle", "peanut butter", "chips", "namkeen", "juice",
  "soft drink", "water", "chocolate", "ice cream", "yogurt", "soya chunks",
] as const;

/**
 * The day's share of the staples, so the nightly sweep keeps the catalog
 * current a few searches at a time instead of all at once: every staple is
 * refreshed about every ten days.
 */
export function todaysQueries(now: Date, perDay = 5): string[] {
  const day = Math.floor(now.getTime() / 86_400_000);
  const start = (day * perDay) % STAPLE_QUERIES.length;
  return Array.from({ length: perDay }, (_, index) => STAPLE_QUERIES[(start + index) % STAPLE_QUERIES.length]!);
}

export type FetchLike = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; headers: { get(name: string): string | null }; json(): Promise<unknown>; arrayBuffer(): Promise<ArrayBuffer> }>;

export type ImportReport = { queries: number; seen: number; saved: number; pictures: number; skipped: number; failed: number };

async function withTimeout<T>(fetchImpl: FetchLike, url: string, timeoutMs: number, read: (response: Awaited<ReturnType<FetchLike>>) => Promise<T>): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { headers: { "User-Agent": OFF_USER_AGENT, Accept: "*/*" }, signal: controller.signal });
    if (!response.ok) return null;
    return await read(response);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Products sold in India for one search, as Open Food Facts returns them. */
export async function searchOpenFoodFacts(fetchImpl: FetchLike, query: string, pageSize = 24): Promise<Record<string, unknown>[]> {
  const q = `${query} countries_tags:"en:india"`;
  const url = `${OFF_SEARCH}?q=${encodeURIComponent(q)}&page_size=${pageSize}&fields=${OFF_FIELDS}`;
  const body = await withTimeout(fetchImpl, url, 15_000, (response) => response.json());
  const hits = (body as { hits?: unknown } | null)?.hits;
  return Array.isArray(hits) ? (hits as Record<string, unknown>[]) : [];
}

/** Only the source's own image host, over https. */
function pictureUrl(product: Record<string, unknown>): string | null {
  const url = product.image_front_small_url;
  return typeof url === "string" && /^https:\/\/images\.openfoodfacts\.org\/images\/products\/[0-9/]+\/[a-z0-9_.-]+\.(jpg|jpeg|png)$/i.test(url) ? url : null;
}

async function copyPicture(admin: SupabaseClient, fetchImpl: FetchLike, row: CatalogRow, url: string): Promise<string | null> {
  const bytes = await withTimeout(fetchImpl, url, 10_000, async (response) => {
    const type = response.headers.get("content-type") ?? "";
    if (!/^image\/(jpeg|png)$/.test(type)) return null;
    const buffer = await response.arrayBuffer();
    return buffer.byteLength > 0 && buffer.byteLength <= MAX_PICTURE_BYTES ? { buffer, type } : null;
  });
  if (!bytes) return null;
  const path = `off/${row.source_id}.${bytes.type === "image/png" ? "png" : "jpg"}`;
  const { error } = await admin.storage.from(CATALOG_BUCKET).upload(path, bytes.buffer, { contentType: bytes.type, upsert: true, cacheControl: "604800" });
  return error ? null : path;
}

/**
 * Good enough for a quick-commerce search: a product sold under an Indian
 * barcode (GS1 India, 890…), with a name, a brand, one pack size and a
 * picture — and not alcohol, which a grocery list does not offer.
 */
export function isCatalogQuality(product: Record<string, unknown>): boolean {
  const row = fromOpenFoodFacts(product);
  if (!row || !row.source_id.startsWith("890") || !row.brand || row.pack_quantity === null) return false;
  const tags = Array.isArray(product.categories_tags) ? product.categories_tags : [];
  if (tags.some((tag) => typeof tag === "string" && /^en:(alcoholic-beverages|beers|wines|spirits|liquors)$/.test(tag))) return false;
  return pictureUrl(product) !== null;
}

async function saveProduct(admin: SupabaseClient, fetchImpl: FetchLike, product: Record<string, unknown>, report: ImportReport): Promise<void> {
  const row = fromOpenFoodFacts(product);
  if (!row) {
    report.skipped += 1;
    return;
  }
  const picture = pictureUrl(product);
  const imagePath = picture ? await copyPicture(admin, fetchImpl, row, picture) : null;
  if (imagePath) report.pictures += 1;
  const { error } = await admin
    .from("grocery_catalog")
    .upsert({ ...row, ...(imagePath ? { image_path: imagePath } : {}), imported_at: new Date().toISOString() }, { onConflict: "source,source_id" });
  if (error) report.failed += 1;
  else report.saved += 1;
}

/**
 * Searches Open Food Facts for each query and saves what it finds. Returns
 * counts only — never product content — for the caller's log.
 */
export async function importOpenFoodFacts(admin: SupabaseClient, fetchImpl: FetchLike, queries: readonly string[]): Promise<ImportReport> {
  const report: ImportReport = { queries: queries.length, seen: 0, saved: 0, pictures: 0, skipped: 0, failed: 0 };
  const done = new Set<string>();
  for (const query of queries) {
    const products = await searchOpenFoodFacts(fetchImpl, query);
    for (const product of products) {
      report.seen += 1;
      const code = typeof product.code === "string" ? product.code.trim() : "";
      if (done.has(code) || !isCatalogQuality(product)) {
        report.skipped += 1;
        continue;
      }
      done.add(code);
      await saveProduct(admin, fetchImpl, product, report);
    }
  }
  return report;
}

/** One page of Indian-barcode products with a brand, the most scanned first. */
export async function indianProductsPage(fetchImpl: FetchLike, page: number, pageSize = 100): Promise<Record<string, unknown>[]> {
  const q = "code:890* AND brands:*";
  const url = `${OFF_SEARCH}?q=${encodeURIComponent(q)}&sort_by=-unique_scans_n&page=${page}&page_size=${pageSize}&fields=${OFF_FIELDS}`;
  const body = await withTimeout(fetchImpl, url, 20_000, (response) => response.json());
  const hits = (body as { hits?: unknown } | null)?.hits;
  return Array.isArray(hits) ? (hits as Record<string, unknown>[]) : [];
}

/**
 * The broad sweep: pages of Indian products, most scanned first, keeping the
 * ones good enough to show (`isCatalogQuality`). Run from the platform's own
 * script for the first fill; idempotent, so a rerun refreshes in place.
 */
export async function sweepIndianProducts(
  admin: SupabaseClient,
  fetchImpl: FetchLike,
  options: { fromPage: number; pages: number; pause?: (ms: number) => Promise<void> },
): Promise<ImportReport> {
  const report: ImportReport = { queries: 0, seen: 0, saved: 0, pictures: 0, skipped: 0, failed: 0 };
  for (let page = options.fromPage; page < options.fromPage + options.pages; page += 1) {
    const products = await indianProductsPage(fetchImpl, page);
    report.queries += 1;
    if (products.length === 0) break;
    for (const product of products) {
      report.seen += 1;
      if (!isCatalogQuality(product)) {
        report.skipped += 1;
        continue;
      }
      await saveProduct(admin, fetchImpl, product, report);
    }
    // Gentle on a volunteer-run service.
    await (options.pause ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(1000);
  }
  return report;
}
