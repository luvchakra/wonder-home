import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import { keyOf, summarize } from "./advisor-gate.mjs";

test("a finding's key ignores quoting and a function's argument list", () => {
  const lint = { name: "authenticated_security_definer_function_executable" };
  assert.equal(keyOf(lint, { detail: "Function `public.f(a uuid)` can run" }), keyOf(lint, { detail: "Function \\`public.f(a uuid, b text)\\` can run" }));
});

test("WARN findings are gated and INFO findings are only counted", () => {
  const { gated, info } = summarize([
    { name: "a", level: "WARN", findings: [{ detail: "x" }, { detail: "x" }] },
    { name: "unused_index", level: "INFO", count: 3, findings: [{}, {}, {}] },
  ]);
  assert.deepEqual(gated, { a: ["a|x"] });
  assert.deepEqual(info, { unused_index: 3 });
});

test("without a token the gate skips cleanly", () => {
  const run = spawnSync(process.execPath, [new URL("./advisor-gate.mjs", import.meta.url).pathname], { env: { PATH: process.env.PATH }, encoding: "utf8" });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /SKIPPED/);
});
