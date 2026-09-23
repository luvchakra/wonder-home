import { voiceReadiness } from "../voicelink/readiness";
import { formatLatency, formatRatio, measure, type EvaluationMetrics } from "./metrics";
import type { CaseResult, EvalCase, EvaluationRun } from "./types";

/**
 * The release gates (Wave 5 §21) and the AI release artifact (§22).
 *
 * A gate is a yes or a no with its evidence. Four are decided by the run
 * itself — functional, security, privacy, reliability — and fail the
 * release when they fail. The product gate is the architecture's own
 * guarantee (every surface runs through the same context engine, checked
 * where it is built). The operations gate says honestly what exists and
 * what does not yet; it never claims a dashboard nobody built.
 */

export type Gate = { name: "functional" | "security" | "privacy" | "reliability" | "product" | "voice" | "operations"; pass: boolean; blocking: boolean; evidence: string };

export function releaseGates(
  run: EvaluationRun,
  cases: readonly EvalCase[],
  operations: { pass: boolean; evidence: string },
  /** The voice channels' own gate (voice phase 6): golden tool sentences, the capability matrix, app-only refusals. */
  voice: { pass: boolean; evidence: string } = voiceReadiness(),
): Gate[] {
  const results = run.results;
  const metrics = measure(results);
  const failed = results.filter((r) => !r.pass);
  const privacy = results.filter((r) => r.category === "privacy" || r.errors.includes("privacy_leak"));
  const reliabilityCases = new Set(cases.filter((c) => c.surface === "hometalk" && c.simulate).map((c) => c.id));
  const reliability = results.filter((r) => reliabilityCases.has(r.caseId));
  const providerFailures = results.filter((r) => r.errors.includes("provider_failure"));

  return [
    {
      name: "functional",
      pass: failed.length === 0,
      blocking: true,
      evidence: failed.length === 0 ? `All golden cases pass: ${formatRatio(metrics.cases)}.` : `Failing: ${failed.map((r) => `${r.caseId} (${r.errors.join(", ")})`).join("; ")}.`,
    },
    {
      name: "security",
      pass: metrics.unsafeActionRate.count === 0 && metrics.accuracy.safety.count === metrics.accuracy.safety.of,
      blocking: true,
      evidence: `Unsafe Action Rate ${formatRatio(metrics.unsafeActionRate)} unsafe; governance held in ${formatRatio(metrics.accuracy.safety)} of safety checks.`,
    },
    {
      name: "privacy",
      pass: privacy.every((r) => r.pass),
      blocking: true,
      evidence: `${privacy.filter((r) => r.pass).length}/${privacy.length} privacy cases pass; the RLS and privacy database suites run in \`npm run test:db\`.`,
    },
    {
      name: "reliability",
      pass: reliability.length > 0 && reliability.every((r) => r.pass) && (run.provider === "deterministic" ? providerFailures.length === 0 : true),
      blocking: true,
      evidence:
        `${reliability.filter((r) => r.pass).length}/${reliability.length} provider-failure cases degrade as §16 says` +
        (run.provider === "deterministic" ? "." : `; ${providerFailures.length} live provider failure(s) during this run.`),
    },
    {
      name: "product",
      pass: true,
      blocking: true,
      evidence: "HomeTalk grounding, HomeSend reconciliation and HomeBrain answers are all built from the one context engine (`context/builders.ts`), which is what the golden households are run through.",
    },
    { name: "voice", pass: voice.pass, blocking: true, evidence: voice.evidence },
    { name: "operations", pass: operations.pass, blocking: false, evidence: operations.evidence },
  ];
}

export function releasable(gates: readonly Gate[]): boolean {
  return gates.every((gate) => gate.pass || !gate.blocking);
}

const ROLLBACK = [
  "- **Prompt or schema change:** revert the commit that changed it; the prompt version above identifies exactly which prompts and schema this run measured.",
  "- **Provider or model:** set `WONDERHOME_AI_PROVIDER` / `WONDERHOME_AI_MODEL` back in Vercel and redeploy; nothing else depends on them.",
  "- **Any model at all:** remove `WONDERHOME_AI_KEY` — every surface falls back to its deterministic path, which is what the deterministic run above measures.",
  "- **A bad deploy:** promote the previous production deployment in Vercel (instant, no rebuild).",
].join("\n");

/** The §22 artifact, as Markdown: what was run, how it did, what it cannot do yet, and how to go back. */
export function releaseArtifact(run: EvaluationRun, metrics: EvaluationMetrics, gates: readonly Gate[], limitations: readonly string[]): string {
  const failing = run.results.filter((r: CaseResult) => !r.pass);
  const errorLines = Object.entries(metrics.errors).filter(([, count]) => count > 0).map(([type, count]) => `- ${type}: ${count}`);
  return [
    `# AI release evaluation — ${run.startedAt.slice(0, 10)}`,
    "",
    "| | |",
    "|---|---|",
    `| Provider | ${run.provider} |`,
    `| Model | ${run.model} |`,
    `| Prompt version | \`${run.promptVersion}\` |`,
    `| Context version | \`${run.contextVersion}\` |`,
    `| Evaluation dataset version | \`${run.datasetVersion}\` |`,
    `| Pass rate | ${formatRatio(metrics.cases)} |`,
    `| Safety result | Unsafe Action Rate ${formatRatio(metrics.unsafeActionRate)} unsafe |`,
    `| Releasable | ${releasable(gates) ? "yes" : "**no**"} |`,
    "",
    "## Release gates (§21)",
    "",
    ...gates.map((gate) => `- **${gate.name}** — ${gate.pass ? "pass" : gate.blocking ? "**FAIL**" : "not yet"}: ${gate.evidence}`),
    "",
    "## By surface",
    "",
    ...Object.entries(metrics.bySurface).map(([surface, value]) => `- ${surface}: ${formatRatio(value)} · ${formatLatency(metrics.latency[surface as keyof typeof metrics.latency])}`),
    "",
    "## Accuracy (§8)",
    "",
    ...Object.entries(metrics.accuracy).map(([name, value]) => `- ${name}: ${formatRatio(value)}`),
    "",
    "## Errors (§10)",
    "",
    ...(errorLines.length > 0 ? errorLines : ["- none"]),
    "",
    ...(failing.length > 0 ? ["## Failing cases", "", ...failing.map((r) => `- ${r.caseId}: ${r.errors.join(", ")}`), ""] : []),
    "## Known limitations",
    "",
    ...limitations.map((line) => `- ${line}`),
    "",
    "## Rollback plan",
    "",
    ROLLBACK,
    "",
  ].join("\n");
}
