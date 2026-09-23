#!/usr/bin/env node
/**
 * The P0 security suite (story 15-008).
 *
 * Story 15-008 asks for a security check "suitable for CI or operational
 * automation" with "a deterministic pass/fail signal", covering six named
 * areas. This is that check: one command, one exit code, and a line per area.
 *
 *   npm run security           human-readable, exits non-zero on any failure
 *   npm run security -- --json machine-readable, for a monitor or a gate
 *
 * The reason it is a script rather than an alias for `vitest run` is the thing
 * the story is really asking for. A test runner tells you whether the tests
 * that exist passed. It cannot tell you that an area the product promised to
 * cover has quietly stopped being covered — someone deletes a file, renames a
 * describe block, and the suite goes green with a hole in it. So each area
 * below declares the files that cover it and a floor it must stay above, and
 * an area that drops below fails the run even though every remaining test
 * passed.
 *
 * What is counted is **declared cases**: literal `it(` calls in the source.
 * That is not the number of tests that run — an `it(` inside a loop counts
 * once and produces many — and it is not meant to be. It is a deletion
 * detector, and it wants to be cheap and stable rather than exact.
 *
 * `expected` is the exact count at the time the area was last reviewed, not a
 * floor with slack in it. A floor set comfortably below the real number
 * tolerates precisely the deletions it exists to catch — which was true of the
 * first version of this file, and was caught by removing a case and watching
 * it pass. So: fewer cases than expected fails, and more passes with a note
 * to raise the number. Deletions are always caught; adding a test is never
 * blocked by bookkeeping.
 *
 * Browser-driven areas are declared here too, but run in Playwright rather
 * than here: `npm run test:e2e` is a separate CI step because it needs a
 * server. This suite asserts those specs still exist and still carry their
 * cases, so removing one is caught here even when the e2e step is skipped.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

/**
 * The six areas story 15-008 names, plus the three the other criteria in the
 * module require. Each names why it is here, so a future reader can judge
 * whether the coverage still matches the claim.
 */
const AREAS = [
  {
    key: "horizontal-privilege-escalation",
    title: "Horizontal privilege escalation",
    why: "One household reaching another's data is the failure that ends the product.",
    unit: [
      "packages/core/src/ai/prompt-injection.test.ts",
      "packages/core/src/identity/permissions.test.ts",
    ],
    e2e: ["e2e/domains.spec.ts"],
    expected: 32,
  },
  {
    key: "child-helper-boundaries",
    title: "Child and helper boundaries",
    why: "The people with the least power in a household are the ones a bug hurts most.",
    unit: [
      "packages/core/src/identity/views.test.ts",
      "packages/core/src/identity/permissions.test.ts",
      "packages/core/src/privacy/export.test.ts",
    ],
    e2e: [],
    expected: 33,
  },
  {
    key: "injection",
    title: "Injection",
    why: "No SQL is built by hand, no header is written from a household's own words, and no credential reaches a log — each asserted rather than assumed.",
    unit: ["packages/core/src/security/injection.test.ts", "packages/core/src/security/redact.test.ts"],
    e2e: [],
    expected: 18,
  },
  {
    key: "ssrf",
    title: "Server-side request forgery",
    why: "Nothing makes an outbound call yet. The guard exists so the first connector arrives behind it rather than before it.",
    unit: ["packages/core/src/security/outbound.test.ts"],
    e2e: [],
    expected: 18,
  },
  {
    key: "session-abuse",
    title: "Session abuse",
    why: "A forged, stale or planted cookie is the cheapest way into somebody's home.",
    unit: ["packages/core/src/security/route-policy.test.ts"],
    e2e: ["e2e/session.spec.ts", "e2e/auth.spec.ts"],
    expected: 12,
  },
  {
    key: "prompt-injection",
    title: "Prompt injection and tool misuse",
    why: "An LLM response is never authorization. This is the adversary that tries to falsify that claim.",
    unit: ["packages/core/src/ai/prompt-injection.test.ts", "packages/core/src/ai/tools.test.ts"],
    e2e: [],
    expected: 35,
  },
  {
    key: "step-up",
    title: "Step-up on privileged actions",
    why: "Money, data leaving and deletion each need a person who is there now, not a session left open in a kitchen.",
    unit: ["packages/core/src/security/step-up.test.ts", "packages/core/src/finance/payments.test.ts"],
    e2e: [],
    expected: 48,
  },
  {
    key: "ai-privacy",
    title: "AI context minimisation and consent",
    why: "Nothing about a household reaches a provider it has not agreed to, and never more than the turn needs.",
    unit: ["packages/core/src/ai/privacy.test.ts"],
    e2e: [],
    expected: 31,
  },
  {
    key: "audit",
    title: "Audit coverage",
    why: "A trail that omits half of what happened reads as evidence that nothing happened.",
    unit: [
      "packages/core/src/security/sensitive-actions.test.ts",
      "packages/core/src/api/audit.test.ts",
    ],
    e2e: [],
    expected: 17,
  },
];

/** Declared `it(` cases in a file. A deletion detector, not a test count. */
function caseCount(path) {
  const full = join(ROOT, path);
  if (!existsSync(full)) return null;
  return (readFileSync(full, "utf8").match(/^\s*it\(/gm) ?? []).length;
}

function assess() {
  return AREAS.map((area) => {
    const files = [...area.unit, ...area.e2e];
    const missing = files.filter((path) => caseCount(path) === null);
    const cases = files.reduce((total, path) => total + (caseCount(path) ?? 0), 0);

    const problems = [];
    const notes = [];
    if (missing.length > 0) problems.push(`missing: ${missing.join(", ")}`);
    if (cases < area.expected) {
      problems.push(`${cases} declared cases, expected ${area.expected} — coverage was removed`);
    }
    if (cases > area.expected) {
      notes.push(`${cases} declared cases, up from ${area.expected} — raise expected to ${cases}`);
    }

    return { ...area, cases, missing, notes, ok: problems.length === 0, problems };
  });
}

function runUnitTests(paths) {
  try {
    execFileSync("npx", ["vitest", "run", "--root", "packages/core", ...paths], {
      cwd: ROOT,
      stdio: "pipe",
      encoding: "utf8",
    });
    return { ok: true, output: "" };
  } catch (error) {
    return { ok: false, output: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}

function main() {
  const json = process.argv.includes("--json");
  const coverageOnly = process.argv.includes("--coverage-only");
  const areas = assess();

  // The unit files, deduplicated and made relative to the package vitest runs in.
  const unitPaths = [
    ...new Set(
      areas
        .flatMap((area) => area.unit)
        .filter((path) => caseCount(path) !== null)
        .map((path) => path.replace(/^packages\/core\//, "")),
    ),
  ];

  const run = coverageOnly ? { ok: true, output: "" } : runUnitTests(unitPaths);
  const coverageOk = areas.every((area) => area.ok);
  const ok = coverageOk && run.ok;

  if (json) {
    console.log(
      JSON.stringify(
        {
          ok,
          checkedAt: new Date().toISOString(),
          testsPassed: run.ok,
          areas: areas.map(({ key, title, cases, expected: want, ok: areaOk, problems, notes }) => ({
            key,
            title,
            cases,
            expected: want,
            ok: areaOk,
            problems,
            notes,
          })),
        },
        null,
        2,
      ),
    );
    process.exit(ok ? 0 : 1);
  }

  console.log("P0 security suite (story 15-008)\n");
  for (const area of areas) {
    const status = area.ok ? "PASS" : "FAIL";
    console.log(`${status}  ${area.title} — ${area.cases} declared cases`);
    for (const problem of area.problems) console.log(`      ${problem}`);
    for (const note of area.notes) console.log(`      note: ${note}`);
  }

  if (!run.ok) {
    console.log("\nThe security tests themselves failed:\n");
    console.log(run.output.split("\n").slice(-40).join("\n"));
  }

  console.log(
    `\n${areas.filter((area) => area.ok).length}/${areas.length} areas covered` +
      (coverageOnly ? " (coverage only; tests not run)" : `, tests ${run.ok ? "passed" : "FAILED"}`),
  );

  if (!ok) {
    console.log(
      "\nAn area below its expected count means security coverage was removed.\n" +
        "Restore the cases, or lower the number deliberately and say why in the commit.",
    );
  }

  process.exit(ok ? 0 : 1);
}

main();
