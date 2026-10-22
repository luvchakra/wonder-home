import { AMAF_FACTS, factByKey, type AmafOutcome, type AmafPerson, type AmafSnapshot, type AmafSubject, type AmafValue, type StoredValue } from "./facts";
import { isSkipQuestion, isStop, readYesNo } from "./parse";
import { subjectFor } from "./plan";

/**
 * One turn of Ask me about family, decided by rules (no model is asked).
 *
 * What HomeTalk is waiting for lives on its own last message (`AmafPending`),
 * exactly as the welcome's question does: the question it asked, the part of
 * it a follow-up is after, or a change it asked the person to confirm. This
 * module reads the answer against that and says what happens — write a
 * value, ask for the missing part, say what is on record and ask which is
 * right, keep the words as a note, move on, or stop. The server carries it
 * out through each module's own service and writes the reply.
 */

export type AmafPending =
  | {
      step: "ask";
      fact: string;
      subjectId: string | null;
      /** A check on something already on record, asked openly. */
      refresh: boolean;
      /** The part a follow-up asked for, or null for the question itself. */
      slot: string | null;
      partial: Record<string, unknown>;
      /** How many times this question was not understood. */
      tries: number;
    }
  | {
      step: "confirm_change";
      fact: string;
      subjectId: string | null;
      value: AmafValue;
      /** What is on record, as said back. */
      stored: string;
    };

export type AmafStep =
  /**
   * Write this value through its module, then say so. `aside`: the answer was
   * about someone or something else than the waiting question, which is then
   * asked again.
   */
  | { kind: "write"; fact: string; subject: AmafSubject; value: AmafValue; outcome: "saved" | "changed" | "noted"; previous: unknown; aside?: boolean }
  /** The answer agrees with what is on record. */
  | { kind: "confirmed"; fact: string; subject: AmafSubject; stored: StoredValue; aside?: boolean }
  /** The answer disagrees with what is on record: say both and where the record came from, and ask. */
  | { kind: "conflict"; fact: string; subject: AmafSubject; value: AmafValue; stored: StoredValue }
  /** "No" or "nobody" when something is on record: what is on record is said back, with its source, and left alone. */
  | { kind: "said_back"; fact: string; subject: AmafSubject; stored: StoredValue }
  /** The person kept what is on record. */
  | { kind: "kept"; fact: string; subject: AmafSubject }
  /** Ask for the part that was missing. */
  | { kind: "follow_up"; pending: Extract<AmafPending, { step: "ask" }>; subject: AmafSubject }
  /** Not understood: ask once more, more simply. */
  | { kind: "retry"; pending: Extract<AmafPending, { step: "ask" }>; subject: AmafSubject }
  /** An answer with nothing to write ("no", "I don't know", "skip"). */
  | { kind: "recorded"; fact: string; subject: AmafSubject; outcome: Extract<AmafOutcome, "none" | "dont_know" | "skipped"> }
  | { kind: "stop" }
  /** The question no longer applies (its record changed meanwhile): move on. */
  | { kind: "gone" };

/** The line under an AMAF question: which part of the app it fills, how many questions are left. */
export type AmafMark = { section: string; href: string; left: number };

/** The mark on a message, while its question is still waiting — the screen's mode line reads this. */
export function amafMarkFrom(metadata: Record<string, unknown> | null | undefined): AmafMark | null {
  const amaf = metadata?.amaf as { pending?: unknown; mark?: AmafMark | null } | undefined;
  const mark = amaf?.pending ? amaf.mark : null;
  return mark && typeof mark.section === "string" && typeof mark.href === "string" && mark.href.startsWith("/") ? { section: mark.section, href: mark.href, left: Number(mark.left) || 0 } : null;
}

/** "Ask me about my family", "AMAF", "interview me", "ask me questions about us". */
export function isAmafStart(utterance: string): boolean {
  const said = utterance.trim().toLowerCase().replace(/[.!?]+$/, "");
  return (
    /^(?:start |begin |let'?s (?:do |start )?)?(?:amaf|a\.m\.a\.f\.?|ask me about (?:my |the |our )?(?:family|household|home))(?: mode)?$/.test(said) ||
    /^(?:please )?(?:ask|interview|quiz) (?:me|us)(?: some)? (?:questions? )?(?:about|on) (?:my|the|our) (?:family|household|home)$/.test(said) ||
    /^(?:get to know|learn about) (?:my|our|the) (?:family|household)(?: better)?$/.test(said) ||
    /^(?:continue|resume|carry on(?: with)?) (?:amaf|asking(?: me)?(?: about (?:my |the |our )?family)?|ask me about (?:my |the |our )?family)$/.test(said)
  );
}

/** "Undo", "undo that", "take that back" — only the last answer AMAF wrote. */
export function isAmafUndo(utterance: string): boolean {
  return /^(?:undo(?: that| it| the last one)?|take (?:that|it) back|revert(?: that)?|that'?s wrong,? undo)[.!]*$/i.test(utterance.trim());
}

/** "Put it back", "redo", "undo the undo" — only the last answer AMAF took back. */
export function isAmafRedo(utterance: string): boolean {
  return /^(?:(?:please )?put (?:it|that) back|redo(?: that| it)?|undo (?:the|that) undo|bring (?:it|that) back|restore (?:it|that))[.!]*$/i.test(utterance.trim());
}

/** A household member the words name by their first name (or whole name), other than `except`. */
function namedPerson(answer: string, people: readonly AmafPerson[], except: string | null): AmafPerson | null {
  const said = ` ${answer.toLowerCase().replace(/[\u2018\u2019\u02bc]/g, "'").replace(/[^\p{L}\p{N}']+/gu, " ")} `;
  const named = people.filter((person) => {
    if (person.id === except) return false;
    const first = person.name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    return first.length >= 2 && (said.includes(` ${first} `) || said.includes(` ${first}'s `));
  });
  return named.length === 1 ? named[0]! : null;
}

/**
 * A sentence that states another fact about another person, while a question
 * waits (the owner, 2026-10-22: "Upasana birthday is 24 June 1986" while
 * Manan's school hours were asked was filed as a note on Manan's school hours,
 * and that note failed). Only a fact whose own words appear (`cue`) is tried,
 * only for the one person the sentence names, and only a real value counts —
 * never the person's words as a note.
 */
function readAside(answer: string, pending: AmafPending, snapshot: AmafSnapshot, people: readonly AmafPerson[]): AmafStep | null {
  for (const fact of AMAF_FACTS) {
    if (!fact.cue?.test(answer)) continue;
    const pendingSubject = fact.key === pending.fact ? pending.subjectId : null;
    const person = namedPerson(answer, people, pendingSubject);
    if (!person) continue;
    const subject = subjectFor(fact, snapshot, person.id);
    if (!subject) continue;
    const reading = fact.read(answer, { people, speakerId: snapshot.speaker.memberId, subject, partial: {}, slot: null, today: snapshot.today });
    if (reading.kind !== "value" || reading.value.fact === "note") continue;
    const stored = fact.stored(snapshot, subject);
    if (stored && fact.same) {
      if (fact.same(stored, reading.value)) return { kind: "confirmed", fact: fact.key, subject, stored, aside: true };
      // A different value on record is for that person's own question, not a side remark: left alone.
      continue;
    }
    return { kind: "write", fact: fact.key, subject, value: reading.value, outcome: stored && !fact.additive ? "changed" : "saved", previous: stored?.value ?? null, aside: true };
  }
  return null;
}

export function amafStep(input: { pending: AmafPending; answer: string; snapshot: AmafSnapshot; people: readonly AmafPerson[] }): AmafStep {
  const { pending, snapshot } = input;
  // A phone keyboard's curly apostrophe reads the same as a straight one.
  const answer = input.answer.replace(/[\u2018\u2019\u02bc]/g, "'");
  if (isStop(answer)) return { kind: "stop" };
  const fact = factByKey(pending.fact);
  if (!fact) return { kind: "gone" };
  const subject = subjectFor(fact, snapshot, pending.subjectId);
  if (!subject) return { kind: "gone" };

  if (pending.step === "confirm_change") {
    const yes = readYesNo(answer) ?? (/\b(?:change|update|use (?:the )?new|replace|correct it|go ahead)\b/i.test(answer) ? true : /\b(?:keep|leave|old one|as it is|don'?t change)\b/i.test(answer) ? false : null);
    if (yes) return { kind: "write", fact: fact.key, subject, value: pending.value, outcome: "changed", previous: fact.stored(snapshot, subject)?.value ?? null };
    return { kind: "kept", fact: fact.key, subject };
  }

  if (isSkipQuestion(answer)) return { kind: "recorded", fact: fact.key, subject, outcome: "skipped" };

  // A sentence about someone else ("Manan's birthday is…" while Upasana's was asked) is theirs, never this subject's.
  if (namedPerson(answer, input.people, subject.kind === "person" ? subject.id : null)) {
    const aside = readAside(answer, pending, snapshot, input.people);
    if (aside) return aside;
  }

  const reading = fact.read(answer, { people: input.people, speakerId: snapshot.speaker.memberId, subject, partial: pending.partial, slot: pending.slot, today: snapshot.today });
  const stored = fact.stored(snapshot, subject);

  switch (reading.kind) {
    case "dont_know":
      return { kind: "recorded", fact: fact.key, subject, outcome: "dont_know" };
    case "none":
      // "No" when something is on record is said back, never taken away by a question —
      // an allergy least of all. The record changes on its own screen.
      if (stored) return { kind: "said_back", fact: fact.key, subject, stored };
      return { kind: "recorded", fact: fact.key, subject, outcome: "none" };
    case "follow_up":
      return { kind: "follow_up", subject, pending: { step: "ask", fact: fact.key, subjectId: subject.id, refresh: pending.refresh, slot: reading.slot, partial: { ...pending.partial, ...reading.partial }, tries: 0 } };
    case "unclear": {
      // Not an answer to this question, but a fact about someone else: saved for them, and this question waits.
      const aside = readAside(answer, pending, snapshot, input.people);
      if (aside) return aside;
      // Words about someone else are never kept as a note on this question's subject: asked again instead.
      const elsewhere = namedPerson(answer, input.people, subject.kind === "person" ? subject.id : null) !== null;
      if (pending.tries < 1 || elsewhere) return { kind: "retry", subject, pending: { ...pending, tries: pending.tries + 1 } };
      // Asked twice and still not a value: the person's words are kept rather than lost.
      return { kind: "write", fact: fact.key, subject, value: { fact: "note", text: answer.trim().replace(/\s+/g, " ").slice(0, 280) }, outcome: "noted", previous: null };
    }
    case "value": {
      if (reading.value.fact === "note") return { kind: "write", fact: fact.key, subject, value: reading.value, outcome: "noted", previous: null };
      if (stored && fact.same) {
        return fact.same(stored, reading.value) ? { kind: "confirmed", fact: fact.key, subject, stored } : { kind: "conflict", fact: fact.key, subject, value: reading.value, stored };
      }
      // An additive fact (another allergy) adds to the record rather than replacing it.
      return { kind: "write", fact: fact.key, subject, value: reading.value, outcome: stored && !fact.additive ? "changed" : "saved", previous: stored?.value ?? null };
    }
  }
}
