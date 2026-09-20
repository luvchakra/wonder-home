import type { MemberType } from "../identity/schemas";
import { MODEL_PROVIDERS, type KeySource, type ModelProvider } from "./model-key";

/**
 * What may be told to a model provider, and how little of it (story 15-005).
 *
 * Two questions are answered here, in this order, and neither may be skipped:
 *
 *   1. **May this household's content go to a provider at all?** That is the
 *      configured data-use policy, and it is checked before anything is
 *      assembled. A household that has not said yes has not said yes.
 *   2. **What is the least that answers the question?** Everything the
 *      assistant could see is not what it needs. Each candidate has to earn
 *      its place by being relevant to the turn, and what does not go is
 *      recorded with the reason.
 *
 * Both are pure functions with no provider client anywhere near them, which
 * is what lets the whole gate be tested exhaustively before any provider is
 * live. Today nothing is transmitted at all — understanding is deterministic,
 * because `CLAUDE.md` says a provider counts as live only once its
 * credentials and contract behaviour exist — so this is the gate a provider
 * will arrive behind, built before it rather than after.
 *
 * The invariant worth defending: a household cannot consent its way past the
 * `credential` class. Tokens and keys are not theirs to trade, they are the
 * thing an attacker wants, and a policy flag that could release them is a
 * policy flag somebody will eventually set by accident.
 */

export const CONTENT_CLASSES = [
  /** Ordinary household operations: outcomes, schedules, lists. */
  "general",
  /** Anything about a child, whoever wrote it. */
  "child",
  /** Health, medication, appointments, conditions. */
  "health",
  /** Amounts, balances, bills, purchases, account references. */
  "financial",
  /** Where somebody is or will be. */
  "location",
  /** What a person said or wrote to somebody else. */
  "private_message",
  /** Keys, tokens, passwords. Never transmitted, under any policy. */
  "credential",
] as const;
export type ContentClass = (typeof CONTENT_CLASSES)[number];

/** Never sent, whatever the household has agreed to. */
const NEVER_TRANSMITTED: ReadonlySet<ContentClass> = new Set(["credential"]);

export type DataUsePolicy = {
  /** Whether household content may be sent to a model provider at all. */
  allowProviderContent: boolean;
  /** The providers this household is willing to have read their home. */
  allowedProviders: readonly ModelProvider[];
  /** The classes they have agreed may be included. */
  allowedClasses: readonly ContentClass[];
  /** Whether the provider may keep it beyond answering. */
  allowRetention: boolean;
  /** How many candidates may be sent in one turn. Smaller is better. */
  maxItems: number;
};

/**
 * What applies before a household has said anything (15-005).
 *
 * Deliberately usable rather than empty: the assistant works out of the box
 * on ordinary household operations, and everything that is somebody's private
 * business — a child, a diagnosis, an amount, a whereabouts, a message — waits
 * for an explicit yes. Reading silence as consent is the failure this default
 * exists to prevent, and starting from "nothing at all" would push households
 * to switch the whole thing on without reading it, which is worse.
 *
 * The provider list names every provider WonderHome can run on, because the
 * household is agreeing to *WonderHome's* provider rather than picking one:
 * which company that is comes from the deployment (or from the household's
 * own key), and no screen offers a choice. Pinning one name here — as an
 * earlier version did — meant a deployment or a household key on another
 * provider was refused on every turn, silently, and the assistant answered
 * from its rules alone while everybody believed a model was behind it.
 */
export const DEFAULT_DATA_USE: DataUsePolicy = {
  allowProviderContent: true,
  allowedProviders: [...MODEL_PROVIDERS],
  allowedClasses: ["general"],
  allowRetention: false,
  maxItems: 12,
};

/** A household that has turned the provider off entirely. */
export const NO_PROVIDER_DATA_USE: DataUsePolicy = {
  allowProviderContent: false,
  allowedProviders: [],
  allowedClasses: [],
  allowRetention: false,
  maxItems: 0,
};

/**
 * Reads the household's `privacy` policy row into a data-use policy.
 *
 * Unknown and malformed values fall back to the default rather than to
 * something permissive. A policy row nobody can parse must not be the reason
 * a child's information reaches a provider.
 */
export function dataUseFromRule(rule: unknown): DataUsePolicy {
  if (rule === null || typeof rule !== "object") return DEFAULT_DATA_USE;
  const raw = rule as Record<string, unknown>;

  const classes = Array.isArray(raw.allowedClasses)
    ? raw.allowedClasses.filter((value): value is ContentClass =>
        CONTENT_CLASSES.includes(value as ContentClass) && !NEVER_TRANSMITTED.has(value as ContentClass),
      )
    : DEFAULT_DATA_USE.allowedClasses;

  const providers = Array.isArray(raw.allowedProviders)
    ? raw.allowedProviders.filter((value): value is ModelProvider =>
        value === "anthropic" || value === "google" || value === "openai",
      )
    : DEFAULT_DATA_USE.allowedProviders;

  const maxItems =
    typeof raw.maxItems === "number" && Number.isInteger(raw.maxItems) && raw.maxItems > 0
      ? Math.min(raw.maxItems, 50)
      : DEFAULT_DATA_USE.maxItems;

  return {
    allowProviderContent: raw.allowProviderContent !== false,
    allowedProviders: providers,
    allowedClasses: classes,
    allowRetention: raw.allowRetention === true,
    maxItems,
  };
}

/** The household's own words for what they have agreed to. */
export function describeDataUse(policy: DataUsePolicy): string[] {
  if (!policy.allowProviderContent) {
    return ["Nothing about your home is sent to a model provider. The assistant answers from its own rules only."];
  }

  const beyondGeneral = policy.allowedClasses.filter((entry) => entry !== "general");

  return [
    `Only what is needed to answer, and never more than ${policy.maxItems} things at a time.`,
    beyondGeneral.length === 0
      ? "Ordinary household matters only. Anything about a child, health, money, whereabouts or a private message stays here."
      : `You have also agreed to send: ${beyondGeneral.map(labelFor).join(", ")}.`,
    policy.allowRetention
      ? "The provider may keep what is sent, under their own terms."
      : "The provider is asked not to keep what is sent beyond answering.",
    "Keys and tokens are never sent, whatever else you agree to.",
    "Names are replaced before anything leaves, so the provider sees roles rather than your family.",
  ];
}

function labelFor(entry: ContentClass): string {
  switch (entry) {
    case "child":
      return "information about your children";
    case "health":
      return "health information";
    case "financial":
      return "amounts and bills";
    case "location":
      return "where people are";
    case "private_message":
      return "what people wrote to each other";
    case "general":
      return "ordinary household matters";
    case "credential":
      return "keys and tokens";
  }
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

export type RoutingRefusal =
  | "no_provider_configured"
  | "provider_content_not_allowed"
  | "provider_not_allowed"
  | "nothing_to_send";

export type RoutingDecision =
  | {
      ok: true;
      provider: ModelProvider;
      keySource: Exclude<KeySource, "none">;
      /** Whether the provider may retain what is sent. */
      retention: boolean;
    }
  | { ok: false; code: RoutingRefusal; reason: string };

/**
 * Whether this call may go to this provider at all (15-005).
 *
 * Checked before a context is assembled, not after. Building the payload
 * first and deciding afterwards is how content ends up in a log, a trace or a
 * retry that the decision was supposed to prevent.
 *
 * A household's own key changes whose agreement with the provider governs the
 * call — which is why `keySource` is an input — but it does not change which
 * classes may be sent. A child's information is the child's, not the
 * household's to trade for a better retention term.
 */
export function routeToProvider(input: {
  provider: ModelProvider | null;
  keySource: KeySource;
  policy: DataUsePolicy;
  /** Whether the minimised context ended up with anything in it. */
  hasContent: boolean;
}): RoutingDecision {
  const { provider, keySource, policy } = input;

  if (!policy.allowProviderContent) {
    return {
      ok: false,
      code: "provider_content_not_allowed",
      reason: "This household has not agreed to send anything to a model provider.",
    };
  }

  if (provider === null || keySource === "none") {
    return {
      ok: false,
      code: "no_provider_configured",
      reason: "No model provider is configured, so nothing was sent.",
    };
  }

  // A household's own key *is* its choice of provider — set by an
  // administrator, audited as such (`ai.key_set`) — so the policy's provider
  // list only restricts the platform's provider, never the one they chose.
  if (keySource !== "household" && !policy.allowedProviders.includes(provider)) {
    return {
      ok: false,
      code: "provider_not_allowed",
      reason: `This household has not agreed to use ${provider}.`,
    };
  }

  if (!input.hasContent) {
    // Every candidate was withheld. Sending an empty context is a request
    // that cannot be answered and a round trip that tells the provider a
    // household asked something.
    return {
      ok: false,
      code: "nothing_to_send",
      reason: "Nothing in this turn was both needed and permitted, so nothing was sent.",
    };
  }

  return { ok: true, provider, keySource, retention: policy.allowRetention };
}

// ---------------------------------------------------------------------------
// Minimisation
// ---------------------------------------------------------------------------

export type ContextCandidate = {
  id: string;
  contentClass: ContentClass;
  /** Why the assistant wants it, in one phrase. Shown to the household. */
  need: string;
  text: string;
  /** Members this is about, so their names can be replaced before it leaves. */
  subjects?: readonly string[];
  /** Whether this turn actually needs it. Relevance is the caller's judgement. */
  relevant: boolean;
};

export type WithheldReason =
  | "not_relevant"
  | "class_not_permitted"
  | "never_transmitted"
  | "over_budget";

export type MinimisedContext = {
  included: { id: string; contentClass: ContentClass; text: string }[];
  withheld: { id: string; reason: WithheldReason; explanation: string }[];
  /**
   * Real member id to the placeholder that replaced it. Stays here; it is
   * how an answer is mapped back afterwards, and it is never transmitted.
   */
  pseudonyms: Record<string, string>;
  /** What the household is told was sent, if they ask. */
  disclosure: string[];
};

export type Person = { id: string; displayName: string; memberType: MemberType };

/**
 * Assembles the least that answers the turn (15-005).
 *
 * Four filters, applied in order so the reason a thing was withheld is the
 * most fundamental one rather than whichever happened to fire first: never
 * transmissible, not relevant, class not permitted, over budget.
 *
 * Names are replaced with roles on the way out. A provider that is told
 * "Child A has football on Thursday" can answer as well as one told the
 * child's name, and the difference is a real person's name in somebody
 * else's logs.
 */
export function minimiseContext(
  candidates: readonly ContextCandidate[],
  options: { policy: DataUsePolicy; people: readonly Person[] },
): MinimisedContext {
  const { policy, people } = options;
  const permitted = new Set(policy.allowedClasses);

  const pseudonyms = pseudonymise(people);
  const included: MinimisedContext["included"] = [];
  const withheld: MinimisedContext["withheld"] = [];

  for (const candidate of candidates) {
    if (NEVER_TRANSMITTED.has(candidate.contentClass)) {
      withheld.push({
        id: candidate.id,
        reason: "never_transmitted",
        explanation: "Keys and tokens are never sent, whatever the household has agreed to.",
      });
      continue;
    }

    if (!candidate.relevant) {
      withheld.push({
        id: candidate.id,
        reason: "not_relevant",
        explanation: "Not needed to answer this, so it was not sent.",
      });
      continue;
    }

    if (!permitted.has(candidate.contentClass)) {
      withheld.push({
        id: candidate.id,
        reason: "class_not_permitted",
        explanation: `You have not agreed to send ${labelFor(candidate.contentClass)}.`,
      });
      continue;
    }

    if (included.length >= policy.maxItems) {
      withheld.push({
        id: candidate.id,
        reason: "over_budget",
        explanation: `Only the ${policy.maxItems} most useful things are sent in one turn.`,
      });
      continue;
    }

    included.push({
      id: candidate.id,
      contentClass: candidate.contentClass,
      text: substitute(candidate.text, people, pseudonyms),
    });
  }

  return {
    included,
    withheld,
    pseudonyms,
    disclosure: discloseWhatWentOut(included, withheld, candidates),
  };
}

/**
 * Placeholders in a fixed order, so the same household produces the same
 * placeholders every turn. A provider that sees "Adult A" twice can follow a
 * conversation; one that sees a fresh random label each time cannot, and the
 * household pays for the difference in worse answers.
 */
function pseudonymise(people: readonly Person[]): Record<string, string> {
  const counts = new Map<string, number>();
  const out: Record<string, string> = {};

  for (const person of [...people].sort((a, b) => a.id.localeCompare(b.id))) {
    const role = roleWord(person.memberType);
    const next = (counts.get(role) ?? 0) + 1;
    counts.set(role, next);
    out[person.id] = `${role} ${String.fromCharCode(64 + Math.min(next, 26))}`;
  }

  return out;
}

function roleWord(memberType: MemberType): string {
  switch (memberType) {
    case "child":
      return "Child";
    case "helper":
      return "Helper";
    default:
      return "Adult";
  }
}

/**
 * The way back from a placeholder (15-005, the other direction).
 *
 * A provider that was told "Child A has football" may answer about "child
 * a". That is the pseudonym, not a person, and only this server holds the
 * map — so the reference is turned back into the member it stands for here,
 * before any gate looks at it. A reference that is not a placeholder is
 * returned unchanged: a person's first name the household member typed
 * themselves was never replaced on the way out.
 */
export function unpseudonymise(
  reference: string,
  pseudonyms: Record<string, string>,
  people: readonly Person[],
): { reference: string; memberId: string | null } {
  const wanted = reference.trim().toLowerCase().replace(/\s+/g, " ");
  for (const [memberId, placeholder] of Object.entries(pseudonyms)) {
    if (placeholder.toLowerCase() !== wanted) continue;
    const person = people.find((entry) => entry.id === memberId);
    const first = person?.displayName.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z0-9]/g, "");
    return { reference: first || reference, memberId };
  }

  const byName = people.find((person) => {
    const first = person.displayName.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z0-9]/g, "");
    return first === wanted.replace(/[^a-z0-9]/g, "");
  });
  return { reference, memberId: byName?.id ?? null };
}

/**
 * The way back for prose (the other direction of `substitute`).
 *
 * A model that composed an answer about "Adult A" and "Child B" wrote about
 * placeholders; the household reads about people. Only this server holds the
 * map, so the names go back in here, after the answer has arrived and before
 * anybody sees it. A placeholder the map does not know is left as it is.
 */
export function restoreNames(
  text: string,
  pseudonyms: Record<string, string>,
  people: readonly Person[],
): string {
  let out = text;
  for (const [memberId, placeholder] of Object.entries(pseudonyms)) {
    const person = people.find((entry) => entry.id === memberId);
    if (!person) continue;
    const first = person.displayName.split(/\s+/)[0] ?? person.displayName;
    out = out.replace(new RegExp(`\\b${escapeRegExp(placeholder)}(?:'s)?\\b`, "gi"), (match) =>
      /'s$/i.test(match) ? `${first}'s` : first,
    );
  }
  return out;
}

/** Replaces every household name in the text, longest first so "Ravi Nair" wins over "Ravi". */
function substitute(
  text: string,
  people: readonly Person[],
  pseudonyms: Record<string, string>,
): string {
  const names: { name: string; replacement: string }[] = [];

  for (const person of people) {
    const replacement = pseudonyms[person.id];
    if (!replacement) continue;

    names.push({ name: person.displayName, replacement });
    const first = person.displayName.split(/\s+/)[0];
    if (first && first !== person.displayName) names.push({ name: first, replacement });
  }

  names.sort((a, b) => b.name.length - a.name.length);

  let out = text;
  for (const { name, replacement } of names) {
    out = out.replace(new RegExp(`\\b${escapeRegExp(name)}\\b`, "gi"), replacement);
  }
  return out;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function discloseWhatWentOut(
  included: MinimisedContext["included"],
  withheld: MinimisedContext["withheld"],
  candidates: readonly ContextCandidate[],
): string[] {
  if (included.length === 0) {
    return ["Nothing about your home was sent."];
  }

  const byClass = new Map<ContentClass, number>();
  for (const entry of included) byClass.set(entry.contentClass, (byClass.get(entry.contentClass) ?? 0) + 1);

  const needs = candidates
    .filter((candidate) => included.some((entry) => entry.id === candidate.id))
    .map((candidate) => candidate.need);

  return [
    `${included.length} ${included.length === 1 ? "thing" : "things"} were sent: ${[...byClass]
      .map(([entry, count]) => `${count} × ${labelFor(entry)}`)
      .join(", ")}.`,
    `Because the assistant needed to know ${[...new Set(needs)].join(", ")}.`,
    `${withheld.length} ${withheld.length === 1 ? "thing was" : "things were"} held back.`,
    "Names were replaced with roles before anything left.",
  ];
}
