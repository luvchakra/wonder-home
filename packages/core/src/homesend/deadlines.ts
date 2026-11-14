import { consequenceOf, type Consequence, type NeedsYouAnswer, type NeedsYouPrompt } from "../hometalk/needs-you";
import type { HomeSendFailureReason, HomeSendKind, HomeSendStatus } from "./items";

/**
 * "Nothing waits" (the owner, 2026-11-14; part A of
 * docs/design/2026-11-14-nothing-stuck-in-review.md): every item sent to
 * HomeSend ends as something — an entry, an update, a household note, or set
 * aside with a plain reason — and every question HomeSend asks has a default
 * that applies by itself after 24 hours (decision 4).
 *
 * Pure. Decides from what HomeSend already stored (the item's status, kind,
 * whether it was readable, how many times it was read again, its words) and
 * never from a model. `hometalk/needs-you-run.ts` reads, writes and audits.
 */

// --- 1. Not household information ------------------------------------------

/**
 * Signs that pasted text is a web page, an advert or a newsletter rather than
 * something about this household. Each is a whole pattern a household's own
 * message would rarely carry; two or more together are needed.
 */
const WEB_SIGNS: readonly RegExp[] = [
  /\b(accept|manage) (all )?cookies?\b|\bcookie (policy|settings|preferences)\b/i,
  /\bprivacy policy\b|\bterms (of (use|service)|and conditions|& conditions)\b/i,
  /\bunsubscribe\b|\bview (this email )?in (your )?browser\b|\bmanage (your )?(email )?preferences\b/i,
  /\ball rights reserved\b|©\s?\d{4}/i,
  /\b(sponsored|advertisement|promoted)\b|\b(shop now|buy now|limited[- ]time offer|use (promo )?code|\d{1,2}% off)\b/i,
  /\b(sign in|log in|sign up|create (an )?account)\b.*\b(home|about( us)?|contact( us)?|blog|careers)\b/i,
  /\b(home|about( us)?|contact( us)?|blog|careers|faq)\s*[|•·]\s*(home|about( us)?|contact( us)?|blog|careers|faq)\b/i,
  /\b(subscribe to (our|the) newsletter|follow us on|share (this|on) (facebook|twitter|x|whatsapp|linkedin))\b/i,
  /<\/?(div|span|script|style|nav|footer|header|a|p)\b[^>]*>/i,
  /\bread more\b[\s\S]*\bread more\b/i,
];

/** How many links make a paste look like a page rather than a message. */
const MANY_LINKS = 4;

/**
 * Whether what was sent is plainly not household information: two or more
 * web signs, or many links with one sign. Only asked of an item HomeSend
 * could not read or could not tell what it is: a reading that found a bill,
 * a school notice or anything else is never set aside here, whatever its
 * footer says (a school newsletter with "unsubscribe" in it stays).
 */
export function notHouseholdInformation(text: string | null | undefined): boolean {
  if (!text || text.trim().length === 0) return false;
  const sample = text.slice(0, 20_000);
  const signs = WEB_SIGNS.filter((pattern) => pattern.test(sample)).length;
  const links = (sample.match(/https?:\/\/\S+/gi) ?? []).length;
  return signs >= 2 || (links >= MANY_LINKS && signs >= 1);
}

// --- 2. What each waiting or failed item becomes ---------------------------

/** What HomeSend knows about an item still waiting or failed. */
export type EndingInput = {
  status: HomeSendStatus;
  kind: HomeSendKind | null;
  /** False when nothing could be read; null when not known. */
  readable: boolean | null;
  failureReason: HomeSendFailureReason | null;
  rawText: string | null;
  /** Times it was read again (by a person or by this step). */
  retryCount: number;
  retryRequestedAt: string | null;
  /** Its own words or file still kept, so a second read is possible. */
  canReadAgain: boolean;
  /** Sent by a household member (who can be asked to send it again). */
  senderMemberId: string | null;
  /** An open or already closed question about it, by source. */
  asked: ReadonlySet<string>;
  /** Minutes since it last changed: a read-again gets an hour to finish before the sender is asked. */
  minutesSinceTouched: number;
};

/** How long a read-again has before the sender is asked to send it again. */
export const READ_AGAIN_GRACE_MINUTES = 60;

export type Ending =
  /** Set aside now, with its reason. */
  | { action: "set_aside"; reason: "not_household" | "unreadable" }
  /** Kept as a household note HomeTalk can find ("couldn't tell what it is"). */
  | { action: "note" }
  /** Read once more, another way (the job queue's read-again). */
  | { action: "read_again" }
  /** Ask the sender once to send it again; set aside if nobody does in 24 hours. */
  | { action: "ask_resend" }
  /** Ask its one question, with a default. */
  | { action: "ask" }
  /** Nothing to do yet (a read-again is queued, or its question is open). */
  | { action: "wait" };

/** Kinds part B records as Checking (decision 2); part A asks nothing about them while they wait. */
const WAITS_FOR_RECORD_FIRST: ReadonlySet<HomeSendKind> = new Set(["bill", "receipt", "health_document"]);

/** Failures a second read can help, as `waiting.ts` `retryState` knows them. */
const READ_AGAIN: ReadonlySet<HomeSendFailureReason> = new Set(["link_unreachable", "transcription_failed", "transcription_unavailable", "unreadable"]);

/**
 * What a waiting or failed item becomes. In order:
 *
 *   1. Not household information (a pasted page, an ad, a newsletter) that
 *      HomeSend couldn't read or place: set aside now, with that reason.
 *   2. Couldn't be read: read again once, another way; then the sender is
 *      asked once to send it again ("homesend_resend", default: set aside
 *      after 24 hours); with nobody to ask (an email), set aside.
 *   3. Read, but HomeSend couldn't tell what it is: kept as a household note.
 *   4. Anything else waiting on a person: its one question
 *      ("homesend_waiting"), default after 24 hours. A bill, receipt or
 *      health document is left to part B, which records it as Checking
 *      (decision 2) rather than ever defaulting it into a note.
 */
export function endingFor(item: EndingInput): Ending {
  if (item.status !== "received" && item.status !== "classified" && item.status !== "failed") return { action: "wait" };
  const unreadable = item.status === "failed" ? item.failureReason !== null && READ_AGAIN.has(item.failureReason) : item.readable === false;
  const unplaced = unreadable || !item.kind || item.kind === "unknown";
  if (unplaced && notHouseholdInformation(item.rawText)) return { action: "set_aside", reason: "not_household" };

  if (item.status === "failed") {
    // A failure a second read can't help (refused by the safety check, a file type not read, too large, a private link): nothing to ask.
    if (!unreadable) return { action: "set_aside", reason: "unreadable" };
    return afterReadAgain(item);
  }
  if (item.readable === false) return afterReadAgain(item);
  if (!item.kind || item.kind === "unknown") return { action: "note" };
  // A bill, receipt or health document waiting on the Admin's switch is never made a note by default (it
  // would lose its reminder): decision 2 (part B, "Record first") records it as Checking instead.
  if (WAITS_FOR_RECORD_FIRST.has(item.kind)) return { action: "wait" };
  if (item.asked.has("homesend_waiting")) return { action: "wait" };
  return { action: "ask" };
}

/** Read once more another way; after that (and an hour for it to run), ask the sender once, or set it aside. */
function afterReadAgain(item: EndingInput): Ending {
  if (item.retryRequestedAt) return { action: "wait" };
  if (item.retryCount === 0 && item.canReadAgain) return { action: "read_again" };
  if (item.retryCount > 0 && item.minutesSinceTouched < READ_AGAIN_GRACE_MINUTES) return { action: "wait" };
  if (item.asked.has("homesend_resend")) return { action: "wait" };
  return item.senderMemberId ? { action: "ask_resend" } : { action: "set_aside", reason: "unreadable" };
}

// --- 3. The questions and their defaults -----------------------------------

export type HomeSendQuestion = {
  source: "homesend_check" | "homesend_waiting" | "homesend_resend";
  prompt: NeedsYouPrompt;
  answers: NeedsYouAnswer[];
  defaultAnswer: string;
  consequence: Consequence;
  dueOn: string | null;
};

const MONEY_OR_HEALTH: ReadonlySet<string> = new Set(["bill", "receipt", "purchase", "health_document"]);

/**
 * A Checking entry's question: "Looks right?" (decision 3 keeps its reminders
 * on meanwhile). If nobody answers in 24 hours, the default is to keep it as
 * read: it becomes confirmed. Money and health are the exception: they stay
 * Checking with their stated reason ("check before paying" on every money
 * reminder; a health record is a person's own to confirm), and only the
 * question closes. Nothing is paid, ever.
 */
export function checkQuestion(input: { kind: string; title: string | null; dueOn: string | null; today: string }): HomeSendQuestion {
  const careful = MONEY_OR_HEALTH.has(input.kind);
  return {
    source: "homesend_check",
    prompt: { code: careful ? "homesend.check.careful" : "homesend.check", title: input.title, kind: input.kind },
    answers: [{ value: "looks_right" }, { value: "not_right" }],
    defaultAnswer: careful ? "keep_checking" : "looks_right",
    consequence: consequenceOf(input.kind, input.dueOn, input.today),
    dueOn: input.dueOn,
  };
}

/**
 * A waiting item's one question. The default keeps it as a household note
 * (findable by asking HomeTalk, restorable) — never an add a person didn't
 * see, since the reading still lacks something; a possible duplicate's
 * default keeps what is already on record.
 */
export function waitingQuestion(input: { kind: HomeSendKind | null; title: string | null; dueOn: string | null; today: string; duplicate: boolean }): HomeSendQuestion {
  return {
    source: "homesend_waiting",
    prompt: { code: input.duplicate ? "homesend.waiting.duplicate" : "homesend.waiting", title: input.title, kind: input.kind },
    answers: input.duplicate ? [{ value: "keep_existing" }, { value: "note" }] : [{ value: "note" }, { value: "set_aside" }],
    defaultAnswer: input.duplicate ? "keep_existing" : "note",
    consequence: consequenceOf(input.kind, input.dueOn, input.today),
    dueOn: input.dueOn,
  };
}

/** "Couldn't read what you sent — send it again?" Asked once, of the sender; the default sets it aside. */
export function resendQuestion(input: { title: string | null }): HomeSendQuestion {
  return {
    source: "homesend_resend",
    prompt: { code: "homesend.resend", title: input.title },
    answers: [{ value: "set_aside" }, { value: "note" }],
    defaultAnswer: "set_aside",
    consequence: 0,
    dueOn: null,
  };
}

/** What an answer (or a default) does to a HomeSend item or entry. */
export type HomeSendAnswerEffect =
  | { effect: "confirm" }
  | { effect: "keep_checking" }
  | { effect: "undo" }
  | { effect: "archive"; reason: "kept_as_note" | "removed_by_person" | "already_recorded" | "not_resent" }
  | { effect: "none" };

/**
 * The one table of what each answer does, shared by a person's tap and the
 * default. `byDefault` changes only the resend case: a person's "set aside" is
 * their own removal, the default's is "not sent again".
 */
export function effectOf(source: string, answer: string, byDefault: boolean): HomeSendAnswerEffect {
  if (source === "homesend_check") {
    if (answer === "looks_right") return { effect: "confirm" };
    if (answer === "keep_checking") return { effect: "keep_checking" };
    if (answer === "not_right") return { effect: "undo" };
    return { effect: "none" };
  }
  if (source === "homesend_waiting" || source === "homesend_resend") {
    if (answer === "note") return { effect: "archive", reason: "kept_as_note" };
    if (answer === "keep_existing") return { effect: "archive", reason: "already_recorded" };
    if (answer === "set_aside") return { effect: "archive", reason: byDefault && source === "homesend_resend" ? "not_resent" : "removed_by_person" };
    return { effect: "none" };
  }
  return { effect: "none" };
}
