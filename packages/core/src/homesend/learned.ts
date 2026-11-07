import type { HouseholdContextItem } from "../context/types";
import type { HomeSendKind } from "./items";
import type { IntakePerson, SubjectResolution } from "./resolve";

/**
 * What HomeSend has learned, and how it fills "who is this for" without a
 * question (story 14-066, the owner 2026-11-07: "least input from user
 * should be expected"). Pure: the rows come from `learned-repository.ts`.
 *
 * Only ever a gap-filler for the one question a person would otherwise be
 * asked — "Who is this for — Asmi or Manan?". It never overrides a name the
 * content used, never picks somebody outside the candidates the household's
 * own records allow (a school item is for a child of THIS household), never
 * touches an amount, a category of money or an approval, and a person the
 * household no longer has is simply not chosen. Every pick says why
 * (`basis`), from evidence, for "Why?".
 *
 * In order, the first that settles it:
 * 1. **school** — the content names the school one candidate child has on
 *    record ("Greenwood High" → Anya). Evidence in the words.
 * 2. **learned** — this sender's items were for that child before: a person
 *    answered or picked it. A sender whose items went to two different
 *    children is `mixed` and settles nothing. Senders are outside addresses (an email's From,
 *    a school class channel's sender), never a household member themselves.
 * 3. **only_at_school** — a school notice, and exactly one candidate child has
 *    a school on record.
 */

export const LEARNED_KINDS = ["sender_child"] as const;
export type LearnedKind = (typeof LEARNED_KINDS)[number];

export type LearnedDefault = {
  id: string;
  kind: LearnedKind;
  /** Normalized: `sender:<lower-cased address or name>`. */
  key: string;
  valueMemberId: string;
  learnedByMemberId: string | null;
  learnedFromItemId: string | null;
  learnedAt: string;
  /** This sender's items were for two different children: it settles nothing, and HomeSend asks. */
  mixed: boolean;
};

export type InferenceBasis = "school" | "learned" | "only_at_school";

export type InferredSubject = SubjectResolution & { basis?: InferenceBasis };

/** Kinds whose "who is this for" may be filled from what HomeSend learned. Only a child's things: health stays asked. */
const INFERABLE: ReadonlySet<HomeSendKind> = new Set(["school_item", "activity_item"]);

const MAX_KEY = 320;

/** The sender key for an item: who sent it from outside the household, or null when there is no such sender. */
export function senderKey(sender: string | null | undefined): string | null {
  if (typeof sender !== "string") return null;
  // "Greenwood High <notices@greenwood.edu>" → the address; else the name as written.
  const address = /<([^<>\s@]+@[^<>\s@]+)>/.exec(sender)?.[1] ?? (/^[^\s@<>]+@[^\s@<>]+$/.test(sender.trim()) ? sender.trim() : null);
  const value = (address ?? sender).trim().toLowerCase().replace(/\s+/g, " ");
  if (value.length < 2 || value.length > MAX_KEY - 7) return null;
  return `sender:${value}`;
}

function schoolsOf(item: HouseholdContextItem): string[] {
  const names = item.attributes.schoolNames;
  return Array.isArray(names) ? names.filter((name): name is string => typeof name === "string" && name.trim().length >= 3).map((name) => name.trim()) : [];
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whether `text` names `school` as whole words, ignoring case ("greenwood high school" names "Greenwood High"). */
export function namesSchool(text: string, school: string): boolean {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escape(school.toLowerCase())}($|[^\\p{L}\\p{N}])`, "u").test(text.toLowerCase());
}

/**
 * Fills who an item is for when the household would otherwise be asked.
 * Returns the subject unchanged unless it was an open question between
 * candidates and exactly one of them is settled by evidence.
 */
export function inferSubject(
  kind: HomeSendKind,
  subject: SubjectResolution,
  context: {
    items: readonly HouseholdContextItem[];
    learned: readonly LearnedDefault[];
    sender: string | null | undefined;
    /** The words the item came with (title, summary, source text), to find a school named in them. */
    text: string;
  },
): InferredSubject {
  if (!INFERABLE.has(kind) || subject.selected || subject.unknown) return subject;
  // A name the content used that two people fit stays a question only the household can answer.
  if (subject.said !== null) return subject;
  if (subject.candidates.length < 2) return subject;
  const byId = new Map(context.items.filter((item) => item.entityType === "member").map((item) => [item.entityId, item]));
  const candidates = subject.candidates.filter((person) => person.memberType === "child" && byId.has(person.memberId));
  const pick = (person: IntakePerson, basis: InferenceBasis): InferredSubject => ({ said: null, selected: person, candidates: subject.candidates, question: null, basis });

  const text = context.text ?? "";
  const bySchool = candidates.filter((person) => {
    return schoolsOf(byId.get(person.memberId)!).some((school) => namesSchool(text, school));
  });
  // Two children at the same school: the school settles nothing.
  if (bySchool.length === 1) return pick(bySchool[0]!, "school");

  const key = senderKey(context.sender);
  if (key) {
    const learned = context.learned.find((row) => row.kind === "sender_child" && row.key === key && !row.mixed);
    const person = learned ? candidates.find((candidate) => candidate.memberId === learned.valueMemberId) : undefined;
    if (person) return pick(person, "learned");
  }

  if (kind === "school_item") {
    const atSchool = candidates.filter((person) => schoolsOf(byId.get(person.memberId)!).length > 0);
    if (atSchool.length === 1) return pick(atSchool[0]!, "only_at_school");
  }
  return subject;
}

/**
 * What to remember after a person said who an item is for: the sender's key
 * and the child, or null when there is nothing safe to learn (no outside
 * sender, not a child's kind, or the person isn't a child).
 */
export function learnable(
  kind: HomeSendKind | null,
  sender: string | null | undefined,
  person: { memberId: string; memberType?: string | null },
): { kind: LearnedKind; key: string; valueMemberId: string } | null {
  if (!kind || !INFERABLE.has(kind)) return null;
  if (person.memberType && person.memberType !== "child") return null;
  const key = senderKey(sender);
  return key ? { kind: "sender_child", key, valueMemberId: person.memberId } : null;
}

/** A learned key as a person reads it: "notices@greenwood.edu". */
export function keyLabel(key: string): string {
  return key.replace(/^sender:/, "");
}
