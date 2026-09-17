#!/usr/bin/env node
/**
 * Import boundary lint (CI gate for story 00-006).
 *
 * The monorepo's layering is only real if it is enforced. These are the rules,
 * each one a thing that quietly rots otherwise:
 *
 *   1. `apps/web` reaches shared code through the `@wonderhome/core/...` subpath
 *      exports. Not a relative path into `packages/`, and not `/src/...` — both
 *      bypass the package's public surface and make it unchangeable.
 *   2. `packages/*` never imports from `apps/*`. Shared code cannot depend on
 *      one of its consumers.
 *   3. A domain module package imports `@wonderhome/core` or another module's
 *      `contract` entry point — never another module's internals.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const SOURCE = /\.(ts|tsx|mts|js|jsx|mjs)$/;
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build", "coverage"]);

const IMPORT = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+["']([^"']+)["']/g;
const DYNAMIC = /\bimport\(\s*["']([^"']+)["']\s*\)/g;

export function lintImports(file, source) {
  const problems = [];
  const specifiers = [
    ...[...source.matchAll(IMPORT)].map((m) => m[1]),
    ...[...source.matchAll(DYNAMIC)].map((m) => m[1]),
  ];

  const inApp = file.startsWith("apps/");
  const inPackage = file.startsWith("packages/");
  const packageName = inPackage ? file.split("/")[1] : null;

  for (const specifier of specifiers) {
    if (inApp) {
      if (/(^|\/)\.\.\/packages\//.test(specifier) || specifier.startsWith("../../packages/")) {
        problems.push(
          `${file}: imports "${specifier}" — reach shared code through @wonderhome/core/<entry>, not a relative path into packages/`,
        );
      }
      if (/^@wonderhome\/[^/]+\/src\//.test(specifier)) {
        problems.push(
          `${file}: imports "${specifier}" — use the package's declared export, not its /src internals`,
        );
      }
    }

    if (inPackage) {
      if (specifier.includes("apps/") || /^@\/|^web\//.test(specifier)) {
        problems.push(`${file}: imports "${specifier}" — packages must not depend on an app`);
      }
      const crossPackage = specifier.match(/^@wonderhome\/([^/]+)(?:\/(.+))?$/);
      if (crossPackage && crossPackage[1] !== packageName) {
        const entry = crossPackage[2] ?? "";
        const isModule = crossPackage[1].startsWith("module-");
        if (isModule && !entry.startsWith("contract")) {
          problems.push(
            `${file}: imports "${specifier}" — a module is reachable only through its contract entry point`,
          );
        }
      }
    }
  }

  return problems;
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (SOURCE.test(entry)) yield full;
  }
}

function main() {
  const problems = [];
  let checked = 0;
  for (const base of ["apps", "packages"]) {
    let exists = true;
    try {
      statSync(join(ROOT, base));
    } catch {
      exists = false;
    }
    if (!exists) continue;
    for (const full of walk(join(ROOT, base))) {
      checked += 1;
      problems.push(...lintImports(relative(ROOT, full), readFileSync(full, "utf8")));
    }
  }

  if (problems.length > 0) {
    console.error("Import boundary lint failed:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log(`Import boundary lint passed (${checked} files).`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  main();
}
