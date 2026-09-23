import type { SupabaseClient } from "@supabase/supabase-js";

import { isConsequential, type IntentAction } from "../conversation/intent";

/**
 * Production quality metrics for HomeTalk and HomeBrain (Wave 5 §23), next
 * to HomeSend's own (`homesend/metrics.ts`).
 *
 * The primary figure is household outcomes handled: changes that actually
 * happened, not turns, messages or tokens. The supporting rates follow.
 * Every figure is a count out of the count it is measured against (rule 9).
 * All of it is read from closed words only: what each reply's metadata
 * says (proposal, mode, understanding source, failure code, HomeBrain
 * source, validation codes), an action's type and status, and a
 * correction's surface and error type. Nothing a household said is read,
 * so this can be counted platform-wide.
 */

export type Ratio = { count: number; of: number };

export type ReplyRow = {
  proposal: string | null;
  mode: string | null;
  understanding: string | null;
  failure: string | null;
  brain: string | null;
  rejected: string[] | null;
};

export type ActionRow = { action_type: string; approval_status: string; kind: string | null; reason: string | null };

export type CorrectionRow = { surface: string; error_type: string; source_id: string | null };

export type ProductionMetrics = {
  windowDays: number;
  /** Changes that happened: HomeTalk actions an executor carried out, and HomeSend items routed into a domain. */
  outcomesHandled: { hometalk: number; homesend: number };
  /** HomeTalk turns that were understood by a model, out of all turns. The rest fell back to the rules. */
  modelUnderstanding: Ratio;
  /** Model calls that failed (unreachable, unreadable), by failure code. The turn still got the rules. */
  providerFailures: Record<string, number>;
  /** Turns that asked a question instead of acting or answering, out of all turns. */
  clarification: Ratio;
  /** HomeTalk writes that went through, out of every write that was attempted. */
  homeTalkUpdateSuccess: Ratio;
  /** HomeBrain answers built from recorded facts, out of every HomeBrain answer (the rest said nothing was on record). */
  homeBrainGrounded: Ratio;
  /** HomeBrain answers where validation refused a model draft at least once, out of HomeBrain answers. */
  homeBrainValidationRefusals: Ratio;
  /** HomeTalk actions a person later corrected, out of HomeTalk actions recorded. */
  hometalkCorrection: Ratio;
  /** Corrections by surface and error type (§10, §13). */
  corrections: Record<string, Record<string, number>>;
  /** Approvals refused because the proposal expired, changed or was not the one shown (§20). */
  approvalsRefused: Record<"expired" | "changed" | "stale", number>;
  /** Consequential actions carried out without a person's approval, out of consequential actions carried out (§9). Must be zero. */
  unsafeActions: Ratio;
};

const GROUNDED = new Set(["model", "model_regenerated", "deterministic"]);
const ANSWERED = new Set([...GROUNDED, "not_on_record"]);

/** Pure: the same rows always give the same metrics. */
export function summarizeProduction(
  replies: readonly ReplyRow[],
  actions: readonly ActionRow[],
  corrections: readonly CorrectionRow[],
  options: { windowDays: number; homesendRouted: number },
): ProductionMetrics {
  const turns = replies.filter((reply) => reply.proposal !== null);
  const providerFailures: Record<string, number> = {};
  for (const reply of turns) if (reply.failure) providerFailures[reply.failure] = (providerFailures[reply.failure] ?? 0) + 1;

  const brainAnswers = replies.filter((reply) => reply.brain !== null && ANSWERED.has(reply.brain));
  const attempted = actions.filter((action) => action.approval_status === "executed" || action.approval_status === "failed");
  const executed = actions.filter((action) => action.approval_status === "executed");
  const consequential = executed.filter((action) => isConsequential(action.action_type as IntentAction));

  const byCorrection: Record<string, Record<string, number>> = {};
  for (const row of corrections) {
    byCorrection[row.surface] ??= {};
    byCorrection[row.surface]![row.error_type] = (byCorrection[row.surface]![row.error_type] ?? 0) + 1;
  }
  const correctedActions = new Set(corrections.filter((row) => row.surface === "hometalk" && row.source_id).map((row) => row.source_id));

  const refused = { expired: 0, changed: 0, stale: 0 };
  for (const action of actions) {
    const reason = action.approval_status === "expired" ? action.reason?.replace(/^approval_/, "") : null;
    if (reason === "expired" || reason === "changed" || reason === "stale") refused[reason] += 1;
  }

  return {
    windowDays: options.windowDays,
    outcomesHandled: { hometalk: executed.length, homesend: options.homesendRouted },
    modelUnderstanding: { count: turns.filter((reply) => reply.understanding === "model").length, of: turns.length },
    providerFailures,
    clarification: { count: turns.filter((reply) => reply.mode === "clarify").length, of: turns.length },
    homeTalkUpdateSuccess: { count: executed.length, of: attempted.length },
    homeBrainGrounded: { count: brainAnswers.filter((reply) => GROUNDED.has(reply.brain!)).length, of: brainAnswers.length },
    homeBrainValidationRefusals: { count: brainAnswers.filter((reply) => (reply.rejected?.length ?? 0) > 0).length, of: brainAnswers.length },
    hometalkCorrection: { count: correctedActions.size, of: actions.length },
    corrections: byCorrection,
    approvalsRefused: refused,
    // Carried out at the moment it was proposed, with no approval step: the
    // proposal's own kind says "executed". Governance never allows that for
    // a consequential action, so any count here is a defect.
    unsafeActions: { count: consequential.filter((action) => action.kind === "executed").length, of: consequential.length },
  };
}

/** The same metrics, read platform-wide with an admin client. */
export async function loadProductionMetrics(supabase: SupabaseClient, options: { windowDays?: number; now?: Date } = {}): Promise<ProductionMetrics> {
  const windowDays = Math.min(Math.max(Math.trunc(options.windowDays ?? 30), 1), 365);
  const since = new Date((options.now ?? new Date()).getTime() - windowDays * 86_400_000).toISOString();

  const [replies, actions, corrections, routed] = await Promise.all([
    supabase
      .from("conversation_messages")
      .select(
        "proposal:metadata->>proposal, mode:metadata->>mode, understanding:metadata->>understanding, failure:metadata->>understandingFailure, brain:metadata->>brain, rejected:metadata->brainValidation->rejected",
      )
      .eq("role", "assistant")
      .gte("created_at", since)
      .limit(50_000),
    supabase.from("conversation_actions").select("action_type, approval_status, kind:payload->>kind, reason:result->>reason").gte("created_at", since).limit(50_000),
    supabase.from("ai_corrections").select("surface, error_type, source_id").gte("created_at", since).limit(50_000),
    supabase.from("home_send_items").select("id", { count: "exact", head: true }).eq("status", "routed").gte("created_at", since),
  ]);
  if (replies.error) throw new Error(`loadProductionMetrics replies failed: ${replies.error.code ?? "unknown"}`);
  if (actions.error) throw new Error(`loadProductionMetrics actions failed: ${actions.error.code ?? "unknown"}`);
  if (corrections.error) throw new Error(`loadProductionMetrics corrections failed: ${corrections.error.code ?? "unknown"}`);

  return summarizeProduction(
    (replies.data ?? []) as unknown as ReplyRow[],
    (actions.data ?? []) as unknown as ActionRow[],
    (corrections.data ?? []) as unknown as CorrectionRow[],
    { windowDays, homesendRouted: routed.count ?? 0 },
  );
}
