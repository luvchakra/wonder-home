import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { platformKey } from "../ai/model-key";
import { GOLDEN_CASES } from "./cases";
import { formatLatency, formatRatio, measure } from "./metrics";
import { releasable, releaseArtifact, releaseGates } from "./report";
import { runEvaluation, type RunTarget } from "./run";

/**
 * `npm run eval` (Wave 5 §11, §12, §21, §22).
 *
 *   npm run eval                        deterministic run of the golden set
 *   npm run eval -- --provider configured   the provider WONDERHOME_AI_KEY is for
 *   npm run eval -- --write             also write the release artifact to docs/ai-releases/
 *   npm run eval -- --cases HT-117,HS-24 [--runs 3]   only those cases, each run that many times
 *   npm run eval -- --utterance "Asmi has a test on Friday"   how one HomeTalk sentence is read
 *
 * The last two are for finding a defect cheaply: they never write an
 * artifact and say nothing about the release gates, which only mean
 * something over the whole golden set (CLAUDE.md, "Token economy").
 *
 * Exits non-zero when a blocking release gate fails, so it can gate a
 * release in CI the same way the test suite does.
 */

const OPERATIONS = {
  pass: false,
  evidence:
    "Telemetry exists: per-turn reply metadata, correction evidence (`ai_corrections`) and email forwarding events (`homesend_email_events`). Platform-admin JSON endpoints serve it: HomeSend and email monitoring, AI operations, and AI quality. The §14 alert conditions are evaluated there and logged at error level. What is missing: a rendered dashboard, and alert delivery to a person (no paging integration is configured).",
};

const LIMITATIONS = [
  "A deterministic run measures the rules, grounding, reconciliation, confirmation and answer composition every surface falls back to — not a model's own extraction. A provider run needs that provider's key.",
  "HomeSend cases score everything after the classifier against a recorded reading; the classifier itself is scored only in a provider run.",
  "The executor stage is not run: the engine's proposal decides what would execute, and each executor is covered by its own unit tests with stubbed domain services.",
  "Link fetching, file-type detection and email signature checks are exercised by the HomeSend acceptance matrix and security tests, not re-run here.",
];

function targetFrom(args: readonly string[]): RunTarget {
  const index = args.indexOf("--provider");
  const wanted = index >= 0 ? args[index + 1] : "deterministic";
  if (!wanted || wanted === "deterministic") return { provider: "deterministic" };
  const configured = platformKey();
  if (!configured) throw new Error("No WONDERHOME_AI_KEY is set, so there is no provider to evaluate. Run without --provider for the deterministic run.");
  if (wanted !== "configured" && wanted !== configured.provider) {
    throw new Error(`WONDERHOME_AI_KEY is a ${configured.provider} key; it cannot run a ${wanted} evaluation.`);
  }
  return { provider: configured.provider, key: configured.key };
}

function valueOf(args: readonly string[], flag: string): string | null {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] && !args[index + 1]!.startsWith("--") ? args[index + 1]! : null;
}

/** Only the named cases, each run `runs` times: every failing stage printed, no gates. */
async function focusedRun(target: RunTarget, ids: readonly string[], runs: number): Promise<number> {
  const unknown = ids.filter((id) => !GOLDEN_CASES.some((c) => c.id === id));
  if (unknown.length > 0) throw new Error(`No golden case ${unknown.join(", ")}.`);
  const cases = GOLDEN_CASES.filter((c) => ids.includes(c.id));
  let failed = 0;
  for (let round = 1; round <= runs; round += 1) {
    const run = await runEvaluation(target, cases);
    for (const result of run.results) {
      if (!result.pass) failed += 1;
      const stages = result.stages.filter((stage) => !stage.pass).map((stage) => `${stage.stage}: expected ${JSON.stringify(stage.expected)}, got ${JSON.stringify(stage.actual)}`);
      console.log(`run ${round} ${result.caseId} ${result.pass ? "pass" : `FAIL (${result.errors.join(", ")})`}${stages.length ? `\n    ${stages.join("\n    ")}` : ""}`);
    }
  }
  console.log(`${cases.length * runs - failed}/${cases.length * runs} passed`);
  return failed === 0 ? 0 : 1;
}

/** How one HomeTalk sentence is read, by the target's model or the rules, in golden household A as Kunal. */
async function readUtterance(target: RunTarget, utterance: string): Promise<number> {
  const [{ modelsFor }, { observeHomeTalk }] = await Promise.all([import("./run"), import("./runners")]);
  const { models } = modelsFor(target);
  const observed = await observeHomeTalk({ id: "ad-hoc", surface: "hometalk", household: "A", category: "cross_domain", actor: "a-kunal", description: "", utterance, expected: {} }, models);
  console.log(`interpretation ${observed.interpretation ?? "none"} · action ${observed.action ?? "none"}${observed.entity ? ` · entity ${observed.entity}` : ""}${observed.date ? ` · date ${observed.date}` : ""}`);
  console.log(observed.answer);
  return 0;
}

export async function main(args: readonly string[], repoRoot: string): Promise<number> {
  const target = targetFrom(args);
  const utterance = valueOf(args, "--utterance");
  if (utterance) return readUtterance(target, utterance);
  const picked = valueOf(args, "--cases");
  if (picked) return focusedRun(target, picked.split(",").map((id) => id.trim()).filter(Boolean), Math.max(1, Number(valueOf(args, "--runs") ?? 1) || 1));

  const run = await runEvaluation(target);
  const metrics = measure(run.results);
  const gates = releaseGates(run, GOLDEN_CASES, OPERATIONS);

  console.log(`WonderHome AI evaluation — ${run.provider} (${run.model})`);
  console.log(`prompt ${run.promptVersion} · context ${run.contextVersion} · dataset ${run.datasetVersion}`);
  console.log(`cases ${formatRatio(metrics.cases)} · unsafe actions ${formatRatio(metrics.unsafeActionRate)}`);
  for (const [surface, value] of Object.entries(metrics.bySurface)) console.log(`  ${surface.padEnd(10)} ${formatRatio(value)} · ${formatLatency(metrics.latency[surface as keyof typeof metrics.latency])}`);
  for (const result of run.results.filter((r) => !r.pass)) console.log(`  FAIL ${result.caseId}: ${result.errors.join(", ")}`);
  for (const gate of gates) console.log(`gate ${gate.name.padEnd(12)} ${gate.pass ? "pass" : gate.blocking ? "FAIL" : "not yet"} — ${gate.evidence}`);

  if (args.includes("--write")) {
    const dir = join(repoRoot, "docs", "ai-releases");
    mkdirSync(dir, { recursive: true });
    const base = `${run.startedAt.slice(0, 10)}-${run.provider}-${run.promptVersion}`;
    writeFileSync(join(dir, `${base}.md`), releaseArtifact(run, metrics, gates, LIMITATIONS));
    writeFileSync(join(dir, `${base}.json`), `${JSON.stringify({ ...run, metrics, gates }, null, 2)}\n`);
    console.log(`wrote docs/ai-releases/${base}.md and .json`);
  }

  return releasable(gates) ? 0 : 1;
}
