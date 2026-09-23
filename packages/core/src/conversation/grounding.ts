import { resolvePerson } from "../context/resolution";
import type { HouseholdContextItem } from "../context/types";
import { isConsequential, type HouseholdIntent } from "./intent";
import { anaphorOf, resolveAnaphor, whichOf, type FocusEntity, type ReferenceState } from "./references";
import { resolveTemporal } from "./temporal";

/**
 * Grounding (Wave 4 §6–§8): what the household *meant*, given this
 * household — after understanding, before any proposal exists.
 *
 * The understanding (a model or the rules) says what was said: a person
 * mention, a subject, a date phrase, a "that". This step turns those into
 * the household's actual records — a member id, a local date, the thing
 * "that" was — using deterministic code and the Wave 1 resolver, never the
 * model. Only a grounded intent reaches a proposal. When grounding cannot
 * settle something, the answer is one focused question, never a guess:
 * "Which person did you mean — Asmi or Manan?", "Do you mean the white
 * T-shirt from the school notice or printer paper?".
 *
 * Grounding never authorizes anything. Scope, entitlement, permission and
 * autonomy all still run afterwards, exactly as they would on an intent
 * that needed no grounding at all.
 */

export type Grounding =
  | { kind: "grounded"; intent: HouseholdIntent; focus: FocusEntity[] }
  | {
      kind: "clarify";
      /** The intent so far, carrying what it waits for, for the next turn to complete. */
      intent: HouseholdIntent;
      question: string;
      awaiting: Awaiting;
      candidates: FocusEntity[];
    };

/** What a grounding question waits for — read by `answerClarification`. */
export type Awaiting = "member" | "referent" | "day" | "item";

export type GroundingEnv = {
  /** The household's people, as the resolver's member items. */
  people: readonly HouseholdContextItem[];
  viewerMemberId: string;
  timezone: string;
  now: Date;
  /** Read on demand — most turns never need it. */
  references: () => Promise<ReferenceState>;
};

/** Parameters that carry a date phrase, and whether the action needs exactly one day from it. */
const DATE_KEYS = ["when", "date", "since", "to", "window"] as const;
const NEEDS_ONE_DAY: ReadonlySet<HouseholdIntent["action"]> = new Set(["record_absence", "record_health_appointment"]);

/** Actions whose target is a member of the household, to be resolved to one. */
const MEMBER_TARGET: ReadonlySet<HouseholdIntent["action"]> = new Set(["record_absence", "assign_responsibility"]);

/** Pronouns that point at a person rather than a thing. */
const PERSON_ANAPHOR = /^(?:him|her|he|she|them|they|the other one|the other child|the other kid|the other)$/i;

export async function groundIntent(intent: HouseholdIntent, env: GroundingEnv): Promise<Grounding> {
  let grounded: HouseholdIntent = { ...intent, parameters: { ...intent.parameters }, target: { ...intent.target } };
  const focus: FocusEntity[] = [];
  const at = env.now.toISOString();

  // --- Dates (§7): the phrase is the model's, the day is ours -------------
  for (const key of DATE_KEYS) {
    const phrase = grounded.parameters[key];
    if (typeof phrase !== "string" || !phrase.trim()) continue;
    const resolved = resolveTemporal(phrase, { timezone: env.timezone, now: env.now });
    if (resolved) {
      grounded.parameters[`${key}Resolved`] = { date: resolved.date, endDate: resolved.endDate, window: resolved.window, label: resolved.label, precision: resolved.precision };
    } else if (key === "when" && NEEDS_ONE_DAY.has(grounded.action)) {
      return clarify(grounded, "day", `Which day do you mean by "${phrase.trim()}"? For example "tomorrow", "next Friday" or "2 Oct".`, []);
    }
    if (key === "when" && NEEDS_ONE_DAY.has(grounded.action) && resolved?.precision === "range") {
      return clarify(grounded, "day", `Which day ${resolved.label.replace(/\s*\(.*\)$/, "")} do you mean? Give me one day and I will note it.`, []);
    }
  }

  // --- People (§6): a mention → one member, or one question ----------------
  if (MEMBER_TARGET.has(grounded.action) && grounded.target.kind === "member") {
    const said = (grounded.target.reference ?? "").trim();
    const given = typeof grounded.parameters.memberId === "string" ? grounded.parameters.memberId : null;
    const known = given ? env.people.find((item) => item.entityType === "member" && item.entityId === given) : null;

    if (known) {
      grounded.parameters.memberName = String(known.attributes.displayName);
      focus.push(memberFocus(known, at));
    } else if (!said) {
      return clarify(grounded, "member", "Who is this about?", []);
    } else if (PERSON_ANAPHOR.test(said)) {
      const person = await personFromReference(said, env);
      if (person.kind === "resolved") {
        grounded = withMember(grounded, person.item);
        focus.push(memberFocus(person.item, at));
      } else {
        return clarify(grounded, "member", person.question, person.candidates);
      }
    } else {
      const resolution = resolvePerson(said, env.people, { viewerMemberId: env.viewerMemberId, consequential: isConsequential(grounded.action) });
      const selected = resolution.selected ? env.people.find((item) => item.entityType === "member" && item.entityId === resolution.selected!.memberId) : null;
      if (selected) {
        grounded = withMember(grounded, selected);
        focus.push(memberFocus(selected, at));
      } else {
        const candidates = resolution.candidates
          .filter((candidate) => candidate.confidence >= 0.5)
          .slice(0, 3)
          .map((candidate) => ({ entityType: "member", entityId: candidate.entity.memberId, label: candidate.entity.displayName, source: "clarification" as const, at }));
        const question =
          resolution.candidates.length === 0
            ? `I do not know anyone called "${said}" in your household. Who did you mean?`
            : (resolution.question ?? `Who did you mean by "${said}"?`);
        return clarify(grounded, "member", question, candidates);
      }
    }
  }

  // --- References (§8): "put that on the list" ------------------------------
  if (grounded.action === "add_to_list" || grounded.action === "order_items") {
    const item = typeof grounded.parameters.item === "string" ? grounded.parameters.item : Array.isArray(grounded.parameters.items) && grounded.parameters.items.length === 1 ? String(grounded.parameters.items[0]) : null;
    const anaphor = item ? anaphorOf(item) : null;
    if (anaphor) {
      const resolved = resolveAnaphor(anaphor, await env.references(), { kinds: ["thing", "consumable"], now: env.now });
      if (resolved.kind === "resolved") {
        const labels = resolved.entities.map((entity) => entity.label);
        grounded.parameters = { ...grounded.parameters, referred: item };
        if (labels.length === 1) {
          grounded.parameters.item = labels[0];
          delete grounded.parameters.items;
        } else {
          grounded.parameters.items = labels;
          delete grounded.parameters.item;
        }
        focus.push(...resolved.entities.map((entity) => ({ ...entity, source: "mention" as const, at })));
      } else if (resolved.kind === "ambiguous") {
        return clarify(grounded, "referent", resolved.question, resolved.candidates);
      } else {
        return clarify(grounded, "item", `What should I put on the list? I am not sure what "${item}" refers to.`, []);
      }
    }
  }

  if (grounded.action === "make_payment") {
    const said = (grounded.target.reference ?? "").trim();
    const anaphor = !said || grounded.target.kind === "unspecified" ? "singular" : anaphorOf(said);
    if (anaphor) {
      const resolved = resolveAnaphor(anaphor, await env.references(), { kinds: ["bill"], now: env.now });
      if (resolved.kind === "resolved" && resolved.entities.length === 1) {
        const bill = resolved.entities[0]!;
        grounded = {
          ...grounded,
          target: { kind: "bill", reference: bill.label },
          parameters: { ...grounded.parameters, billLabel: bill.label, ...(bill.entityId ? { billId: bill.entityId } : {}) },
          // Which bill is no longer the doubt, so the low confidence "pay it"
          // alone earned no longer applies. It is still a proposal: paying
          // needs a person's yes and every finance gate, whatever this says.
          confidence: Math.max(grounded.confidence, 0.8),
        };
        focus.push({ ...bill, source: "mention", at });
      } else if (resolved.kind === "ambiguous") {
        return clarify(grounded, "referent", resolved.question.replace(/^Do you mean/, "Which bill do you mean —").replace(/\?$/, "?"), resolved.candidates);
      }
    }
  }

  return { kind: "grounded", intent: grounded, focus };
}

/** Whether an intent is one grounding has anything to do for. */
export function needsGrounding(intent: HouseholdIntent): boolean {
  return intent.action !== "unknown" && intent.action !== "greet" && intent.action !== "ask_status" && intent.action !== "check_agents";
}

// ---------------------------------------------------------------------------

type PersonReference =
  | { kind: "resolved"; item: HouseholdContextItem }
  | { kind: "ask"; question: string; candidates: FocusEntity[] };

/**
 * "Him", "her", "the other one" — the person the conversation was just
 * about, or the other of exactly two children.
 */
async function personFromReference(said: string, env: GroundingEnv): Promise<PersonReference> {
  const references = await env.references();
  const at = env.now.toISOString();
  const recentMembers = [...references.clarification, ...references.proposal, ...references.conversation]
    .filter((entity) => entity.entityType === "member" && entity.entityId)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const itemFor = (memberId: string | null) => env.people.find((item) => item.entityType === "member" && item.entityId === memberId) ?? null;

  if (/other/i.test(said)) {
    const last = recentMembers[0] ? itemFor(recentMembers[0].entityId) : null;
    const siblings = env.people.filter((item) => item.entityType === "member" && last && item.entityId !== last.entityId && item.attributes.memberType === last.attributes.memberType);
    if (last && siblings.length === 1) return { kind: "resolved", item: siblings[0]! };
    const candidates = siblings.slice(0, 3).map((item) => memberFocus(item, at));
    return { kind: "ask", question: candidates.length > 1 ? whichOf(candidates).replace(/^Do you mean/, "Who do you mean —") : "Who do you mean by the other one?", candidates };
  }

  const newest = recentMembers[0];
  const sameMoment = recentMembers.filter((entity) => newest && Date.parse(newest.at) - Date.parse(entity.at) <= 30 * 60_000 && entity.entityId !== newest.entityId);
  if (newest && sameMoment.length === 0) {
    const item = itemFor(newest.entityId);
    if (item) return { kind: "resolved", item };
  }
  const candidates = [newest, ...sameMoment].filter((entity): entity is FocusEntity => Boolean(entity)).slice(0, 3);
  return { kind: "ask", question: candidates.length > 1 ? whichOf(candidates).replace(/^Do you mean/, "Who do you mean —") : `Who do you mean by "${said}"?`, candidates };
}

function withMember(intent: HouseholdIntent, item: HouseholdContextItem): HouseholdIntent {
  const name = String(item.attributes.displayName);
  return {
    ...intent,
    target: { kind: "member", reference: name.toLowerCase() },
    parameters: { ...intent.parameters, memberId: item.entityId, memberName: name },
  };
}

function memberFocus(item: HouseholdContextItem, at: string): FocusEntity {
  return { entityType: "member", entityId: item.entityId, label: String(item.attributes.displayName), source: "mention", at };
}

function clarify(intent: HouseholdIntent, awaiting: Awaiting, question: string, candidates: FocusEntity[]): Grounding {
  return {
    kind: "clarify",
    intent: { ...intent, parameters: { ...intent.parameters, awaiting, ...(candidates.length > 0 ? { candidates } : {}) } },
    question,
    awaiting,
    candidates,
  };
}
