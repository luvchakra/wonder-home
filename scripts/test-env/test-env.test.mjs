import { strict as assert } from "node:assert";
import { test } from "node:test";

import { requireTestRef, testProjectRef } from "./lib.mjs";
import { migrationFiles, pending, retargetSql } from "./migrate.mjs";

test("the test project ref comes from the ref or the URL", () => {
  assert.equal(testProjectRef({ TEST_SUPABASE_PROJECT_REF: "abc" }), "abc");
  assert.equal(testProjectRef({ TEST_SUPABASE_URL: "https://xyzref.supabase.co" }), "xyzref");
  assert.equal(testProjectRef({}), null);
});

test("every script refuses the production project", () => {
  assert.throws(() => requireTestRef({ TEST_SUPABASE_PROJECT_REF: "kqxndableyysxqhxiorz" }), /production/);
  assert.throws(() => requireTestRef({ TEST_SUPABASE_URL: "https://kqxndableyysxqhxiorz.supabase.co" }), /production/);
  assert.throws(() => requireTestRef({}), /TEST_SUPABASE/);
});

test("pending keeps order and matches history by base name", () => {
  const files = ["20260101000000_a.sql", "20260102000000_b.sql", "20260103000000_c.sql"];
  assert.deepEqual(pending(files, ["20991231000000_b", "a"]), ["20260103000000_c.sql"]);
  assert.ok(migrationFiles().length > 100);
});

test("retargeting points schedules at the test host, hourly, without the GitHub clock", () => {
  const sql = retargetSql();
  assert.match(sql, /replace\(j\.command, 'https:\/\/home\.wonderapps\.biz', 'https:\/\/test\.home\.wonderapps\.biz'\)/);
  assert.match(sql, /cron\.unschedule\('wonderhome-delivery-clock-github'\)/);
  assert.match(sql, /split_part\(j\.schedule, ' ', 2\) = '\*'/);
});
