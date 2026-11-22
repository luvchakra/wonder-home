import { consequenceOf, type Consequence, type NeedsYouAnswer, type NeedsYouPrompt } from "../hometalk/needs-you";
import type { HomeSendFailureReason, HomeSendKind, HomeSendStatus } from "./items";
import { notHouseholdInformation } from "../homebrain/intake-api";

/** An open "Which class is <child> in?" question about the item (`timetable-apply.ts`, source `homesend_class`). */
export const CLASS_OPEN = "homesend_class:open";

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
  /**
   * What it matched on record, for a bill, receipt or health document
   * (`reconcile.ts`): newer details for it ("update"), word it is called off
   * ("cancellation"), or the same one again ("duplicate"). Absent or null:
   * nothing on record, or not looked.
   */
  match?: "update" | "cancellation" | "duplicate" | null;
  /**
   * A bill the household records directly (its "Money and health entries"
   * setting isn't "Wait for review"), with what it can't be added without.
   */
  recordable?: boolean;
  /** A bill, receipt or health document "Add this bill?" can add with what is known (`add-default.ts` `canAdd`). */
  addable?: boolean;
  /**
   * A health document from a sender on "Who may file health records for
   * others" that names one other household member (`health-filers.ts`
   * `healthFiledFor`, the owner 2026-11-20): filed for them now, as Checking.
   */
  filedFor?: string | null;
  /**
   * Whose a waiting health document is, from its own words, for a sender not
   * on that list (`health-filers.ts` `healthSubjectFor`): only "sender" is
   * added on its own; "other" or "unclear" (or not known) asks the sender
   * "Who is this for?" and is never filed for anyone by default.
   */
  healthSubject?: "sender" | "other" | "unclear";
  /**
   * An Admin set this kind's area (money, or health) to "Wait for review": then
   * "Add this bill?" is asked. Otherwise it is added at once (2026-11-20).
   * Absent: not known, so the careful answer, asking, applies.
   */
  waitForReview?: boolean;
  /** The match on record has a second candidate (two bills): asked, never applied at once. */
  ambiguous?: boolean;
  /** A document with several records, in a household that records money directly: each added as Checking at once. */
  severalNow?: boolean;
  /**
   * The sender is in HomeTalk right now (a turn in the last few minutes):
   * only then is "send it again" asked; anyone else's unreadable item is set
   * aside with its reason (the owner, 2026-11-20 review).
   */
  senderActive?: boolean;
};

/** How long a read-again has before the sender is asked to send it again. */
export const READ_AGAIN_GRACE_MINUTES = 60;

export type Ending =
  /** Set aside now, with its reason. */
  | { action: "set_aside"; reason: "not_household" | "unreadable" | "health_not_claimed" }
  /** Kept as a household note HomeTalk can find ("couldn't tell what it is"). */
  | { action: "note" }
  /** Read once more, another way (the job queue's read-again). */
  | { action: "read_again" }
  /** Ask the sender once to send it again; only while they are in HomeTalk (2026-11-20 review), set aside if nobody does in 24 hours. */
  | { action: "ask_resend" }
  /** Set aside as "already on record": the same one again (2026-11-20: no longer asked). */
  | { action: "already_recorded" }
  /** Recorded now as Checking, as record first would have (a bill sent before 14 Nov that matches nothing). */
  | { action: "record" }
  /** Added now as Checking with what is known (`add-default.ts`), as "Add this bill?"'s default would have a day later. */
  | { action: "add" }
  /** "Add this bill?" (the owner, 2026-11-20: "record"), only under the Admin's "Wait for review": default Add after 24 h. */
  | { action: "ask_add" }
  /** "Who is this for?" to its sender only: a health document that isn't clearly theirs (default: set aside, never filed). */
  | { action: "ask_health_for" }
  /** Filed now for the member it names, marked Checking, with no question (an allowed sender's health document, the owner 2026-11-20). */
  | { action: "file_for"; memberId: string }
  /** "Update the existing bill?" (the owner, 2026-11-20): default Update, marked Checking; a cancellation's default keeps the record Checking. */
  | { action: "ask_update"; cancel: boolean }
  /** One clear bill on record with a newer amount or date: updated now, marked Checking, with Undo (2026-11-20 review). */
  | { action: "update_now" }
  /** A document with several bills, where money is recorded directly: each added now as Checking (2026-11-20 review). */
  | { action: "add_now" }
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
 *      asked to send it again only if they are in HomeTalk right now
 *      ("homesend_resend"); otherwise set aside with that reason, in the
 *      daily summary with Restore.
 *   3. Read, but HomeSend couldn't tell what it is: kept as a household note.
 *   4. Anything else waiting: kept as a household note now. A bill, receipt
 *      or health document is never made a note: it is recorded as Checking
 *      (decision 2), updated, or set aside as already on record.
 *
 * Since 2026-11-20 (the owner: "as autonomous as possible, with minimum inputs
 * required from the users"; 8 of the 9 questions asked since 14 Nov went
 * unanswered) the waiting item's question is gone: it did only what its
 * default did, a day later. What still asks: "send it again?" to a sender in
 * HomeTalk right now, "Update the existing bill?" for an ambiguous match or a
 * cancellation, and "Add this bill?" when an Admin chose "Wait for review".
 */
export function endingFor(item: EndingInput): Ending {
  if (item.status !== "received" && item.status !== "classified" && item.status !== "failed") return { action: "wait" };
  // Kept for want of a model (2026-11-21): no deadline starts and nothing is asked; the retry reads it (`model-unavailable.ts`).
  if (item.status === "failed" && (item.failureReason === "model_unavailable" || item.failureReason === "output_rejected")) return { action: "wait" };
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
  // A timetable waiting on "Which class is <child> in?" is not filed as a note under the question (21 Nov): the answer
  // adds that child's exam days; "Keep it as a note", or the question's default, ends it on a later pass.
  if (item.asked.has(CLASS_OPEN)) return { action: "wait" };
  // A bill, receipt or health document waiting on the Admin's switch is never made a note by default (it
  // would lose its reminder): decision 2 (part B, "Record first") records it as Checking instead.
  if (WAITS_FOR_RECORD_FIRST.has(item.kind)) {
    // Record first never adds one that matches a record already on file, so it is asked about here
    // (the owner, 2026-11-20: "update"): a newer amount or date updates the record, marked Checking.
    if (item.match === "update" || item.match === "cancellation") {
      if (item.asked.has(UPDATE_SOURCE)) return { action: "wait" };
      // A newer amount or date for one clear bill is applied now (the 2026-11-20 review); a cancellation never cancels, and two candidates are asked.
      if (item.match === "update" && item.kind === "bill" && item.ambiguous !== true) return { action: "update_now" };
      return { action: "ask_update", cancel: item.match === "cancellation" };
    }
    // The same one again: what is on record is kept, and this copy set aside as "already on record" (Restore brings it back).
    if (item.match === "duplicate") return { action: "already_recorded" };
    // Nothing on record and the household records bills directly: what record first would have done (decision 2).
    if (item.kind === "bill" && item.recordable === true && item.match === null) return { action: "record" };
    // Nothing on record, but not recorded on its own (a detail missing, several records): added now as
    // Checking with what is known. Only under the Admin's "Wait for review" is "Add this bill?" asked.
    // An allowed sender's health document naming another member: filed for them, never asked (the owner, 2026-11-20).
    if (item.kind === "health_document" && item.match === null && item.addable === true && item.filedFor) return { action: "file_for", memberId: item.filedFor };
    // Anyone else's health document is added on its own only when its own words say it is the sender's: one
    // naming someone else, or nobody, asks its sender "Who is this for?" and is never filed by default (2026-11-20).
    if (item.kind === "health_document" && item.match === null && item.addable === true && item.healthSubject !== "sender") {
      if (item.asked.has(HEALTH_FOR_SOURCE)) return { action: "wait" };
      return item.senderMemberId ? { action: "ask_health_for" } : { action: "set_aside", reason: "health_not_claimed" };
    }
    if (item.match === null && item.addable === true) {
      if (item.asked.has(ADD_SOURCE)) return { action: "wait" };
      // Several records, money recorded directly: each added now, as one would be (the 2026-11-20 review).
      if (item.severalNow === true) return { action: "add_now" };
      // Not under the Admin's "Wait for review": added now as Checking with what is known (2026-11-20, part 3).
      return item.waitForReview === false ? { action: "add" } : { action: "ask_add" };
    }
    return { action: "wait" };
  }
  return { action: "note" };
}

/** Read once more another way; after that (and an hour for it to run), ask a sender who is in HomeTalk now, or set it aside. */
function afterReadAgain(item: EndingInput): Ending {
  if (item.retryRequestedAt) return { action: "wait" };
  if (item.retryCount === 0 && item.canReadAgain) return { action: "read_again" };
  if (item.retryCount > 0 && item.minutesSinceTouched < READ_AGAIN_GRACE_MINUTES) return { action: "wait" };
  if (item.asked.has("homesend_resend")) return { action: "wait" };
  // Asked only of a sender in HomeTalk right now: asking someone who isn't there is a 48-hour delay with no gain.
  return item.senderMemberId && item.senderActive === true ? { action: "ask_resend" } : { action: "set_aside", reason: "unreadable" };
}

// --- 3. The questions and their defaults -----------------------------------

/** The source of "Update the existing bill?" questions. */
export const UPDATE_SOURCE = "homesend_update";
/** The source of "Who is this for?" about a waiting health document that isn't clearly its sender's (2026-11-20). */
export const HEALTH_FOR_SOURCE = "homesend_health_for";
/** The source of "Add this bill?" questions. */
export const ADD_SOURCE = "homesend_add";
/** The source of the one question kept about a Checking entry: a money amount read with doubt (2026-11-20). */
export const AMOUNT_SOURCE = "homesend_amount";
/**
 * Sources no longer asked (2026-11-20). Their open rows are withdrawn by the
 * deadlines step; "homesend_check" is asked again only when an Admin turned on
 * "Ask me to confirm entries still Checking". ("Send it again?" stays, asked
 * only of a sender in HomeTalk right now: the review's own rule.)
 */
export const RETIRED_SOURCES: readonly string[] = ["homesend_waiting"];

export type HomeSendQuestion = {
  source: "homesend_check" | "homesend_waiting" | "homesend_resend" | typeof UPDATE_SOURCE | typeof ADD_SOURCE | typeof AMOUNT_SOURCE | typeof HEALTH_FOR_SOURCE;
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
 * "Is ₹2,140 right?" — the one question kept by default about a Checking
 * entry (the owner, 2026-11-20): a bill's or receipt's amount read with doubt
 * (from a photo or a file, or not found in the words sent). Asked of its
 * sender only. A blank date is harmless; a wrong amount is not. Right confirms
 * the entry; the default after 24 hours keeps it Checking, its reminders
 * saying "check before paying". A wrong amount is corrected by saying it
 * ("No, it's 2,410"), which fixes the entry in place.
 */
export function amountQuestion(input: { kind: string; title: string | null; amount: string | null; dueOn: string | null; today: string }): HomeSendQuestion {
  return {
    source: AMOUNT_SOURCE,
    prompt: { code: "homesend.amount", title: input.amount ? `${input.title ?? ""}${input.title ? " · " : ""}${input.amount}` : input.title, kind: input.kind, field: "amount" },
    answers: [{ value: "looks_right" }, { value: "keep_checking" }],
    defaultAnswer: "keep_checking",
    consequence: consequenceOf(input.kind, input.dueOn, input.today),
    dueOn: input.dueOn,
  };
}

/**
 * A waiting item's one question (no longer asked since 2026-11-20: open rows
 * are withdrawn; kept so a row asked earlier still reads). The default keeps it as a household note
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

/**
 * "Update the existing bill?" — a bill, receipt or health document whose
 * reading matches one already on record with a newer amount or date (the
 * owner, 2026-11-20: "update"). Update applies the new amount or date through
 * the governed update a person's "Update" uses, with Undo; Keep as is sets the
 * new copy aside as "already on record". If nobody answers in 24 hours it is
 * updated and marked Checking ("check before paying"), its reminders on.
 *
 * A cancellation is offered as Cancel it / Keep as is, but its default never
 * cancels: the record is kept, marked Checking, with a note that a message
 * said it was called off. Nothing is ever paid or deleted.
 */
export function updateQuestion(input: { kind: HomeSendKind | null; title: string | null; dueOn: string | null; today: string; cancel: boolean }): HomeSendQuestion {
  return {
    source: UPDATE_SOURCE,
    prompt: { code: input.cancel ? "homesend.update.cancel" : "homesend.update", title: input.title, kind: input.kind },
    answers: input.cancel ? [{ value: "cancel_it" }, { value: "keep_as_is" }] : [{ value: "update" }, { value: "keep_as_is" }],
    defaultAnswer: input.cancel ? "keep_checking" : "update",
    consequence: consequenceOf(input.kind, input.dueOn, input.today),
    dueOn: input.dueOn,
  };
}

/**
 * "Add this bill?" (or receipt, or health document): something record first
 * could not add on its own. Add records it with what is known, marked
 * Checking, its money reminders saying "check before paying"; Set aside
 * archives it, restorable. If nobody answers in 24 hours it is added (the
 * owner, 2026-11-20: "record"). Nothing is paid.
 */
export function addQuestion(input: { kind: HomeSendKind | null; title: string | null; dueOn: string | null; today: string }): HomeSendQuestion {
  const code = input.kind === "receipt" ? "homesend.add.receipt" : input.kind === "health_document" ? "homesend.add.health" : "homesend.add";
  return {
    source: ADD_SOURCE,
    prompt: { code, title: input.title, kind: input.kind },
    answers: [{ value: "add" }, { value: "set_aside" }],
    defaultAnswer: "add",
    consequence: consequenceOf(input.kind, input.dueOn, input.today),
    dueOn: input.dueOn,
  };
}

/**
 * "Who is this for?" — a waiting health document whose own words don't say
 * it is its sender's (it names someone else, or nobody), from a sender not on
 * "Who may file health records for others". Asked of the sender only (the
 * item is private to them). "It's mine" files it privately for them, marked
 * Checking; Set aside archives it, restorable. If nobody answers in 24 hours
 * it is set aside ("nobody said who it's for"): a default never fills who a
 * health document is for, and nothing about it reaches anyone else.
 */
export function healthForQuestion(input: { title: string | null; dueOn: string | null; today: string }): HomeSendQuestion {
  return {
    source: HEALTH_FOR_SOURCE,
    prompt: { code: "homesend.health_for", title: input.title, kind: "health_document" },
    answers: [{ value: "for_me" }, { value: "set_aside" }],
    defaultAnswer: "set_aside",
    consequence: consequenceOf("health_document", input.dueOn, input.today),
    dueOn: input.dueOn,
  };
}

/** "Couldn't read what you sent — send it again?" No longer asked since 2026-11-20; kept so an older row still reads. */
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
  | { effect: "archive"; reason: "kept_as_note" | "removed_by_person" | "already_recorded" | "not_resent" | "health_not_claimed" }
  /**
   * A matched record changed through its governed service: "update" (the new
   * amount or date), "cancel" (a person's tap only), or "flag" (kept as it is,
   * marked Checking with a note: a cancellation's default). `checking`: the
   * record is marked Checking ("not yet confirmed") — always for a default.
   */
  | { effect: "revise"; mode: "update" | "cancel" | "flag"; checking: boolean }
  /** Added with what is known, marked Checking (`add-default.ts`); `forSender`: a health document its sender said is theirs. */
  | { effect: "add"; forSender?: boolean }
  | { effect: "none" };

/**
 * The one table of what each answer does, shared by a person's tap and the
 * default. `byDefault` changes only the resend case: a person's "set aside" is
 * their own removal, the default's is "not sent again".
 */
export function effectOf(source: string, answer: string, byDefault: boolean): HomeSendAnswerEffect {
  if (source === "homesend_check" || source === AMOUNT_SOURCE) {
    if (answer === "looks_right") return { effect: "confirm" };
    if (answer === "keep_checking") return { effect: "keep_checking" };
    if (answer === "not_right") return { effect: "undo" };
    return { effect: "none" };
  }
  if (source === ADD_SOURCE) {
    if (answer === "add") return { effect: "add" };
    if (answer === "set_aside") return { effect: "archive", reason: "removed_by_person" };
    return { effect: "none" };
  }
  if (source === HEALTH_FOR_SOURCE) {
    // Only the sender's own tap files it, for them; the default sets it aside, never filed for anyone.
    if (answer === "for_me") return byDefault ? { effect: "none" } : { effect: "add", forSender: true };
    if (answer === "set_aside") return { effect: "archive", reason: byDefault ? "health_not_claimed" : "removed_by_person" };
    return { effect: "none" };
  }
  if (source === UPDATE_SOURCE) {
    // A person's Update is theirs and confirmed; the default's is marked Checking.
    if (answer === "update") return { effect: "revise", mode: "update", checking: byDefault };
    // A default never cancels or deletes: only a person's own tap does.
    if (answer === "cancel_it") return byDefault ? { effect: "revise", mode: "flag", checking: true } : { effect: "revise", mode: "cancel", checking: false };
    if (answer === "keep_checking") return { effect: "revise", mode: "flag", checking: true };
    if (answer === "keep_as_is") return { effect: "archive", reason: "already_recorded" };
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
