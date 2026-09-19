import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { Permission } from "../identity/permissions";
import {
  EXPORT_SECTIONS,
  describeExport,
  exportFilename,
  sectionsFor,
} from "./export";

/**
 * What a copy of your data contains (story 15-007).
 *
 * The important tests here are the two that fail loudly: an export that names
 * a column the database does not have 500s for the person who asked, and an
 * export that ignores a permission hands somebody a file they could not have
 * read on screen. Both are the kind of bug you find in production.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const MIGRATIONS = join(REPO_ROOT, "supabase", "migrations");

/** Every column each table declares, read straight from the migrations. */
function schema(): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();

  for (const file of readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");

    for (const match of sql.matchAll(/create table public\.(\w+)\s*\(([\s\S]*?)\n\);/g)) {
      const [, table, body] = match;
      const columns = new Set<string>();
      for (const line of body!.split("\n")) {
        const column = /^\s{2}([a-z_]+)\s+[a-z]/.exec(line);
        if (column && !["constraint", "unique", "primary", "check", "foreign"].includes(column[1]!)) {
          columns.add(column[1]!);
        }
      }
      tables.set(table!, columns);
    }

    // Columns added later must count too, or an export of one would look wrong.
    for (const match of sql.matchAll(/alter table public\.(\w+)\s+add column(?: if not exists)? (\w+)/g)) {
      tables.get(match[1]!)?.add(match[2]!);
    }
  }

  return tables;
}

describe("the export matches the database", () => {
  const tables = schema();

  it("reads the schema at all", () => {
    // If this fails the checks below are vacuous, which is worse than failing.
    expect(tables.size).toBeGreaterThan(30);
    expect(tables.get("household_members")).toContain("display_name");
  });

  for (const section of EXPORT_SECTIONS) {
    it(`"${section.label}" names only real columns of ${section.table}`, () => {
      const columns = tables.get(section.table);
      expect(columns, `${section.table} is not a table`).toBeDefined();

      for (const column of section.columns) {
        expect(columns, `${section.table}.${column}`).toContain(column);
      }
      if (section.memberColumn) {
        expect(columns, `${section.table}.${section.memberColumn}`).toContain(section.memberColumn);
      }
      // Every section is filtered by household; a table without the column
      // would return the wrong tenant's rows or nothing at all.
      expect(columns, `${section.table}.household_id`).toContain("household_id");
    });
  }

  it("resolves the one section that reaches its member through a hop", () => {
    const via = EXPORT_SECTIONS.filter((section) => section.scope === "member_via");
    expect(via.length).toBeGreaterThan(0);

    for (const section of via) {
      expect(section.via, section.key).toBeDefined();
      const parent = tables.get(section.via!.table);
      expect(parent, section.via!.table).toBeDefined();
      expect(parent).toContain(section.via!.memberColumn);
      expect(parent).toContain(section.via!.idColumn);
      expect(tables.get(section.table)).toContain(section.via!.localColumn);
    }
  });
});

describe("the export never widens what somebody may see", () => {
  it("withholds finance from a member who cannot see finance", () => {
    const child: Permission[] = ["school.view_own"];
    const keys = sectionsFor(child).map((section) => section.key);

    expect(keys).not.toContain("obligations");
    expect(keys).not.toContain("orders");
    expect(keys).not.toContain("integrations");
  });

  it("gives a head everything the export offers", () => {
    const head: Permission[] = ["finance.view", "finance.pay", "integrations.manage", "household.manage"];
    expect(sectionsFor(head)).toHaveLength(EXPORT_SECTIONS.length);
  });

  it("scopes every personal section to one member", () => {
    // A section about a person that took the whole household would put one
    // member's notifications in another's file.
    for (const section of EXPORT_SECTIONS) {
      if (section.scope === "member") {
        expect(section.memberColumn, section.key).toBeDefined();
      }
    }
  });

  it("never exports a key, a token or the audit trail", () => {
    const tables = EXPORT_SECTIONS.map((section) => section.table);
    expect(tables).not.toContain("household_ai_credentials");
    expect(tables).not.toContain("audit_events");
    expect(tables).not.toContain("step_up_verifications");
    expect(tables).not.toContain("household_invitations");
  });

  it("never selects everything from a table", () => {
    // `*` means a sensitive column added next year joins the export silently.
    for (const section of EXPORT_SECTIONS) {
      expect(section.columns, section.key).not.toContain("*");
      expect(section.columns.length, section.key).toBeGreaterThan(0);
    }
  });
});

describe("what a person is told before they ask", () => {
  it("names what is coming and what is not", () => {
    const said = describeExport(["school.view_own"]).join(" ");
    expect(said).toContain("Your copy will contain");
    expect(said).toContain("Not included");
    expect(said).toContain("Never included");
  });

  it("says plainly when nothing is held back", () => {
    const said = describeExport(["finance.view", "integrations.manage"]).join(" ");
    expect(said).toContain("Nothing is held back");
  });
});

describe("the file it arrives as", () => {
  it("is dated and named after the household", () => {
    expect(exportFilename("The Nair Family", new Date("2026-09-19T10:00:00Z"))).toBe(
      "wonderhome-the-nair-family-2026-09-19.json",
    );
  });

  it("copes with a household name that is all punctuation", () => {
    expect(exportFilename("!!!", new Date("2026-09-19T10:00:00Z"))).toBe(
      "wonderhome-household-2026-09-19.json",
    );
  });
});

describe("the retention sweep matches the database", () => {
  const tables = schema();

  it("names only real tables and columns", async () => {
    const { PURGE_TARGETS } = await import("./purge");

    for (const [key, targets] of Object.entries(PURGE_TARGETS)) {
      for (const target of targets ?? []) {
        const columns = tables.get(target.table);
        expect(columns, `${key}: ${target.table} is not a table`).toBeDefined();
        // A purge pointed at a column that does not exist deletes nothing, and
        // says so only in a log nobody reads.
        expect(columns, `${key}: ${target.table}.${target.column}`).toContain(target.column);
      }
    }
  });
})
