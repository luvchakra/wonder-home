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
  /** The household's recipes, read only when a plan might be a meal. */
  recipes?: () => Promise<readonly { id: string; name: string }[]>;
  /** The ingredient names of a planned meal or a recipe, for "make sure we have everything". */
  ingredients?: (of: { mealId?: string | null; recipeId?: string | null }) => Promise<string[]>;
};

/** Parameters that carry a date phrase, and whether the action needs exactly one day from it. */
const DATE_KEYS = ["when", "date", "since", "to", "window"] as const;
const NEEDS_ONE_DAY: ReadonlySet<HouseholdIntent["action"]> = new Set(["record_absence", "record_health_appointment", "set_reminder"]);

/** The meals a plan can be for, and the words that say so. */
const SLOT_WORDS: Record<string, "breakfast" | "lunch" | "snack" | "dinner"> = {
  breakfast: "breakfast",
  lunch: "lunch",
  snack: "snack",
  snacks: "snack",
  dinner: "dinner",
  supper: "dinner",
};

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

  // --- A plan that is a meal (§11): "plan pasta for tonight" ---------------
  if (grounded.action === "plan_event" && typeof grounded.parameters.what === "string") {
    const meal = await asMeal(grounded.parameters.what, env);
    if (meal) {
      grounded = {
        ...grounded,
        action: "plan_meal",
        target: { kind: "outcome", reference: "meals" },
        parameters: { ...grounded.parameters, ...meal },
      };
    }
  }
  if (grounded.action === "plan_meal") {
    const day = (grounded.parameters.windowResolved ?? grounded.parameters.whenResolved) as { date?: string; precision?: string; window?: { from: string } | null } | undefined;
    const what = String(grounded.parameters.mealName ?? grounded.parameters.what ?? "the meal");
    if (!day?.date || day.precision === "range") {
      return clarify(grounded, "day", `Which day should I plan ${what.toLowerCase()} for?`, []);
    }
    if (typeof grounded.parameters.slot !== "string") grounded.parameters.slot = slotFor(day.window?.from ?? null);
    focus.push({ entityType: "meal", entityId: null, label: what, source: "mention", at });
  }

  // --- What a meal needs (§11): "make sure we have everything" -------------
  if (grounded.action === "add_to_list" && typeof grounded.parameters.ingredientsOf === "string") {
    const of = grounded.parameters.ingredientsOf.trim();
    let subject: { label: string; mealId: string | null; recipeId: string | null } | null = null;
    if (anaphorOf(of) || /^(?:it|dinner|lunch|breakfast|the meal|tonight'?s dinner)$/i.test(of)) {
      const resolved = resolveAnaphor("singular", await env.references(), { kinds: ["meal"], now: env.now });
      if (resolved.kind === "resolved") subject = { label: resolved.entities[0]!.label, mealId: resolved.entities[0]!.entityId, recipeId: null };
      else if (resolved.kind === "ambiguous") return clarify(grounded, "referent", resolved.question, resolved.candidates);
    } else {
      const recipe = matchRecipe(of, (await env.recipes?.()) ?? []);
      subject = { label: recipe?.name ?? of, mealId: null, recipeId: recipe?.id ?? null };
    }
    if (!subject) {
      return clarify(grounded, "item", 'Everything for which meal? Name it, or tell me what to put on the list.', []);
    }
    const names = subject.mealId || subject.recipeId ? ((await env.ingredients?.({ mealId: subject.mealId, recipeId: subject.recipeId })) ?? []) : [];
    if (names.length === 0) {
      return clarify(
        { ...grounded, parameters: { ...grounded.parameters, forMeal: subject.label } },
        "item",
        `I do not know what goes into ${subject.label.toLowerCase()} — there is no recipe for it on record. What should I put on the list for it?`,
        [],
      );
    }
    const next: Record<string, unknown> = { ...grounded.parameters, items: names, forMeal: subject.label };
    delete next.item;
    delete next.ingredientsOf;
    grounded = { ...grounded, parameters: next };
    focus.push({ entityType: "meal", entityId: subject.mealId, label: subject.label, source: "mention", at });
  }

  // --- A reminder (§10): when, and what "them" was --------------------------
  if (grounded.action === "set_reminder") {
    if (typeof grounded.parameters.when !== "string" || !grounded.parameters.when.trim()) {
      return clarify(grounded, "day", "When should I remind you — later today, tomorrow, or another day?", []);
    }
    const what = typeof grounded.parameters.what === "string" ? grounded.parameters.what : "";
    const pointer = /\b(them|those|these|it|that|this)\b/i.exec(what);
    if (pointer) {
      const kind = anaphorOf(pointer[1]!)!;
      const resolved = resolveAnaphor(kind, await env.references(), { kinds: ["thing", "consumable", "meal", "bill", "school_item"], now: env.now });
      if (resolved.kind === "resolved") {
        const labels = resolved.entities.map((entity) => entity.label.toLowerCase());
        grounded.parameters = { ...grounded.parameters, what: what.replace(pointer[0], joinLabels(labels)), referred: pointer[1] };
        focus.push(...resolved.entities.map((entity) => ({ ...entity, source: "mention" as const, at })));
      } else if (resolved.kind === "ambiguous") {
        return clarify(grounded, "referent", resolved.question, resolved.candidates);
      }
      // Nothing to point at: the reminder keeps the household's own words.
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

/**
 * Whether "plan X" is a meal: it names a meal of the day ("pasta for
 * dinner") or one of the household's own recipes. Anything else stays a
 * plan on the family calendar — a guess that "a picnic" is dinner would be
 * worse than asking.
 */
async function asMeal(what: string, env: GroundingEnv): Promise<Record<string, unknown> | null> {
  const words = what.toLowerCase();
  const slotWord = Object.keys(SLOT_WORDS).find((word) => new RegExp(`\\b${word}\\b`).test(words));
  const dish = words
    .replace(/\b(?:for|on|at)\s+(?:breakfast|lunch|snacks?|dinner|supper)\b/g, "")
    .replace(/\b(?:breakfast|lunch|snacks?|dinner|supper)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const recipe = dish ? matchRecipe(dish, (await env.recipes?.()) ?? []) : null;
  if (!slotWord && !recipe) return null;
  const name = recipe?.name ?? (dish ? dish.charAt(0).toUpperCase() + dish.slice(1) : null);
  if (!name) return null;
  return {
    mealName: name,
    ...(recipe ? { recipeId: recipe.id } : {}),
    ...(slotWord ? { slot: SLOT_WORDS[slotWord] } : {}),
  };
}

/** A recipe by its name, or by the dish it is named after ("pasta" → "Tomato pasta" when only one fits). */
function matchRecipe(said: string, recipes: readonly { id: string; name: string }[]): { id: string; name: string } | null {
  const normal = (text: string) => text.toLowerCase().replace(/[^a-z0-9 ]+/g, "").replace(/^(?:the|a|an|some)\s+/, "").trim();
  const wanted = normal(said);
  if (!wanted) return null;
  const exact = recipes.find((recipe) => normal(recipe.name) === wanted);
  if (exact) return exact;
  const containing = recipes.filter((recipe) => new RegExp(`\\b${wanted.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(normal(recipe.name)));
  return containing.length === 1 ? containing[0]! : null;
}

/** The meal of the day a time window points at: evening is dinner. */
function slotFor(from: string | null): "breakfast" | "lunch" | "snack" | "dinner" {
  if (!from) return "dinner";
  const hour = Number(from.slice(0, 2));
  if (hour < 11) return "breakfast";
  if (hour < 15) return "lunch";
  if (hour < 17) return "snack";
  return "dinner";
}

function joinLabels(labels: readonly string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
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
