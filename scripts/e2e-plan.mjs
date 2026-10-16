#!/usr/bin/env node
/**
 * Splits the nightly E2E run into parts (docs/CI.md).
 *
 *   node scripts/e2e-plan.mjs [--specs "e2e/a.spec.ts e2e/b.spec.ts"]
 *                             [--target-minutes 25] [--workers 4]
 *
 * Prints a JSON array of parts — { name, specs, estimateMinutes,
 * budgetMinutes } — for a GitHub Actions matrix, and writes it to
 * $GITHUB_OUTPUT as `parts` when that is set.
 *
 * Balanced by measured time, not file count: e2e/timings.json holds the
 * test-seconds each spec file took (refresh it from a nightly's report with
 * `node scripts/e2e-report.mjs timings`). A spec with no timing yet counts as
 * the slowest known one, so a new file is never assumed to be cheap.
 *
 * One part when the whole run fits the target. Past it, any spec that alone
 * reaches the target gets a part of its own, and the rest are dealt
 * longest-first onto whichever part is lightest.
 */
import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
/** Playwright workers run spec files side by side; a part's wall time is roughly its test-seconds over this, plus startup. */
const OVERHEAD = 1.2;

export function plan({ specs, timings, targetMinutes = 25, workers = 4 }) {
  const known = Object.values(timings);
  const fallback = known.length > 0 ? Math.max(...known) : 60;
  const files = specs.map((file) => ({ file, seconds: timings[file.replace(/^e2e\//, "")] ?? fallback }));
  const wall = (seconds) => (seconds / workers / 60) * OVERHEAD;
  const target = targetMinutes;

  const totalMinutes = wall(files.reduce((sum, f) => sum + f.seconds, 0));
  const count = Math.max(1, Math.ceil(totalMinutes / target));
  const sorted = [...files].sort((a, b) => b.seconds - a.seconds || a.file.localeCompare(b.file));

  const parts = [];
  const rest = [];
  for (const f of sorted) {
    if (count > 1 && wall(f.seconds) >= target) parts.push({ files: [f], seconds: f.seconds });
    else rest.push(f);
  }
  const shared = Math.max(count - parts.length, rest.length > 0 ? 1 : 0);
  const bins = Array.from({ length: shared }, () => ({ files: [], seconds: 0 }));
  for (const f of rest) {
    const lightest = bins.reduce((min, bin) => (bin.seconds < min.seconds ? bin : min), bins[0]);
    lightest.files.push(f);
    lightest.seconds += f.seconds;
  }
  parts.push(...bins.filter((bin) => bin.files.length > 0));

  return parts.map((part, index) => {
    const estimateMinutes = Math.max(1, Math.ceil(wall(part.seconds)));
    return {
      name: parts.length === 1 ? "all" : `part-${index + 1}-of-${parts.length}`,
      specs: part.files.map((f) => f.file).sort().join(" "),
      estimateMinutes,
      // Room for a slow night, but a hung run still ends with a summary
      // rather than holding the runner until GitHub's own six-hour kill.
      budgetMinutes: Math.min(60, Math.max(10, estimateMinutes * 3)),
    };
  });
}

export function allSpecs(dir = join(ROOT, "e2e")) {
  return readdirSync(dir).filter((f) => f.endsWith(".spec.ts")).sort().map((f) => `e2e/${f}`);
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const requested = arg("specs", "").split(/[\s,]+/).filter(Boolean);
  const missing = requested.filter((f) => !existsSync(join(ROOT, f)));
  if (missing.length > 0) {
    console.error(`No such spec file: ${missing.join(", ")}`);
    process.exit(2);
  }
  const timingsPath = join(ROOT, "e2e", "timings.json");
  const parts = plan({
    specs: requested.length > 0 ? requested : allSpecs(),
    timings: existsSync(timingsPath) ? JSON.parse(readFileSync(timingsPath, "utf8")) : {},
    targetMinutes: Number(arg("target-minutes", 25)),
    workers: Number(arg("workers", 4)),
  });
  const json = JSON.stringify(parts);
  console.log(JSON.stringify(parts, null, 2));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `parts=${json}\n`);
}
