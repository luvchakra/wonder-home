#!/usr/bin/env node
/**
 * Builds docs/PROGRESS.md from the backlogs.
 *
 * The trackers this repo already had each answer a different question.
 * `tracking/PROGRESS.md` is the running log of what changed and when;
 * `docs/progress/*.md` say what a piece of work was and how to pick it up.
 * Neither answers "where does the whole application stand right now, story by
 * story" without reading twenty-one backlog files.
 *
 * This generates that view, and generates it rather than asking anybody to
 * maintain it, because a hand-kept summary of 170 stories is a summary that
 * is wrong within a week. The backlogs stay the source of truth; this is a
 * projection of them.
 *
 *   npm run tracker           writes docs/PROGRESS.md
 *   npm run tracker -- --check  fails if it is out of date, for CI
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BACKLOGS = join(ROOT, "backlogs");
const OUTPUT = join(ROOT, "docs", "PROGRESS.md");

/** The statuses a backlog row may carry, in the order they are reported. */
export const STATUSES = ["Done", "In Progress", "Blocked", "Not Started"];

/**
 * Reads one backlog file's module heading and its story table.
 *
 * Only the "Live Module Tracking" rows are read — the per-story prose below
 * repeats the id and would double-count every story if it were matched too.
 */
export function parseBacklog(filename, source) {
  const number = filename.slice(0, 2);
  const heading = source.match(/^#\s+WonderHome\s+—\s+(.+)$/m);
  const title = heading ? heading[1].trim() : filename.replace(/\.md$/, "");

  const stories = [];
  for (const line of source.split("\n")) {
    // | 1 | P0 | 17-001 | Connector framework | Done | notes |
    const row = line.match(
      /^\|\s*(\d+)\s*\|\s*(P\d)\s*\|\s*(\d{2}-\d{3})\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*$/,
    );
    if (!row) continue;

    const [, index, priority, id, name, status, notes] = row;
    stories.push({
      index: Number(index),
      priority,
      id,
      title: name,
      status: STATUSES.includes(status) ? status : status,
      notes,
    });
  }

  return { number, title, slug: filename, stories };
}

export function readBacklogs(directory = BACKLOGS) {
  return readdirSync(directory)
    .filter((name) => /^\d{2}-.*\.md$/.test(name))
    .sort()
    .map((name) => parseBacklog(name, readFileSync(join(directory, name), "utf8")))
    .filter((module) => module.stories.length > 0);
}

export function tally(stories) {
  const counts = Object.fromEntries(STATUSES.map((status) => [status, 0]));
  for (const story of stories) {
    counts[story.status] = (counts[story.status] ?? 0) + 1;
  }
  return counts;
}

/** A ten-cell bar. Only ever full when every story really is done. */
export function bar(done, total) {
  if (total === 0) return "░░░░░░░░░░";
  const filled = done === total ? 10 : Math.min(9, Math.floor((done / total) * 10));
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

export function renderProgress(modules, options = {}) {
  const all = modules.flatMap((module) => module.stories);
  const totals = tally(all);
  const done = totals.Done;
  const percent = all.length === 0 ? 0 : Math.round((done / all.length) * 1000) / 10;

  const lines = [
    "# WonderHome — where the whole application stands",
    "",
    "> Generated from `backlogs/*.md` by `npm run tracker`. **Do not edit by hand** —",
    "> edit the backlog the story lives in and regenerate. `npm run tracker -- --check`",
    "> fails when this file is out of date.",
    "",
    "The backlogs are the source of truth for a story's status. This is a projection",
    "of all twenty-one of them, so that \"what is left\" is one page rather than a",
    "morning's reading. For what a given piece of work actually *was*, see the notes",
    "in `docs/progress/`; for the running log of what changed when, `tracking/PROGRESS.md`.",
    "",
    "## The whole picture",
    "",
    `**${done} of ${all.length} stories done — ${percent}%**`,
    "",
    "| Status | Stories |",
    "|---|---:|",
    ...STATUSES.map((status) => `| ${status} | ${totals[status] ?? 0} |`),
    "",
    "## By module",
    "",
    "| Module | Progress | Done | Total | Left |",
    "|---|---|---:|---:|---|",
  ];

  for (const module of modules) {
    const counts = tally(module.stories);
    const left = module.stories.length - counts.Done;
    const remaining = left === 0 ? "—" : STATUSES.slice(1)
      .filter((status) => counts[status] > 0)
      .map((status) => `${counts[status]} ${status.toLowerCase()}`)
      .join(", ");

    lines.push(
      `| ${module.number} ${module.title} | \`${bar(counts.Done, module.stories.length)}\` | ${counts.Done} | ${module.stories.length} | ${remaining} |`,
    );
  }

  // What is left, first — it is the part anybody planning actually needs.
  const outstanding = modules
    .map((module) => ({ module, stories: module.stories.filter((story) => story.status !== "Done") }))
    .filter((entry) => entry.stories.length > 0);

  lines.push("", "## What is left", "");
  if (outstanding.length === 0) {
    lines.push("Every story in every backlog is done.");
  } else {
    lines.push("| Story | Module | Priority | Status |", "|---|---|---|---|");
    for (const { module, stories } of outstanding) {
      for (const story of stories) {
        lines.push(
          `| \`${story.id}\` ${story.title} | ${module.number} ${module.title} | ${story.priority} | ${story.status} |`,
        );
      }
    }
  }

  lines.push("", "## Every story", "");
  for (const module of modules) {
    const counts = tally(module.stories);
    lines.push(
      `### ${module.number} — ${module.title}`,
      "",
      `${counts.Done} of ${module.stories.length} done \`${bar(counts.Done, module.stories.length)}\``,
      "",
      "| Story | Priority | Status | Notes |",
      "|---|---|---|---|",
    );
    for (const story of module.stories) {
      lines.push(
        `| \`${story.id}\` ${story.title} | ${story.priority} | ${story.status} | ${story.notes || "—"} |`,
      );
    }
    lines.push("");
  }

  if (options.generatedOn) {
    lines.push(`_Generated ${options.generatedOn} from ${modules.length} backlog files._`, "");
  }

  return lines.join("\n");
}

function main() {
  const modules = readBacklogs();
  // The date is the one thing that would churn the file on every run, so it
  // is only written when generating, never compared when checking.
  const body = renderProgress(modules);
  const checking = process.argv.includes("--check");

  if (checking) {
    let current = "";
    try {
      current = readFileSync(OUTPUT, "utf8");
    } catch {
      console.error("docs/PROGRESS.md does not exist. Run: npm run tracker");
      process.exit(1);
    }

    const stripped = current.replace(/\n_Generated [^\n]*_\n?$/, "").trimEnd();
    if (stripped !== body.trimEnd()) {
      console.error(
        "docs/PROGRESS.md is out of date with the backlogs. Run: npm run tracker",
      );
      process.exit(1);
    }

    console.log(`Progress tracker is current (${modules.length} modules).`);
    return;
  }

  const generatedOn = new Date().toISOString().slice(0, 10);
  writeFileSync(OUTPUT, `${body}\n_Generated ${generatedOn} from ${modules.length} backlog files._\n`);
  const total = modules.flatMap((module) => module.stories).length;
  const done = modules.flatMap((module) => module.stories).filter((s) => s.status === "Done").length;
  console.log(`Wrote docs/PROGRESS.md — ${done}/${total} stories done across ${modules.length} modules.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
