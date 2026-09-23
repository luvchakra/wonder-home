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

export async function main(args: readonly string[], repoRoot: string): Promise<number> {
  const run = await runEvaluation(targetFrom(args));
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
