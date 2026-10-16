import assert from "node:assert/strict";
import { test } from "node:test";

import { scope } from "./ci-scope.mjs";
import { E2E_EMAIL_DOMAIN, guard, isStale } from "./e2e-cleanup.mjs";
import { plan } from "./e2e-plan.mjs";
import { outcomeOf, summarize } from "./e2e-report.mjs";

const exists = () => true;

// --- ci-scope ---------------------------------------------------------------

test("a push to main checks everything", () => {
  const s = scope("push", []);
  assert.equal(s.full, true);
  assert.equal(s.db, true);
});

test("a pull request touching one core file lints nothing and tests what relates to it", () => {
  const s = scope("pull_request", ["packages/core/src/ai/classify-intake.ts"], exists);
  assert.equal(s.full, false);
  assert.equal(s.test_files, "src/ai/classify-intake.ts");
  assert.equal(s.lint_files, "");
  assert.equal(s.db, false);
  assert.equal(s.web, true);
});

test("app files are linted by themselves, relative to apps/web", () => {
  const s = scope("pull_request", ["apps/web/app/page.tsx", "apps/web/public/logo.svg"], exists);
  assert.equal(s.lint_files, "app/page.tsx");
  assert.equal(s.full, false);
});

test("dependency, TypeScript, test, lint, build and CI config each force a full run", () => {
  for (const file of [
    "package.json",
    "packages/core/package.json",
    "package-lock.json",
    "tsconfig.base.json",
    "apps/web/tsconfig.json",
    "packages/core/vitest.config.ts",
    "apps/web/eslint.config.mjs",
    "apps/web/next.config.ts",
    "playwright.config.ts",
    "vercel.json",
    ".github/workflows/ci.yml",
  ]) {
    assert.equal(scope("pull_request", [file], exists).full, true, file);
  }
});

test("deleting a core file runs every unit test, since related tests cannot follow it", () => {
  const s = scope("pull_request", ["packages/core/src/gone.ts"], () => false);
  assert.equal(s.full, true);
  assert.equal(s.test_files, "");
});

test("docs only: no code checks", () => {
  const s = scope("pull_request", ["docs/CI.md", "README.md"], exists);
  assert.deepEqual([s.code, s.unit, s.db, s.web, s.full], [false, false, false, false, false]);
});

test("e2e specs alone do not build anything on a pull request", () => {
  const s = scope("pull_request", ["e2e/auth.spec.ts"], exists);
  assert.equal(s.web, false);
  assert.equal(s.code, true);
});

// --- e2e-plan ---------------------------------------------------------------

const specs = ["e2e/a.spec.ts", "e2e/b.spec.ts", "e2e/c.spec.ts", "e2e/d.spec.ts"];

test("a run that fits the target is one part", () => {
  const parts = plan({ specs, timings: { "a.spec.ts": 30, "b.spec.ts": 20, "c.spec.ts": 10, "d.spec.ts": 5 } });
  assert.equal(parts.length, 1);
  assert.equal(parts[0].name, "all");
  assert.equal(parts[0].specs, specs.join(" "));
  assert.ok(parts[0].budgetMinutes >= 10);
});

test("past the target, the slowest spec gets a part of its own and the rest balance by time", () => {
  // workers 1, overhead 1.2: a = 30 min alone, the rest 6 + 6 + 3.6 min.
  const parts = plan({ specs, timings: { "a.spec.ts": 1500, "b.spec.ts": 300, "c.spec.ts": 300, "d.spec.ts": 180 }, targetMinutes: 25, workers: 1 });
  assert.equal(parts.length, 2);
  assert.equal(parts[0].specs, "e2e/a.spec.ts");
  assert.equal(parts[1].specs, "e2e/b.spec.ts e2e/c.spec.ts e2e/d.spec.ts");
});

test("balancing is by measured time, not file count", () => {
  const four = ["e2e/a.spec.ts", "e2e/b.spec.ts", "e2e/c.spec.ts", "e2e/d.spec.ts"];
  const parts = plan({ specs: four, timings: { "a.spec.ts": 1000, "b.spec.ts": 600, "c.spec.ts": 300, "d.spec.ts": 100 }, targetMinutes: 20, workers: 1 });
  const seconds = { "e2e/a.spec.ts": 1000, "e2e/b.spec.ts": 600, "e2e/c.spec.ts": 300, "e2e/d.spec.ts": 100 };
  const loads = parts.map((p) => p.specs.split(" ").reduce((sum, f) => sum + seconds[f], 0));
  assert.equal(parts.length, 2);
  assert.deepEqual(loads.sort((x, y) => x - y), [1000, 1000]);
});

test("a spec with no timing counts as the slowest known one", () => {
  const parts = plan({ specs: ["e2e/new.spec.ts", "e2e/a.spec.ts"], timings: { "a.spec.ts": 1500 }, targetMinutes: 25, workers: 1 });
  assert.equal(parts.length, 2);
});

// --- e2e-report -------------------------------------------------------------

const result = (status, duration = 1000) => ({ status, duration });
const t = (status, results, annotations = []) => ({ status, results, annotations, projectName: "mobile" });

test("outcomes: first-try pass, retry pass is flaky, deliberate skip, budget ran out", () => {
  assert.equal(outcomeOf(t("expected", [result("passed")])), "passed");
  assert.equal(outcomeOf(t("flaky", [result("failed"), result("passed")])), "flaky");
  assert.equal(outcomeOf(t("unexpected", [result("failed"), result("failed")])), "failed");
  assert.equal(outcomeOf(t("skipped", [result("skipped")], [{ type: "skip" }])), "skipped");
  assert.equal(outcomeOf(t("skipped", [])), "not run");
  assert.equal(outcomeOf(t("unexpected", [result("interrupted")])), "not run");
});

test("a run with a flaky test still passes, one that did not finish does not", () => {
  const report = (tests) => ({ suites: [{ file: "a.spec.ts", specs: [{ title: "x", file: "a.spec.ts", tests }] }], errors: [] });
  const flaky = summarize(report([t("flaky", [result("failed"), result("passed")])]));
  assert.equal(flaky.ok, true);
  assert.equal(flaky.counts.flaky, 1);
  assert.equal(flaky.named.flaky.length, 1);

  const unfinished = summarize(report([t("expected", [result("passed")]), t("skipped", [])]));
  assert.equal(unfinished.ok, false);
  assert.equal(unfinished.counts["not run"], 1);
  assert.equal(unfinished.seconds["a.spec.ts"], 1);
});

// --- e2e-cleanup ------------------------------------------------------------

test("cleanup never touches production, and does nothing without a test project", () => {
  assert.equal(guard(undefined).ok, false);
  assert.equal(guard(undefined).refuse, undefined);
  const prod = guard("https://kqxndableyysxqhxiorz.supabase.co");
  assert.equal(prod.ok, false);
  assert.equal(prod.refuse, true);
  assert.equal(guard("https://abcdtestproject.supabase.co").ok, true);
});

test("cleanup removes only E2E accounts older than the window", () => {
  const now = Date.parse("2026-10-16T12:00:00Z");
  const old = "2026-10-16T08:00:00Z";
  const fresh = "2026-10-16T11:30:00Z";
  assert.equal(isStale({ email: `run-1@${E2E_EMAIL_DOMAIN}`, created_at: old }, { now }), true);
  assert.equal(isStale({ email: `run-2@${E2E_EMAIL_DOMAIN}`, created_at: fresh }, { now }), false);
  assert.equal(isStale({ email: "parent@gmail.com", created_at: old }, { now }), false);
  assert.equal(isStale({ email: `x@evil-${E2E_EMAIL_DOMAIN}`, created_at: old }, { now }), false);
});
