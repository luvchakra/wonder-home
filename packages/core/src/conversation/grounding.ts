import { resolvePerson } from "../context/resolution";
import type { HouseholdContextItem } from "../context/types";
import { isConsequential, type HouseholdIntent } from "./intent";
import { anaphorOf, resolveAnaphor, whichOf, type FocusEntity, type ReferenceState } from "./references";
import { resolveTemporal, TEMPORAL_PHRASE } from "./temporal";

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
  /** Open school items, for "mark Asmi's worksheet done" and "move Manan's project to Friday". */
  schoolItems?: () => Promise<readonly SchoolItemRef[]>;
  /** The household's appliances and fixtures, for "the washing machine is making that noise". */
  assets?: () => Promise<readonly { id: string; name: string }[]>;
};

export type SchoolItemRef = { id: string; title: string; childMemberId: string; dueAt: string | null; status: string };

/** Parameters that carry a date phrase, and whether the action needs exactly one day from it. */
const DATE_KEYS = ["when", "date", "since", "to", "window"] as const;
const NEEDS_ONE_DAY: ReadonlySet<HouseholdIntent["action"]> = new Set(["record_absence", "record_health_appointment", "set_reminder"]);

/** Actions that carry a day, and the parameter the day belongs in. */
const DAY_KEY: Partial<Record<HouseholdIntent["action"], (typeof DATE_KEYS)[number]>> = {
  plan_meal: "when",
  plan_event: "when",
  set_reminder: "when",
  record_absence: "when",
  record_health_appointment: "when",
  adjust_schedule: "to",
};

const SAID_DAY = new RegExp(`\\b(${TEMPORAL_PHRASE})\\b`, "i");

/**
 * The day the person said, when an understanding named the action but left
 * the day out, or filed it under a parameter it does not belong to (a model
 * once put "tonight" in `symptom`). It is read from the person's own words
 * with the same phrase pattern the rules use, then resolved like any other
 * phrase — the day is still decided here, never by the model.
 */
function recoverSaidDay(intent: HouseholdIntent): HouseholdIntent {
  const key = DAY_KEY[intent.action];
  if (!key || DATE_KEYS.some((dateKey) => typeof intent.parameters[dateKey] === "string" && String(intent.parameters[dateKey]).trim())) return intent;
  const said = SAID_DAY.exec(intent.utterance ?? "");
  if (!said?.[1]) return intent;
  return { ...intent, parameters: { ...intent.parameters, [key]: said[1].trim().toLowerCase() } };
}

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
const MEMBER_TARGET: ReadonlySet<HouseholdIntent["action"]> = new Set(["record_absence", "assign_responsibility", "complete_school_item"]);

/** At or above this, a resolved person goes unremarked; below it the reply says "I think you mean …" (§20). */
export const CONFIDENT_AT = 0.9;

/**
 * The line a reply leads with when grounding was confident enough to act
 * but not certain (§20: "I think you mean …"). Null when there is nothing
 * to hedge. Raw numbers never reach the household; they stay on the intent
 * for evaluation.
 */
export function confidenceLead(intent: HouseholdIntent): string | null {
  if (intent.parameters.groundedConfidence !== "medium" || typeof intent.parameters.memberName !== "string") return null;
  const from = typeof intent.parameters.groundedFrom === "string" ? intent.parameters.groundedFrom : null;
  return `I think you mean ${intent.parameters.memberName}${from ? ` (you said "${from}")` : ""} — if not, say who.`;
}

/** Pronouns that point at a person rather than a thing. */
const PERSON_ANAPHOR = /^(?:him|her|he|she|them|they|the other one|the other child|the other kid|the other)$/i;

export async function groundIntent(intent: HouseholdIntent, env: GroundingEnv): Promise<Grounding> {
  let grounded: HouseholdIntent = recoverSaidDay({ ...intent, parameters: { ...intent.parameters }, target: { ...intent.target } });
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
        // Confident enough to go on, not so sure it goes unsaid (§20): the
        // reply leads with "I think you mean Asmi", so a wrong guess is one
        // "no, I meant Manan" away rather than silently acted on.
        const confidence = resolution.candidates.find((candidate) => candidate.entity.memberId === selected.entityId)?.confidence ?? 1;
        if (confidence < CONFIDENT_AT) grounded.parameters = { ...grounded.parameters, groundedConfidence: "medium", groundedFrom: said };
      } else {
        const candidates = resolution.candidates
          .filter((candidate) => candidate.confidence >= 0.5)
          .slice(0, 3)
          .map((candidate) => ({ entityType: "member", entityId: candidate.entity.memberId, label: candidate.entity.displayName, source: "clarification" as const, at }));
        const question =
          resolution.candidates.length === 0
            ? `I do not know anyone called "${said}" in your household. Who did you mean?`
            : resolution.ambiguous && candidates.length > 1
              ? `I found ${candidates.length === 2 ? "two" : String(candidates.length)} possibilities — ${joinOr(candidates.map((candidate) => candidate.label))}. Which did you mean?`
              : (resolution.question ?? `Who did you mean by "${said}"?`);
        return clarify(grounded, "member", question, candidates);
      }
    }
  }

  // --- References (§8): "put that on the list" ------------------------------
  if (grounded.action === "add_to_list" || grounded.action === "order_items" || grounded.action === "remove_from_list") {
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

  // --- School items (§21): "mark Asmi's worksheet done", "move Manan's science project to Friday"
  if (grounded.action === "complete_school_item" || (grounded.action === "adjust_schedule" && typeof grounded.parameters.what === "string" && env.schoolItems)) {
    const school = await schoolItemFor(grounded, env);
    if (school.kind === "clarify") return clarify(grounded, school.awaiting, school.question, school.candidates);
    if (school.kind === "found") {
      grounded = { ...grounded, parameters: { ...grounded.parameters, schoolItemId: school.item.id, title: school.item.title, childName: school.childName, ...(school.item.dueAt ? { dueAt: school.item.dueAt } : {}) } };
      focus.push({ entityType: "school_item", entityId: school.item.id, label: school.item.title, source: "mention", at });
    }
  }

  // --- A repair (§21): "the washing machine is making that noise again" ------
  if (grounded.action === "raise_service_request") {
    const said = typeof grounded.parameters.asset === "string" ? grounded.parameters.asset.trim() : "";
    const assets = (await env.assets?.()) ?? [];
    let asset: { id: string | null; name: string } | null = null;
    if (!said || anaphorOf(said)) {
      const resolved = resolveAnaphor("singular", await env.references(), { kinds: ["home_asset", "service_request"], now: env.now });
      if (resolved.kind === "resolved") asset = { id: resolved.entities[0]!.entityId, name: resolved.entities[0]!.label };
      else if (resolved.kind === "ambiguous") return clarify(grounded, "referent", resolved.question, resolved.candidates);
      else {
        const candidates = assets.slice(0, 3).map((entry) => ({ entityType: "home_asset", entityId: entry.id, label: entry.name, source: "clarification" as const, at }));
        return clarify(grounded, candidates.length > 0 ? "referent" : "item", candidates.length > 0 ? `Which one needs a look — ${joinOr(candidates.map((candidate) => `the ${candidate.label.toLowerCase()}`))}?` : "What needs a repair?", candidates);
      }
    } else {
      const known = matchName(said, assets);
      asset = known ? { id: known.id, name: known.name } : { id: null, name: said.charAt(0).toUpperCase() + said.slice(1) };
    }
    grounded.parameters = { ...grounded.parameters, assetName: asset.name, ...(asset.id ? { assetId: asset.id } : {}) };
    if (asset.id) focus.push({ entityType: "home_asset", entityId: asset.id, label: asset.name, source: "mention", at });
  }

  // --- Protected time (§21): "protect Saturday evening for family time" -----
  if (grounded.action === "plan_event" && grounded.parameters.protected === true) {
    const window = grounded.parameters.windowResolved as { precision?: string } | undefined;
    if (!window || window.precision === "range") {
      return clarify(grounded, "day", `Which day should I keep free for ${String(grounded.parameters.what ?? "that")}? For example "Saturday evening".`, []);
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
    // A meal plan's target is the meals outcome by definition; a model that
    // called it "unspecified" did not leave anything open to ask about.
    if (grounded.target.kind === "unspecified") grounded = { ...grounded, target: { kind: "outcome", reference: "meals" } };
    const day = (grounded.parameters.windowResolved ?? grounded.parameters.whenResolved) as { date?: string; precision?: string; window?: { from: string } | null; label?: string } | undefined;
    const what = String(grounded.parameters.mealName ?? grounded.parameters.what ?? "the meal");
    if (!day?.date || day.precision === "range") {
      return clarify(grounded, "day", `Which day should I plan ${what.toLowerCase()} for?`, []);
    }
    // "Something vegetarian" is a kind of meal, not a dish: which one is the
    // household's to say, from its own recipes — never a dish made up here.
    if (typeof grounded.parameters.diet === "string" && typeof grounded.parameters.mealName !== "string") {
      const recipes = (await env.recipes?.()) ?? [];
      const candidates = recipes.slice(0, 3).map((recipe) => ({ entityType: "recipe", entityId: recipe.id, label: recipe.name, source: "clarification" as const, at }));
      const when = day.label ? day.label.replace(/\s*\(.*\)$/, "") : "then";
      const question = candidates.length > 0
        ? `Which ${grounded.parameters.diet} dish should I plan for ${when}? For example ${joinOr(candidates.map((candidate) => candidate.label))} — or name another.`
        : `Which ${grounded.parameters.diet} dish should I plan for ${when}?`;
      return clarify(grounded, candidates.length > 0 ? "referent" : "item", question, candidates);
    }
    // A recipe id is only ever one of this household's recipes.
    if (typeof grounded.parameters.recipeId === "string") {
      const recipes = (await env.recipes?.()) ?? [];
      if (!recipes.some((recipe) => recipe.id === grounded.parameters.recipeId)) {
        const next = { ...grounded.parameters };
        delete next.recipeId;
        grounded = { ...grounded, parameters: next };
      }
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
  const diet = /^(?:something\s+|a\s+|an\s+|some\s+)?(vegetarian|veg|vegan|non-veg|healthy|light|quick|simple)(?:\s+(?:meal|dish|food|dinner|lunch|breakfast))?$/.exec(words.trim());
  if (diet) {
    const slotWord = Object.keys(SLOT_WORDS).find((word) => new RegExp(`\\b${word}\\b`).test(words));
    return { diet: diet[1], ...(slotWord ? { slot: SLOT_WORDS[slotWord] } : {}) };
  }
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

type SchoolLookup =
  | { kind: "found"; item: SchoolItemRef; childName: string | null }
  | { kind: "clarify"; awaiting: Awaiting; question: string; candidates: FocusEntity[] }
  | { kind: "none" };

/**
 * The one open school item a request names: "Asmi's worksheet", "Manan's
 * science project". A child named first narrows it to theirs. One match is
 * the item; several are one question; none is said so — nothing is ever
 * marked done or moved on a guess. An id already on the intent (from an
 * answer to that question) is trusted only if it is one of these items.
 */
async function schoolItemFor(intent: HouseholdIntent, env: GroundingEnv): Promise<SchoolLookup> {
  const items = ((await env.schoolItems?.()) ?? []).filter((entry) => entry.status !== "done" && entry.status !== "cancelled");
  const at = env.now.toISOString();
  const given = typeof intent.parameters.schoolItemId === "string" ? items.find((entry) => entry.id === intent.parameters.schoolItemId) : null;
  const nameOf = (childId: string) => env.people.find((person) => person.entityType === "member" && person.entityId === childId)?.attributes.displayName as string | undefined;
  if (given) return { kind: "found", item: given, childName: nameOf(given.childMemberId) ?? null };

  let childId = typeof intent.parameters.memberId === "string" ? intent.parameters.memberId : null;
  let title = typeof intent.parameters.title === "string" ? intent.parameters.title : "";
  if (intent.action === "adjust_schedule") {
    const said = String(intent.parameters.what ?? "");
    const possessive = /^([A-Za-z]+)'s\s+(.+)$/.exec(said.trim());
    title = possessive ? possessive[2]! : said;
    if (possessive) {
      const resolution = resolvePerson(possessive[1]!, env.people, { viewerMemberId: env.viewerMemberId });
      childId = resolution.selected?.memberId ?? null;
    }
  }
  const wanted = normalWords(title);
  if (wanted.length === 0) return intent.action === "adjust_schedule" ? { kind: "none" } : { kind: "clarify", awaiting: "item", question: "Which piece of school work do you mean?", candidates: [] };
  const theirs = childId ? items.filter((entry) => entry.childMemberId === childId) : items;
  const matches = theirs.filter((entry) => wanted.every((word) => normalWords(entry.title).some((have) => have.startsWith(word) || word.startsWith(have))));
  if (matches.length === 1) return { kind: "found", item: matches[0]!, childName: nameOf(matches[0]!.childMemberId) ?? null };
  const whose = childId ? `${nameOf(childId) ?? "them"}` : null;
  if (matches.length > 1) {
    const candidates = matches.slice(0, 3).map((entry) => ({ entityType: "school_item", entityId: entry.id, label: entry.title, source: "clarification" as const, at }));
    return { kind: "clarify", awaiting: "referent", question: `Which one do you mean — ${joinOr(candidates.map((candidate) => `"${candidate.label}"`))}?`, candidates };
  }
  // A move that names no school work at all is about the calendar, not school.
  if (intent.action === "adjust_schedule") return { kind: "none" };
  const open = theirs.slice(0, 3).map((entry) => ({ entityType: "school_item", entityId: entry.id, label: entry.title, source: "clarification" as const, at }));
  return {
    kind: "clarify",
    awaiting: open.length > 0 ? "referent" : "item",
    question:
      open.length > 0
        ? `I cannot find anything called "${title}" still open${whose ? ` for ${whose}` : ""}. Do you mean ${joinOr(open.map((candidate) => `"${candidate.label}"`))}?`
        : `I cannot find anything called "${title}" still open${whose ? ` for ${whose}` : ""}.`,
    candidates: open,
  };
}

function normalWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !["the", "a", "an", "her", "his", "their", "my", "our"].includes(word));
}

/** An appliance by name: exact, or the one whose name contains what was said. */
function matchName(said: string, entries: readonly { id: string; name: string }[]): { id: string; name: string } | null {
  const wanted = normalWords(said).join(" ");
  if (!wanted) return null;
  const exact = entries.find((entry) => normalWords(entry.name).join(" ") === wanted);
  if (exact) return exact;
  const containing = entries.filter((entry) => normalWords(entry.name).join(" ").includes(wanted) || wanted.includes(normalWords(entry.name).join(" ")));
  return containing.length === 1 ? containing[0]! : null;
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

function joinOr(labels: readonly string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;
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
