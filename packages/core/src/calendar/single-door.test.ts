import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The guard rail behind HomeEvents' one door (the owner, 2026-10-22: "every
 * event should be created via the HomeEvents module. put guard rails in place
 * so duplicate entries are not created from various parts of the
 * application"). Anything that adds an event or a school entry goes through
 * `calendar/add-event.ts`, which checks the household's calendar for that day
 * first. A new screen, route, agent or intake that calls the raw writers, or
 * inserts into the tables itself, fails here.
 */

const ROOT = join(__dirname, "../../../..");
const SCANNED = ["packages/core/src", "apps/web/app"];

/** The door itself, and the repositories that hold the raw writers. */
const ALLOWED_CALLERS = new Set(["packages/core/src/calendar/add-event.ts"]);
/**
 * Where rows may be inserted directly: each table's own repository. Their bulk
 * inserts are an integration's sync (`applyEventsSyncPlan`,
 * `applySchoolItemsSyncPlan`), which is keyed by the provider's own id, so the
 * same imported entry is never inserted twice.
 */
const OWNERS: Record<string, string> = {
  family_events: "packages/core/src/family/repository.ts",
  school_items: "packages/core/src/school/repository.ts",
};

function sources(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...sources(path));
    else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) found.push(path);
  }
  return found;
}

const files = SCANNED.flatMap((directory) => sources(join(ROOT, directory))).map((path) => ({ path: relative(ROOT, path), text: readFileSync(path, "utf8") }));

describe("HomeEvents' one door", () => {
  it("scans the app and the core", () => {
    expect(files.length).toBeGreaterThan(200);
    expect(files.some((file) => file.path === "packages/core/src/calendar/add-event.ts")).toBe(true);
  });

  it("is the only caller of the raw event and school-entry writers", () => {
    const offenders = files
      .filter((file) => !ALLOWED_CALLERS.has(file.path) && !Object.values(OWNERS).includes(file.path))
      .filter((file) => /(?<![\w.])(?:createEvent|createSchoolItem)\s*\(/.test(file.text))
      .map((file) => file.path);
    expect(offenders, "add events through addFamilyEvent/addSchoolItem in calendar/add-event.ts").toEqual([]);
  });

  it("leaves inserting into each table to that table's own repository", () => {
    const offenders: string[] = [];
    for (const [table, owner] of Object.entries(OWNERS)) {
      const insert = new RegExp(`from\\(\\s*["']${table}["']\\s*\\)\\s*\\.\\s*(?:insert|upsert)\\b`);
      for (const file of files) if (file.path !== owner && insert.test(file.text)) offenders.push(`${file.path} → ${table}`);
    }
    expect(offenders).toEqual([]);
  });
});
