import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import { describeUnparsed, keyOf, lintsOf, summarize } from "./advisor-gate.mjs";

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

const FN = "authenticated_security_definer_function_executable";
const flat = { name: FN, level: "WARN", detail: "Function `public.adjust_shopping_entry(p uuid)` can be executed by signed-in users", metadata: { name: "adjust_shopping_entry" } };
const grouped = { name: FN, level: "WARN", count: 1, findings: [{ detail: flat.detail, metadata: flat.metadata }] };
const KEY = `${FN}|Function public.adjust_shopping_entry`;

test("every response shape parses to the same baseline key", () => {
  for (const body of [{ lints: [flat] }, { result: { lints: [flat] } }, [flat], { lints: [grouped] }, { result: { lints: [grouped] } }, [grouped]]) {
    assert.deepEqual(summarize(lintsOf(body)).gated, { [FN]: [KEY] });
  }
});

test("flat INFO lints are counted one each; grouped ones by findings", () => {
  assert.deepEqual(summarize([{ name: "unused_index", level: "INFO", detail: "a" }, { name: "unused_index", level: "INFO", detail: "b" }]).info, { unused_index: 2 });
  assert.deepEqual(summarize([{ name: "unused_index", level: "INFO", count: 2, findings: [{}, {}] }]).info, { unused_index: 2 });
});

test("an unparsed response is described by keys only", () => {
  const msg = describeUnparsed("security", { data: [], secret: "tok" });
  assert.match(msg, /top-level keys: data, secret/);
  assert.match(msg, /no lint/);
  assert.doesNotMatch(msg, /tok\b/);
  assert.equal(lintsOf({ data: [] }).length, 0);
});
