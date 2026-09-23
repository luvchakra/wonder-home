import type { AnswerComposer } from "../ai/model-client";
import { minimiseContext, restoreNames, type DataUsePolicy, type Person } from "../ai/privacy";
import { describeLocalNow } from "../context/format";
import { isoDay } from "../context/normalize";
import type { HouseholdContextItem } from "../context/types";
import type { ConversationTurn } from "../conversation/engine";
import { answeringFacts, composeFromFacts, composeGrounded, unknownAnswer } from "./answer";
import { gateCandidates, groundFacts, type GroundedFact } from "./grounding";
import { readBrainQuestion, type BrainReading } from "./question";
import type { ViolationKind } from "./validate";

/**
 * One HomeBrain answer, end to end (Wave 2 §5's pipeline):
 *
 *   question → intent, entity, time and domain hints (`question.ts`)
 *            → Wave 1 retrieval, ranking, cross-domain connection (`grounding.ts`)
 *            → privacy filtering: the viewer's own snapshot, then the consent gate
 *            → evidence selection: only relevant, permitted facts, pseudonymised
 *            → grounded model prompt → model draft
 *            → grounding validation, one tighter regeneration (`answer.ts`, `validate.ts`)
 *            → response: the validated draft, else a deterministic answer from
 *              the same facts, else an honest "not on record"
 *
 * Pure apart from the `compose` call, and every failure of that call — no
 * provider, no consent, an outage, a refusal, an answer that would not
 * validate — lands on the deterministic path. Nothing here writes: a
 * question never changes the household (§11, §12).
 */

export type HomeBrainTurn = {
  /** What the member asked, in their own words. */
  question: string;
  /** The same question as it may leave the household — minimised and pseudonymised by the caller's gate. */
  sentQuestion: string;
  /** The member's previous question in this conversation, for a follow-up. */
  previousQuestion: string | null;
  /** Earlier turns as they may leave the household. */
  sentHistory: readonly ConversationTurn[];
  /** Every fact this viewer may see — the context engine's viewer-filtered snapshot. */
  items: readonly HouseholdContextItem[];
  viewer: { memberId: string; roleLabel: string; guardianOf?: readonly string[] };
  timezone: string;
  now: Date;
  /** The household's data-use policy and people, for the consent gate. */
  policy: DataUsePolicy;
  people: readonly Person[];
  /** The model, when the household has one and has agreed to use it. Null answers deterministically. */
  compose: AnswerComposer | null;
  /** Most facts that may go in one answer. */
  factBudget: number;
};

export type HomeBrainAnswer = {
  /** Null when the question was about the whole home and nothing specific answers it: the caller's own summary is better. */
  text: string | null;
  mode: "answer" | "clarify" | "unknown";
  source: "model" | "model_regenerated" | "deterministic" | "not_on_record" | "clarify" | "none";
  /** How many facts left the household in the last draft request. */
  factsSent: number;
  /** Model drafts attempted, and what validation refused. Codes only — never content. */
  validation: { attempts: number; rejected: ViolationKind[] };
  reading: BrainReading;
  facts: GroundedFact[];
};

export async function answerWithHomeBrain(turn: HomeBrainTurn): Promise<HomeBrainAnswer> {
  const reading = readBrainQuestion(turn.question, turn.items, {
    viewerMemberId: turn.viewer.memberId,
    timezone: turn.timezone,
    now: turn.now,
    previousQuestion: turn.previousQuestion,
    guardianOf: turn.viewer.guardianOf ?? [],
  });
  const base = { reading, facts: [] as GroundedFact[], factsSent: 0, validation: { attempts: 0, rejected: [] as ViolationKind[] } };

  // A person who cannot be resolved is asked about, never guessed (§17: ambiguity creates focused clarification).
  if (reading.clarification) return { ...base, text: reading.clarification, mode: "clarify", source: "clarify" };

  const facts = groundFacts(turn.items, reading);
  const validation = { attempts: 0, rejected: [] as ViolationKind[] };
  let factsSent = 0;

  if (turn.compose) {
    const minimised = minimiseContext(gateCandidates(facts), { policy: { ...turn.policy, maxItems: Math.max(turn.policy.maxItems, turn.factBudget) }, people: turn.people });
    const sent = minimised.included.map((entry) => ({ id: entry.id, text: entry.text }));
    // A fact that answers the question but may not leave (a child's, a
    // bill's, under the household's data-use policy) means a model can only
    // give part of the answer — or, as a real one did, say "I do not have any
    // information about Asmi" while WonderHome has it. A specific question
    // whose answer was withheld is answered from the facts themselves.
    const sentIds = new Set(sent.map((fact) => fact.id));
    const answering = answeringFacts(facts, reading);
    const withheld = !reading.broad && answering.some((fact) => !sentIds.has(fact.contextId));
    if (sent.length > 0 && !withheld) {
      const compose = turn.compose;
      const localNow = describeLocalNow(turn.now, turn.timezone);
      let lastRequestSize = sent.length;
      const outcome = await composeGrounded({
        facts: sent,
        compose: (request) => {
          lastRequestSize = request.facts.length;
          return compose({ question: turn.sentQuestion, facts: request.facts, history: turn.sentHistory, viewer: turn.viewer.roleLabel, localNow, problems: request.problems });
        },
        validation: { question: turn.sentQuestion, history: turn.sentHistory.map((entry) => entry.text), localNow, today: isoDay(turn.now, turn.timezone) },
      });
      validation.attempts = outcome.attempts;
      validation.rejected = [...new Set(outcome.rejected.map((violation) => violation.kind))];
      factsSent = lastRequestSize;

      // "Not on record" from a model is not the last word when the record
      // plainly has the answer.
      if (outcome.status === "accepted" && !(outcome.draft.mode === "unknown" && answering.length > 0)) {
        return {
          reading,
          facts,
          factsSent,
          validation,
          text: restoreNames(outcome.draft.text, minimised.pseudonyms, turn.people),
          mode: outcome.draft.mode,
          source: outcome.attempts > 1 ? "model_regenerated" : "model",
        };
      }
    }
  }

  // No model, or none whose answer could be stood behind: the facts themselves.
  const deterministic = composeFromFacts(facts, reading);
  if (deterministic) return { reading, facts, factsSent, validation, text: deterministic, mode: "answer", source: "deterministic" };
  if (reading.broad) return { reading, facts, factsSent, validation, text: null, mode: "answer", source: "none" };
  return { reading, facts, factsSent, validation, text: unknownAnswer(reading), mode: "unknown", source: "not_on_record" };
}
