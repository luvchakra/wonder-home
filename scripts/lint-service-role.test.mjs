import assert from "node:assert/strict";
import { test } from "node:test";

import { analyze, collect, violations } from "./lint-service-role.mjs";

const file = "apps/web/app/api/v1/households/[householdId]/x/route.ts";
const entry = (sites, cls = "household-scoped") => ({ [file]: { class: cls, sites, reason: "r", story: "SEC-04b" } });

test("a raw createAdminClient() mutation in an unlisted file fails", () => {
  const item = analyze(file, `import { createAdminClient } from "@wonderhome/core/db/admin";\nexport async function POST() { await createAdminClient().from("t").insert({}); }`);
  assert.equal(item.raw, 1);
  assert.equal(item.writes, true);
  assert.match(violations([item], {})[0], /raw createAdminClient\(\)/);
});

test("handing the factory on as a value counts as raw", () => {
  const item = analyze(file, `export const POST = (r) => handle(r, { admin: createAdminClient });`);
  assert.equal(item.raw, 1);
});

test("imports, comments and typeof are not call sites", () => {
  const item = analyze(file, `import {\n  createAdminClient,\n} from "x";\n// createAdminClient() here\n/** createAdminClient() */\ntype A = ReturnType<typeof createAdminClient>;\nconst { createAdminClient } = await import("../db/admin");`);
  assert.equal(item.raw, 0);
});

test("the wrapper passes with no baseline entry", () => {
  const item = analyze(file, `export async function POST() { adminClientFor(adminGrant.member(membership, "x")).from("t").insert({}); }`);
  assert.equal(item.raw, 0);
  assert.equal(item.wrapped, 1);
  assert.deepEqual(violations([item], {}), []);
});

test("a new raw call in a listed file fails; a removed one makes the entry stale", () => {
  const two = analyze(file, "createAdminClient(); createAdminClient();");
  assert.match(violations([two], entry(1))[0], /allows 1/);
  const none = analyze(file, "adminClientFor(g);");
  assert.match(violations([none], entry(1))[0], /stale/);
});

test("a baseline entry needs a known class, a reason and a story", () => {
  const item = analyze(file, "createAdminClient();");
  assert.match(violations([item], { [file]: { class: "whatever", sites: 1 } }).join("\n"), /class must be one of[\s\S]*needs a "reason"/);
});

test("the repository is clean against its baseline", async () => {
  const { readFileSync } = await import("node:fs");
  const baseline = JSON.parse(readFileSync(new URL("../security/service-role-baseline.json", import.meta.url), "utf8")).entries;
  assert.deepEqual(violations(collect(), baseline), []);
});
