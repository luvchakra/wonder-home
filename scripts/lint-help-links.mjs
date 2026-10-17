#!/usr/bin/env node
/**
 * Fails when the user guide points at a page or a section that no longer
 * exists (docs/CI.md; CLAUDE.md, "help content changes with the feature").
 *
 *   node scripts/lint-help-links.mjs
 *
 * Checks:
 *   - every app path in the help modules, the help catalogs and the help page
 *     ("/settings/plan", "/certification") is a route apps/web/app serves;
 *   - every "/help#<anchor>" anywhere in packages/core/src and apps/web/app —
 *     HomeTalk links into the guide this way — names a guide section;
 *   - every FAQ entry's "Read more" section is a guide section.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const APP = join(ROOT, "apps/web/app");
const GUIDE = join(ROOT, "packages/core/src/help/guide.ts");

function* walk(dir, filter) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path, filter);
    else if (filter(path)) yield path;
  }
}

/** The routes apps/web/app serves, as segment patterns: route groups dropped, `[x]` matching any segment. */
export function appRoutes(appDir = APP) {
  const routes = [];
  for (const file of walk(appDir, (path) => /\/(page|route)\.tsx?$/.test(path))) {
    const segments = relative(appDir, file)
      .split("/")
      .slice(0, -1)
      .filter((segment) => !/^\(.*\)$/.test(segment));
    routes.push(segments);
  }
  return routes;
}

export function isRoute(path, routes) {
  const segments = path.replace(/\/+$/, "").split("/").filter(Boolean);
  return routes.some(
    (route) =>
      route.length === segments.length &&
      route.every((part, index) => part.startsWith("[") || part === segments[index]),
  );
}

/** Section ids and FAQ targets, read from guide.ts itself. */
export function guideShape(source) {
  const sections = new Set([...source.matchAll(/\n {4}id: "([a-z0-9-]+)",\n {4}group:/g)].map((m) => m[1]));
  const faqTargets = [...source.matchAll(/\{ id: "([a-z0-9-]+)", section: "([a-z0-9-]+)" \}/g)].map((m) => ({ id: m[1], section: m[2] }));
  return { sections, faqTargets };
}

/** App paths a file mentions as string literals: "/x", "/x/y", "/x#a". */
export function pathsIn(text) {
  return [...text.matchAll(/["'`(](\/[a-z0-9][a-z0-9\-/]*)(#[a-z0-9-]+)?(?=["'`)?\s])/g)].map((m) => ({ path: m[1], anchor: m[2]?.slice(1) }));
}

export function check({ routes, sections, faqTargets, helpFiles, otherFiles }) {
  const problems = [];
  for (const { file, text } of helpFiles) {
    for (const { path, anchor } of pathsIn(text)) {
      if (path.startsWith("/api/") || path.startsWith("/_next/")) continue;
      if (!isRoute(path, routes)) problems.push(`${file}: ${path} is not a page the app serves`);
      if (path === "/help" && anchor && !sections.has(anchor)) problems.push(`${file}: /help#${anchor} is not a guide section`);
    }
  }
  for (const { file, text } of otherFiles) {
    for (const match of text.matchAll(/\/help#([a-z0-9-]+)/g)) {
      if (!sections.has(match[1])) problems.push(`${file}: /help#${match[1]} is not a guide section`);
    }
  }
  for (const { id, section } of faqTargets) {
    if (!sections.has(section)) problems.push(`guide.ts: FAQ "${id}" reads more at #${section}, which is not a guide section`);
  }
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const read = (path) => ({ file: relative(ROOT, path), text: readFileSync(path, "utf8") });
  const source = (path) => /\.(ts|tsx)$/.test(path) && !/\.test\.tsx?$/.test(path);
  const helpDirs = [
    join(ROOT, "packages/core/src/help"),
    join(ROOT, "packages/core/src/i18n/messages/areas/help"),
    join(APP, "help"),
  ];
  const helpFiles = helpDirs.flatMap((dir) => [...walk(dir, source)].map(read));
  const helpPaths = new Set(helpFiles.map((f) => f.file));
  const otherFiles = [join(ROOT, "packages/core/src"), APP]
    .flatMap((dir) => [...walk(dir, source)])
    .map(read)
    .filter((f) => !helpPaths.has(f.file));
  const { sections, faqTargets } = guideShape(readFileSync(GUIDE, "utf8"));
  if (sections.size < 10) {
    console.error(`Only ${sections.size} guide sections found in ${relative(ROOT, GUIDE)}; the check would prove nothing.`);
    process.exit(1);
  }
  const problems = check({ routes: appRoutes(), sections, faqTargets, helpFiles, otherFiles });
  if (problems.length > 0) {
    console.error("The user guide links to something that does not exist:");
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log(`Help links resolve (${sections.size} sections, ${faqTargets.length} FAQ entries, ${helpFiles.length} help files).`);
}
