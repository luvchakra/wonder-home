import { senderKey } from "../homesend/learned";
import type { HomeSendKind } from "../homesend/items";

/**
 * Household rules HomeBrain learns from every answer, pick and correction
 * (Nothing stuck in review, phase 3: "never asked twice"). Pure: the rows
 * live in `homesend_learned_defaults` (`rules-repository.ts`).
 *
 * A rule is a key the household's words or senders produce and the value a
 * person gave for it:
 *
 *   sender_child     "notices@greenwood.edu" → Anya (a child)        (14-066)
 *   sender_person    "dr.rao@clinic.in"      → Grandma (any member)
 *   sender_area      "billing@bescom.in"     → bill
 *   vendor_category  "bescom"                → electricity
 *   phrase_item      "atta"                  → Atta (wheat flour)
 *   place_alias      "nani's"                → Nani's house
 *
 * What a rule never is: across households (a member value is checked against
 * the household on write), money (an amount is refused here and by the
 * table), an approval or a permission (no kind says "may", and nothing here
 * is read by autonomy or approval code). A key taught two different values
 * becomes `mixed`, settles nothing, and the question is asked again, as
 * "which child" always was.
 */

export const RULE_KINDS = ["sender_child", "sender_person", "sender_area", "vendor_category", "phrase_item", "place_alias"] as const;
export type RuleKind = (typeof RULE_KINDS)[number];

/** Kinds whose value is a household member; the rest are a word. */
export const MEMBER_RULE_KINDS: ReadonlySet<RuleKind> = new Set(["sender_child", "sender_person"]);

export type RuleSource = "answer" | "pick" | "correction";

export type HouseholdRule = {
  id: string;
  kind: RuleKind;
  /** Normalized, `<prefix>:<lower-cased words>`. */
  key: string;
  valueMemberId: string | null;
  valueText: string | null;
  learnedByMemberId: string | null;
  learnedFromItemId: string | null;
  learnedAt: string;
  mixed: boolean;
  source: RuleSource;
  /** How many times a person gave this same value. */
  times: number;
};

/** What a rule would say, before it is stored. */
export type Lesson = { kind: RuleKind; key: string; valueMemberId: string | null; valueText: string | null };

/** HomeSend kinds a sender may be learned to send. Never "unknown". */
const SENDER_AREAS: ReadonlySet<HomeSendKind> = new Set(["bill", "school_item", "activity_item", "event", "grocery_item", "health_document", "receipt"]);

/** Who an item may be learned to be for, from its sender. Health stays asked: a wrong guess shows one person's health to another. */
const PERSON_FROM_SENDER: ReadonlySet<HomeSendKind> = new Set(["school_item", "activity_item", "event", "bill", "receipt"]);
const CHILD_KINDS: ReadonlySet<HomeSendKind> = new Set(["school_item", "activity_item"]);

const MAX_WORDS = 80;
const MAX_VALUE = 120;

/** Lower-cased, single-spaced words; null when too short or too long to be a key. */
export function normalizeWords(text: string | null | undefined): string | null {
  if (typeof text !== "string") return null;
  const value = text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'&\s.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (value.length < 2 || value.length > MAX_WORDS) return null;
  return value;
}

/** Words that are only legal forms or noise in a payee's name ("BESCOM Ltd." → "bescom"). */
const VENDOR_NOISE = /\b(ltd|limited|pvt|private|inc|llp|co|company|corp|corporation|the)\b\.?/g;

export function vendorKey(vendor: string | null | undefined): string | null {
  const words = normalizeWords(vendor)?.replace(VENDOR_NOISE, " ").replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
  return words && words.length >= 2 ? `vendor:${words}` : null;
}

export function phraseKey(phrase: string | null | undefined): string | null {
  const words = normalizeWords(phrase);
  return words ? `phrase:${words}` : null;
}

export function placeKey(alias: string | null | undefined): string | null {
  const words = normalizeWords(alias);
  return words ? `place:${words}` : null;
}

/** A key as a person reads it: "notices@greenwood.edu", "atta". */
export function ruleKeyLabel(key: string): string {
  return key.replace(/^(sender|vendor|phrase|place):/, "");
}

/**
 * Whether a word value is safe to keep as a rule: a short label, never an
 * amount (no currency, no number with a decimal or thousands mark, no long
 * run of digits), never an instruction to approve or pay.
 */
export function safeRuleText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length < 1 || text.length > MAX_VALUE) return null;
  if (/[₹$€£¥]|\b(rs|inr|usd|eur)\b\.?\s*\d/i.test(text)) return null;
  if (/\d[\d,]*\.\d|\d{1,3}(,\d{2,3})+|\d{4,}/.test(text)) return null;
  if (/\b(approve|approved|approval|pay|paid|permission|allow|admin|password|otp)\b/i.test(text)) return null;
  return text;
}

/** The field a person answered or corrected. */
export type RuleField = "person" | "date" | "area" | "category" | "item" | "place" | "amount" | "title";

/**
 * What to remember from a person's answer, pick or correction: zero or more
 * lessons, never one about a date, an amount or a title (a rule never carries
 * money, and a date is the item's own).
 */
export function lessonsFrom(input: {
  kind: HomeSendKind | null;
  field: RuleField;
  sender?: string | null;
  vendor?: string | null;
  phrase?: string | null;
  to: { memberId?: string | null; memberType?: string | null; text?: string | null };
}): Lesson[] {
  const lessons: Lesson[] = [];
  const sender = senderKey(input.sender);
  switch (input.field) {
    case "person": {
      const memberId = input.to.memberId ?? null;
      if (!memberId || !sender || !input.kind || !PERSON_FROM_SENDER.has(input.kind)) break;
      if (CHILD_KINDS.has(input.kind)) {
        // A child's things are only ever for a child: the 14-066 rule, unchanged.
        if (input.to.memberType && input.to.memberType !== "child") break;
        lessons.push({ kind: "sender_child", key: sender, valueMemberId: memberId, valueText: null });
      } else {
        lessons.push({ kind: "sender_person", key: sender, valueMemberId: memberId, valueText: null });
      }
      break;
    }
    case "area": {
      const area = input.to.text as HomeSendKind | null | undefined;
      if (sender && area && SENDER_AREAS.has(area)) lessons.push({ kind: "sender_area", key: sender, valueMemberId: null, valueText: area });
      break;
    }
    case "category": {
      const key = vendorKey(input.vendor);
      const text = safeRuleText(input.to.text);
      if (key && text) lessons.push({ kind: "vendor_category", key, valueMemberId: null, valueText: text });
      break;
    }
    case "item": {
      const key = phraseKey(input.phrase);
      const text = safeRuleText(input.to.text);
      // "atta" → "Atta (wheat flour)": worth keeping only when the words differ from the item's own name.
      if (key && text && normalizeWords(text) !== normalizeWords(input.phrase)) lessons.push({ kind: "phrase_item", key, valueMemberId: null, valueText: text });
      break;
    }
    case "place": {
      const key = placeKey(input.phrase);
      const text = safeRuleText(input.to.text);
      if (key && text && normalizeWords(text) !== normalizeWords(input.phrase)) lessons.push({ kind: "place_alias", key, valueMemberId: null, valueText: text });
      break;
    }
    default:
      break;
  }
  return lessons;
}

/** Whether a stored rule now says something else: a key taught a different value is mixed for good (until forgotten). */
export function mergeLesson(previous: Pick<HouseholdRule, "valueMemberId" | "valueText" | "mixed" | "times"> | null, lesson: Lesson): { mixed: boolean; times: number } {
  if (!previous) return { mixed: false, times: 1 };
  const same = previous.valueMemberId === lesson.valueMemberId && (previous.valueText ?? "").toLowerCase() === (lesson.valueText ?? "").toLowerCase();
  return { mixed: previous.mixed || !same, times: same ? previous.times + 1 : previous.times };
}

/** The live (not mixed) rule for a key, if any. */
export function ruleFor(rules: readonly HouseholdRule[], kind: RuleKind, key: string | null): HouseholdRule | null {
  if (!key) return null;
  return rules.find((rule) => rule.kind === kind && rule.key === key && !rule.mixed) ?? null;
}

/** Whether `key` was taught two values: the resolver says so instead of choosing. */
export function isMixed(rules: readonly HouseholdRule[], kind: RuleKind, key: string | null): boolean {
  return Boolean(key) && rules.some((rule) => rule.kind === kind && rule.key === key && rule.mixed);
}
