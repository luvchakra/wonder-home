#!/usr/bin/env node
/**
 * Fails when the user guide's words reach client JavaScript.
 *
 *   node scripts/check-client-bundle.mjs [static dir]   (default apps/web/.next/static)
 *
 * The guide is for signed-in members (security/route-policy.ts), but every
 * file under /_next/static can be downloaded without signing in. Its words
 * are kept out of the general message catalogs for that reason
 * (packages/core/src/help/words.ts); this proves it on the real build, by
 * looking for the guide's own sentences in every client chunk. Runs in CI
 * right after `next build`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const HELP_SOURCE = join(ROOT, "packages/core/src/i18n/messages/areas/help/en.ts");

/**
 * Distinctive pieces of the guide's English prose: from every string value of
 * at least 60 characters, its first run of plain ASCII words, 40–60
 * characters long. Plain ASCII so a minifier's escaping of quotes and dashes
 * cannot hide a match.
 */
export function sentinels(source, elsewhere = "") {
  const found = new Set();
  for (const match of source.matchAll(/"help\.[^"]+":\s*"((?:[^"\\]|\\.){60,})"/g)) {
    const plain = match[1].match(/[A-Za-z][A-Za-z ,.]{39,59}/);
    // A phrase the app's own screens also say (HomeSend's lede shares one with
    // the guide) proves nothing about the guide, so it is not a sentinel.
    if (plain && !elsewhere.includes(plain[0].trim())) found.add(plain[0].trim());
  }
  return [...found];
}

/** Every English catalog except the guide's own: words the app may rightly ship to the browser. */
function appCatalogs() {
  const messages = join(ROOT, "packages/core/src/i18n/messages");
  const areas = join(messages, "areas");
  const parts = [readFileSync(join(messages, "en.ts"), "utf8")];
  for (const area of readdirSync(areas)) {
    if (area === "help") continue;
    try {
      parts.push(readFileSync(join(areas, area, "en.ts"), "utf8"));
    } catch {
      // An area without an English file has nothing to compare.
    }
  }
  return parts.join("\n");
}

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.(js|mjs|json|txt|html)$/.test(entry)) yield path;
  }
}

export function leaks(staticDir, phrases) {
  const hits = [];
  for (const path of files(staticDir)) {
    const text = readFileSync(path, "utf8");
    for (const phrase of phrases) if (text.includes(phrase)) hits.push({ path, phrase });
  }
  return hits;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const staticDir = process.argv[2] ?? join(ROOT, "apps/web/.next/static");
  const phrases = sentinels(readFileSync(HELP_SOURCE, "utf8"), appCatalogs());
  if (phrases.length < 20) {
    console.error(`Only ${phrases.length} sentinel phrases found in ${HELP_SOURCE}; the check would prove nothing.`);
    process.exit(1);
  }
  const hits = leaks(staticDir, phrases);
  if (hits.length > 0) {
    console.error("The user guide's words are in client JavaScript, which anybody can download signed out:");
    for (const { path, phrase } of hits.slice(0, 20)) console.error(`  ${path.replace(`${ROOT}/`, "")}: "${phrase}"`);
    console.error("Keep help text in packages/core/src/help/words.ts and out of the general catalogs.");
    process.exit(1);
  }
  console.log(`No user-guide text in client chunks (${phrases.length} phrases checked).`);
}
