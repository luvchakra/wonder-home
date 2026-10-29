import assert from "node:assert/strict";
import { test } from "node:test";

import { baseName, missingFromHistory } from "./check-migrations-applied.mjs";

test("baseName strips the timestamp and extension", () => {
  assert.equal(baseName("20261020200000_food_preferences_diet.sql"), "food_preferences_diet");
  assert.equal(baseName("food_preferences_diet"), "food_preferences_diet");
});

test("files match history by base name, whatever version the history stamped", () => {
  const files = ["20261020200000_food_preferences_diet", "20261021070000_chat_reactions"];
  assert.deepEqual(missingFromHistory(files, ["20261020200000_food_preferences_diet"]), ["20261021070000_chat_reactions"]);
  assert.deepEqual(missingFromHistory(files, ["food_preferences_diet", "chat_reactions"]), []);
});

test("the reconcile SQL in docs/migration-history.md has unique versions and real repo migrations", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const doc = readFileSync(new URL("../docs/migration-history.md", import.meta.url), "utf8");
  const rows = [...doc.matchAll(/^\s+\('(\d{14})', '([a-z0-9_]+)'\)/gm)].map((m) => ({ version: m[1], name: m[2] }));
  assert.ok(rows.length > 0);
  const versions = rows.map((r) => r.version);
  assert.equal(new Set(versions).size, versions.length, "schema_migrations.version is the primary key");
  const repo = new Set(readdirSync(new URL("../supabase/migrations/", import.meta.url)).map(baseName));
  for (const r of rows) assert.ok(repo.has(r.name), `${r.name} is not a repo migration`);
});
