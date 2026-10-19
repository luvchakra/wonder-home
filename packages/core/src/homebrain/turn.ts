import type { AnswerComposer } from "../ai/model-client";
import { minimiseContext, restoreNames, type DataUsePolicy, type Person } from "../ai/privacy";
import { describeLocalNow } from "../context/format";
import { isoDay } from "../context/normalize";
import type { ContextDomain, HouseholdContextItem } from "../context/types";
import type { ConversationTurn } from "../conversation/engine";
import { answeringFacts, composeFromFacts, composeGrounded, heldForAdultsAnswer, unknownAnswer } from "./answer";
import { gateCandidates, groundFacts, type GroundedFact } from "./grounding";
import { deepReadTargets, mergeLiveItems, withinDeepReadBudget, type DeepReadRecord } from "./deep-read";
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
  /** The asker's own upcoming appointments they may not read (a child's): a count, never a detail. */
  heldForAdults?: number;
  /**
   * A live read of these domains through the asker's own session (HomeBrain
   * 4.0 §3.7): run once, before "nothing on record", when the question
   * named something. Absent, HomeBrain answers from `items` alone, as before.
   */
  deepRead?: (domains: ContextDomain[]) => Promise<readonly HouseholdContextItem[]>;
  /** The person asked HomeBrain to look again ("can you check the database?"). */
  deeper?: boolean;
  /**
   * Records close in meaning to the question (HomeBrain Sleep), started by the
   * caller alongside its other reads and awaited only here; it must already
   * be bounded by a short timeout. Absent or empty, retrieval is by words.
   */
  semantic?: Promise<ReadonlyMap<string, number>>;
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
  /** The deeper look, when one ran (§3.7): for `homebrain_misses` and the store repair. */
  deepRead?: DeepReadRecord;
};

/**
 * One answer, and — when it would be "nothing on record" about something the
 * question named, or the person asked to look again — one deeper look first
 * (HomeBrain 4.0 §3.7): the named parts of the home read again live, merged
 * over the stored facts, and the question answered once more.
 */
export async function answerWithHomeBrain(turn: HomeBrainTurn): Promise<HomeBrainAnswer> {
  const first = await answerOnce(turn);
  const missed = first.mode === "unknown" || first.source === "not_on_record";
  if (!turn.deepRead || !(missed || turn.deeper) || first.mode === "clarify") return first;

  const domains = deepReadTargets(first.reading, turn.items);
  if (domains.length === 0) return first;
  const started = Date.now();
  const live = await withinDeepReadBudget(turn.deepRead(domains));
  const latencyMs = Date.now() - started;
  const trigger: DeepReadRecord["trigger"] = turn.deeper ? "asked_to_look" : first.mode === "unknown" ? "unknown" : "not_on_record";
  if (!live || live.length === 0) return { ...first, deepRead: { domains, trigger, found: false, latencyMs } };

  const merged = mergeLiveItems(turn.items, live);
  const found = merged.added + merged.changed > 0;
  if (!found && !turn.deeper) return { ...first, deepRead: { domains, trigger, found, latencyMs } };
  const second = await answerOnce({ ...turn, items: merged.items });
  // The second answer stands when it found something to say; otherwise the
  // honest first one does — and says it looked.
  const answer = second.mode === "answer" && second.text ? second : { ...first, text: first.text ? lookedEverywhere(first.text) : first.text };
  return { ...answer, deepRead: { domains, trigger, found, latencyMs } };
}

/** "Not on record", said after a deeper look: it looked, rather than guessed. */
function lookedEverywhere(text: string): string {
  return text.replace(/^WonderHome does not have anything on record about that/, "I looked through everything WonderHome has, and there is nothing on record about that");
}

async function answerOnce(turn: HomeBrainTurn): Promise<HomeBrainAnswer> {
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

  // A child asking about their own appointment is told it is there and that
  // the adults can see it — no model, no detail, nothing else to ground.
  const held = heldForAdultsAnswer(reading, turn.viewer.memberId, turn.heldForAdults ?? 0);
  if (held) return { ...base, text: held, mode: "answer", source: "deterministic" };

  const semantic = turn.semantic ? await turn.semantic.catch(() => undefined) : undefined;
  const facts = groundFacts(turn.items, reading, { timezone: turn.timezone, today: isoDay(turn.now, turn.timezone), semantic });
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
    // A broad question about a day counts too: "what is happening on
    // Saturday?" whose only answer is a child's Sports Day was answered
    // "nothing is scheduled" by a real model never shown it (live E2E-001,
    // 23 Sep 2026). A broad question with no day ("what time is the
    // meeting?") keeps the model, which answers from what it may see.
    const withheld = (!reading.broad || reading.time !== null) && answering.some((fact) => !sentIds.has(fact.contextId));
    if (sent.length > 0 && !withheld) {
      const compose = turn.compose;
      const localNow = describeLocalNow(turn.now, turn.timezone);
      let lastRequestSize = sent.length;
      const outcome = await composeGrounded({
        facts: sent,
        compose: async (request) => {
          lastRequestSize = request.facts.length;
          // A composer that throws — a timeout, an outage it did not catch
          // itself — is a model with no answer, never an error the person sees.
          try {
            return await compose({ question: turn.sentQuestion, facts: request.facts, history: turn.sentHistory, viewer: turn.viewer.roleLabel, localNow, problems: request.problems, goal: reading.goal });
          } catch {
            return null;
          }
        },
        validation: {
          question: turn.sentQuestion,
          history: turn.sentHistory.map((entry) => entry.text),
          localNow,
          today: isoDay(turn.now, turn.timezone),
          inferences: facts.filter((fact) => fact.domain === "insight").map((fact) => fact.contextId),
        },
      });
      validation.attempts = outcome.attempts;
      validation.rejected = [...new Set(outcome.rejected.map((violation) => violation.kind))];
      factsSent = lastRequestSize;

      // "Not on record" from a model is not the last word when the record
      // plainly has the answer. And the reverse: an answer to a question
      // about one part of the home (dinner, a bill) that rests on no fact from
      // that part — only the household's name, its people — is an answer
      // nothing on record supports, however plainly it is worded.
      const unfounded =
        outcome.status === "accepted" &&
        outcome.draft.mode === "answer" &&
        !reading.broad &&
        reading.focus.size > 0 &&
        answering.length === 0 &&
        !facts.some((fact) => outcome.draft.usedFacts.includes(fact.contextId) && (fact.domain === "insight" || fact.domain === "profile" || (fact.domain !== "conflict" && (reading.focus.has(fact.domain) || reading.connected.has(fact.domain)))));
      if (unfounded) validation.rejected = [...new Set([...validation.rejected, "unfounded_answer" as const])];
      if (outcome.status === "accepted" && !unfounded && !(outcome.draft.mode === "unknown" && answering.length > 0)) {
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
