import type { AutonomyMode } from "./autonomy";
import {
  downstreamOf,
  validateResponsibility,
  type ConfigMember,
  type PolicyCategory,
} from "./configuration";

/**
 * Teaching the household in plain sentences (story 02-006).
 *
 * The Head of Family says "Priya handles the school run from now on" and the
 * household is configured — the same canonical responsibility row the wizard
 * would have written, validated the same way and audited the same way. The
 * sentence is a faster way to reach the configuration, never a second kind of
 * configuration.
 *
 * Three things hold this together, and none of them may be relaxed later.
 *
 * **Understanding is deterministic.** No provider is configured with
 * credentials, and `CLAUDE.md` is explicit that a provider is live only once
 * it is. So this reads a small, named set of sentence shapes and returns
 * `unknown` for anything else. It is a grammar, not a model, and it does not
 * pretend otherwise: a sentence it does not recognise produces a question,
 * which is exactly what a real provider should do when it is unsure.
 * `UNDERSTOOD_SHAPES` is the honest list of what it knows.
 *
 * **Understanding is never permission.** This module produces a *proposal*.
 * Whether the person may make the change is decided by
 * `requireHouseholdAdmin` on the server, and whether the change makes sense
 * is decided by the same `validateResponsibility` / `validatePlaybookItem`
 * the forms use. A sentence cannot reach anything a form could not.
 *
 * **Nothing is applied without being shown first.** Every proposal carries
 * the downstream effects in the household's own terms, and the caller applies
 * it only after a person has agreed to those specific words. Reading a
 * confident sentence as consent is how an assistant ends up changing
 * something nobody meant.
 */

export type ConfigurationIntent =
  | {
      kind: "assign";
      /** Resolved to a real member by the caller, or left unresolved to ask about. */
      memberName: string;
      outcomeKey: string;
      outcomeLabel: string;
    }
  | { kind: "autonomy"; outcomeKey: string; outcomeLabel: string; mode: AutonomyMode }
  | { kind: "spend_limit"; limitMinor: number; currency: "INR" }
  | { kind: "quiet_hours"; startHour: number; endHour: number }
  | { kind: "family_time"; label: string; startHour: number; endHour: number }
  | { kind: "unknown" };

/**
 * The sentence shapes this understands, in the household's words.
 *
 * Kept as data rather than prose because the setup screen shows it: a person
 * told what they can say gets it right, and a person left to guess types
 * something reasonable and is told "I did not follow that", which reads as
 * the product being broken.
 */
export const UNDERSTOOD_SHAPES: readonly { example: string; does: string }[] = [
  { example: "Priya handles the school run from now on.", does: "Gives an outcome an owner." },
  { example: "Ask me before ordering groceries.", does: "Sets how far WonderHome may go on an outcome." },
  { example: "Handle the laundry yourself.", does: "Lets WonderHome act on an outcome and tell you afterwards." },
  { example: "Never spend more than ₹2,000 without asking me.", does: "Sets the household spending limit." },
  { example: "No notifications between 9pm and 7am.", does: "Sets quiet hours." },
  { example: "Sunday lunch is family time, 1pm to 3pm.", does: "Protects time nothing may be scheduled over." },
];

/**
 * The outcomes a sentence may refer to by name.
 *
 * A household says "the school run", not "school.run". This is the whole
 * vocabulary — a phrase that is not here is not guessed at, because guessing
 * which outcome somebody meant is how the wrong person ends up responsible
 * for the money.
 */
const OUTCOME_PHRASES: readonly { phrases: readonly string[]; key: string; label: string }[] = [
  { phrases: ["school run", "school drop", "drop off", "pickup", "pick up"], key: "school.run", label: "the school run" },
  { phrases: ["homework", "school work"], key: "school.homework_done", label: "homework" },
  { phrases: ["laundry", "washing", "uniforms"], key: "laundry.ready", label: "laundry" },
  { phrases: ["groceries", "grocery", "shopping"], key: "groceries.stocked", label: "groceries" },
  { phrases: ["dinner", "meals", "cooking"], key: "meals.dinner_ready", label: "dinner" },
  { phrases: ["bills", "the bills", "payments"], key: "finance.bills_paid", label: "the bills" },
  { phrases: ["pets", "the dog", "the cat"], key: "pets.cared_for", label: "the pets" },
  { phrases: ["maintenance", "repairs", "the house"], key: "home.maintenance", label: "home maintenance" },
];

/**
 * Reads a household sentence.
 *
 * Matching is deliberately narrow. Every shape it accepts is one of
 * `UNDERSTOOD_SHAPES`; everything else is `unknown`, which the caller turns
 * into a question rather than a change.
 */
export function readConfigurationSentence(utterance: string): ConfigurationIntent {
  const text = normalize(utterance);

  // "Never spend more than ₹2,000 without asking." — also "2000 rupees", "Rs 2,000".
  const spend = /(?:spend|pay|buy).{0,20}?(?:more than|over|above)\s*(?:₹|rs\.?|inr)?\s*([\d,]+)/.exec(text)
    ?? /(?:limit|cap).{0,20}?(?:₹|rs\.?|inr)\s*([\d,]+)/.exec(text);
  if (spend) {
    const rupees = Number(spend[1]!.replace(/,/g, ""));
    if (Number.isFinite(rupees) && rupees > 0) {
      return { kind: "spend_limit", limitMinor: Math.round(rupees * 100), currency: "INR" };
    }
  }

  // "No notifications between 9pm and 7am." / "Don't disturb us after 9pm."
  if (/(?:notification|notify|disturb|message|ping)/.test(text)) {
    const range = readHourRange(text);
    if (range) return { kind: "quiet_hours", ...range };
  }

  // "Sunday lunch is family time, 1pm to 3pm."
  const familyTime = /^(.+?)\s+is\s+family time/.exec(text);
  if (familyTime) {
    const range = readHourRange(text);
    if (range) {
      return { kind: "family_time", label: titleCase(familyTime[1]!.trim()), ...range };
    }
  }

  const outcome = findOutcome(text);

  // "Ask me before ordering groceries." / "Handle the laundry yourself."
  const mode = readAutonomy(text);
  if (mode && outcome) {
    return { kind: "autonomy", outcomeKey: outcome.key, outcomeLabel: outcome.label, mode };
  }

  // "Priya handles the school run from now on." / "Ravi is responsible for the bills."
  const assign =
    /^([a-z][a-z' -]{1,40}?)\s+(?:handles|does|takes over|looks after|is in charge of|is responsible for|owns)\b/.exec(text);
  if (assign && outcome) {
    return {
      kind: "assign",
      memberName: titleCase(assign[1]!.trim()),
      outcomeKey: outcome.key,
      outcomeLabel: outcome.label,
    };
  }

  return { kind: "unknown" };
}

/** A proposed change, with everything a person needs to agree to it. */
export type ConfigurationProposal =
  | { kind: "clarify"; question: string; examples: readonly string[] }
  | { kind: "refused"; reason: string }
  | {
      kind: "change";
      /** One line naming what would happen, in the household's own words. */
      summary: string;
      /** What it means for them afterwards. */
      downstream: string[];
      change: ResolvedChange;
    };

/**
 * A change in exactly the shape the repository already takes, so applying one
 * is the same validated, audited write the wizard performs. There is no second
 * write path for sentences, and that is the point.
 */
export type ResolvedChange =
  | {
      kind: "responsibility";
      responsibility: {
        outcomeKey: string;
        primaryMemberId: string | null;
        backupMemberId: string | null;
        aiMode: AutonomyMode;
        priority: number;
      };
    }
  | {
      kind: "policy";
      category: PolicyCategory;
      name: string;
      rule: Record<string, unknown>;
    }
  | {
      kind: "playbook";
      item: {
        outcomeKey: string;
        name: string;
        outcomeDefinition: string;
        operatingWindow: { startHour: number; endHour: number } | null;
        escalateAfterHours: number | null;
      };
    };

export type ProposalContext = {
  members: readonly ConfigMember[];
  /** The responsibilities the household already has, so a sentence edits rather than replaces. */
  existing: readonly { outcomeKey: string; primaryMemberId: string | null; backupMemberId: string | null; aiMode: AutonomyMode; priority: number }[];
  /** The next version this policy name would take. */
  nextVersionFor: (category: PolicyCategory, name: string) => number;
};

export function proposeConfiguration(
  utterance: string,
  context: ProposalContext,
): ConfigurationProposal {
  const intent = readConfigurationSentence(utterance);

  switch (intent.kind) {
    case "unknown":
      return {
        kind: "clarify",
        question: "I did not follow that. Here is the kind of thing I understand — or use the forms above, which can say anything this can.",
        examples: UNDERSTOOD_SHAPES.map((shape) => shape.example),
      };

    case "assign":
      return proposeAssignment(intent, context);

    case "autonomy":
      return proposeAutonomy(intent, context);

    case "spend_limit":
      return {
        kind: "change",
        summary: `Ask before spending more than ${formatRupees(intent.limitMinor)}.`,
        downstream: downstreamOf({
          kind: "policy",
          category: "spending",
          name: "Everyday spending",
          version: context.nextVersionFor("spending", "Everyday spending"),
        }),
        change: {
          kind: "policy",
          category: "spending",
          name: "Everyday spending",
          rule: { limitMinor: intent.limitMinor, currency: intent.currency, note: sentenceOf(utterance) },
        },
      };

    case "quiet_hours":
      return {
        kind: "change",
        summary: `Stay quiet between ${formatHour(intent.startHour)} and ${formatHour(intent.endHour)}.`,
        downstream: [
          ...downstreamOf({
            kind: "policy",
            category: "notifications",
            name: "Quiet hours",
            version: context.nextVersionFor("notifications", "Quiet hours"),
          }),
          "Something genuinely urgent still reaches you. Quiet hours hold back the rest until morning.",
        ],
        change: {
          kind: "policy",
          category: "notifications",
          name: "Quiet hours",
          rule: { quietFromHour: intent.startHour, quietUntilHour: intent.endHour, note: sentenceOf(utterance) },
        },
      };

    case "family_time":
      return {
        kind: "change",
        summary: `Hold ${intent.label.toLowerCase()} as family time, ${formatHour(intent.startHour)} to ${formatHour(intent.endHour)}.`,
        downstream: downstreamOf({
          kind: "policy",
          category: "family_time",
          name: intent.label,
          version: context.nextVersionFor("family_time", intent.label),
        }),
        change: {
          kind: "policy",
          category: "family_time",
          name: intent.label,
          rule: { startHour: intent.startHour, endHour: intent.endHour, protected: true, note: sentenceOf(utterance) },
        },
      };
  }
}

function proposeAssignment(
  intent: Extract<ConfigurationIntent, { kind: "assign" }>,
  context: ProposalContext,
): ConfigurationProposal {
  const matches = context.members.filter(
    (member) => normalize(member.displayName).split(" ")[0] === normalize(intent.memberName),
  );

  if (matches.length === 0) {
    return {
      kind: "clarify",
      question: `I could not find ${intent.memberName} in this household. Who should take on ${intent.outcomeLabel}?`,
      examples: context.members.map((member) => `${member.displayName} handles ${intent.outcomeLabel}.`),
    };
  }

  if (matches.length > 1) {
    // Two people whose names begin the same way. Picking one would be a coin
    // toss with somebody's responsibilities.
    return {
      kind: "clarify",
      question: `There is more than one ${intent.memberName} here. Which of them did you mean?`,
      examples: matches.map((member) => `${member.displayName} handles ${intent.outcomeLabel}.`),
    };
  }

  const owner = matches[0]!;
  const current = context.existing.find((row) => row.outcomeKey === intent.outcomeKey);

  const responsibility = {
    outcomeKey: intent.outcomeKey,
    primaryMemberId: owner.id,
    // The person being replaced becomes the backup: somebody who used to do it
    // is the obvious person to cover, and a handover that silently drops the
    // previous owner is how a household ends up with nobody to ask.
    backupMemberId:
      current?.primaryMemberId && current.primaryMemberId !== owner.id ? current.primaryMemberId : null,
    aiMode: current?.aiMode ?? ("prepare" as AutonomyMode),
    priority: current?.priority ?? 3,
  };

  const validation = validateResponsibility(responsibility, context.members);
  if (!validation.ok) {
    return { kind: "refused", reason: validation.problems[0]!.message };
  }

  const previousOwner = responsibility.backupMemberId
    ? context.members.find((member) => member.id === responsibility.backupMemberId)
    : undefined;

  return {
    kind: "change",
    summary: `${owner.displayName} owns ${intent.outcomeLabel}.`,
    downstream: [
      ...downstreamOf({
        kind: "responsibility",
        outcomeKey: intent.outcomeKey,
        aiMode: responsibility.aiMode,
        owned: true,
      }),
      ...(previousOwner ? [`${previousOwner.displayName} stays on as backup, so there is still somebody to ask when ${owner.displayName.split(" ")[0]} is away.`] : []),
    ],
    change: { kind: "responsibility", responsibility },
  };
}

function proposeAutonomy(
  intent: Extract<ConfigurationIntent, { kind: "autonomy" }>,
  context: ProposalContext,
): ConfigurationProposal {
  const current = context.existing.find((row) => row.outcomeKey === intent.outcomeKey);

  if (!current) {
    return {
      kind: "clarify",
      question: `Nobody owns ${intent.outcomeLabel} yet. Who should, before I decide how much I may do about it?`,
      examples: context.members.map((member) => `${member.displayName} handles ${intent.outcomeLabel}.`),
    };
  }

  const responsibility = { ...current, aiMode: intent.mode };
  const validation = validateResponsibility(responsibility, context.members);
  if (!validation.ok) {
    return { kind: "refused", reason: validation.problems[0]!.message };
  }

  return {
    kind: "change",
    summary: `${describeMode(intent.mode)} for ${intent.outcomeLabel}.`,
    downstream: downstreamOf({
      kind: "responsibility",
      outcomeKey: intent.outcomeKey,
      aiMode: intent.mode,
      owned: current.primaryMemberId !== null,
    }),
    change: { kind: "responsibility", responsibility },
  };
}

/**
 * The autonomy a sentence is asking for.
 *
 * Checked most-restrictive first: "never do the shopping without asking me"
 * contains both "never" and "asking", and reading it as anything but a
 * restriction would be the worst possible mistake to make here.
 */
function readAutonomy(text: string): AutonomyMode | null {
  if (/\b(?:just watch|only watch|watch only|don'?t act|do nothing)\b/.test(text)) return "observe";
  if (/\b(?:ask me|check with me|ask first|without asking|never .* without)\b/.test(text)) return "approve";
  if (/\b(?:handle|take care of|sort out|deal with)\b.*\b(?:yourself|on your own|automatically)\b/.test(text)) {
    return "execute";
  }
  if (/\b(?:get .* ready|prepare|draft|line .* up|leave it (?:to|for) me)\b/.test(text)) return "prepare";
  return null;
}

function describeMode(mode: AutonomyMode): string {
  switch (mode) {
    case "observe":
      return "Watch only";
    case "prepare":
      return "Get things ready and leave them to you";
    case "approve":
      return "Ask you before acting";
    case "execute":
      return "Act, then tell you";
  }
}

/**
 * An hour range as a household writes one: "between 9pm and 7am", "1pm to 3pm",
 * "from 21:00 until 07:00".
 */
function readHourRange(text: string): { startHour: number; endHour: number } | null {
  const match =
    /(?:between|from)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:and|to|until|–|-)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/.exec(
      text,
    );
  if (!match) return null;

  const startHour = toHour(match[1]!, match[3]);
  const endHour = toHour(match[4]!, match[6]);
  if (startHour === null || endHour === null) return null;

  // A window that starts and ends at the same hour says nothing; the forms
  // refuse it too, and a sentence should not be a way around a rule.
  if (startHour === endHour) return null;

  return { startHour, endHour };
}

function toHour(value: string, period: string | undefined): number | null {
  const raw = Number(value);
  if (!Number.isInteger(raw)) return null;

  if (period === "pm") return raw === 12 ? 12 : raw + 12 > 23 ? null : raw + 12;
  if (period === "am") return raw === 12 ? 0 : raw > 23 ? null : raw;
  return raw >= 0 && raw <= 23 ? raw : null;
}

function findOutcome(text: string): { key: string; label: string } | null {
  for (const entry of OUTCOME_PHRASES) {
    if (entry.phrases.some((phrase) => text.includes(phrase))) {
      return { key: entry.key, label: entry.label };
    }
  }
  return null;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[.!?]+$/, "").replace(/\s+/g, " ");
}

/** The person's own sentence, kept on the policy so the rule reads as theirs. */
function sentenceOf(utterance: string): string {
  return utterance.trim().slice(0, 300);
}

function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function formatRupees(minor: number): string {
  return `₹${(minor / 100).toLocaleString("en-IN")}`;
}

function formatHour(hour: number): string {
  const period = hour < 12 ? "am" : "pm";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}${period}`;
}

/**
 * Representative household utterances, as deterministic regression fixtures.
 *
 * This is the story's acceptance criterion, and it is also what keeps the
 * grammar honest: when a real provider is configured it must still read these
 * sentences the same way, and the ones marked `unknown` are as important as
 * the rest — a provider that confidently invents a reading for "sort out the
 * house" is worse than one that asks.
 */
export const CONFIG_UTTERANCE_FIXTURES: readonly {
  utterance: string;
  expect: ConfigurationIntent;
  note: string;
}[] = [
  {
    utterance: "Priya handles the school run from now on.",
    expect: { kind: "assign", memberName: "Priya", outcomeKey: "school.run", outcomeLabel: "the school run" },
    note: "The canonical example, and the one the Responsibilities screen links to.",
  },
  {
    utterance: "Ravi is responsible for the bills.",
    expect: { kind: "assign", memberName: "Ravi", outcomeKey: "finance.bills_paid", outcomeLabel: "the bills" },
    note: "A different verb for the same change. Both are ordinary English for it.",
  },
  {
    utterance: "Meera looks after the pets.",
    expect: { kind: "assign", memberName: "Meera", outcomeKey: "pets.cared_for", outcomeLabel: "the pets" },
    note: "Ownership without the word 'responsible' anywhere in it.",
  },
  {
    utterance: "Ask me before ordering groceries.",
    expect: { kind: "autonomy", outcomeKey: "groceries.stocked", outcomeLabel: "groceries", mode: "approve" },
    note: "Setting autonomy is configuration, not a one-off instruction.",
  },
  {
    utterance: "Handle the laundry yourself.",
    expect: { kind: "autonomy", outcomeKey: "laundry.ready", outcomeLabel: "laundry", mode: "execute" },
    note: "The most consequential sentence here, which is why it is previewed like every other.",
  },
  {
    utterance: "Just watch the bills for now.",
    expect: { kind: "autonomy", outcomeKey: "finance.bills_paid", outcomeLabel: "the bills", mode: "observe" },
    note: "Stepping autonomy down must be as easy to say as stepping it up.",
  },
  {
    utterance: "Never spend more than ₹2,000 without asking me.",
    expect: { kind: "spend_limit", limitMinor: 200000, currency: "INR" },
    note: "Contains 'ask me' too; the spending limit is the stronger reading and is checked first.",
  },
  {
    utterance: "Never spend more than 5000 rupees on groceries without asking.",
    expect: { kind: "spend_limit", limitMinor: 500000, currency: "INR" },
    note: "A limit wins over the outcome mentioned in the same breath — the money is the point.",
  },
  {
    utterance: "No notifications between 9pm and 7am.",
    expect: { kind: "quiet_hours", startHour: 21, endHour: 7 },
    note: "A window that wraps past midnight, which is the normal case for quiet hours.",
  },
  {
    utterance: "Sunday lunch is family time, 1pm to 3pm.",
    expect: { kind: "family_time", label: "Sunday Lunch", startHour: 13, endHour: 15 },
    note: "Protected time nothing automated may schedule over.",
  },
  {
    utterance: "Sort out the house.",
    expect: { kind: "unknown" },
    note: "Not configuration at all. Guessing would be worse than asking.",
  },
  {
    utterance: "Priya handles it from now on.",
    expect: { kind: "unknown" },
    note: "'It' is not an outcome. Which responsibility moved is exactly what must not be guessed.",
  },
  {
    utterance: "Somebody should do the laundry.",
    expect: { kind: "unknown" },
    note: "A complaint, not an assignment. No owner is named.",
  },
];
