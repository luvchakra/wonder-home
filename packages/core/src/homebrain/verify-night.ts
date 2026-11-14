import { senderKey } from "../homesend/learned";
import { kindOfDomain, type BarKind } from "./kind-bar";
import { normalizeWords, ruleFor, vendorKey, type HouseholdRule } from "./rules";

/**
 * HomeBrain's nightly check of what HomeSend added (Nothing stuck in review,
 * phase 3: "verify after, not before"). Pure: `verify-night-run.ts` reads the
 * rows and applies the plan inside the HomeBrain sleep job.
 *
 * For entries added in the last two days it looks for exactly four real
 * conflicts, each raised once into the household's "Needs you" list with a
 * default that applies itself if nobody answers:
 *   duplicate       the same thing recorded twice → default: keep both (a default never removes)
 *   date_clash      two things for the same person at the same day and time → default: keep both
 *   unusual_amount  a bill or receipt far from that payee's usual amount → default: keep it
 *   sender_mismatch a sender the household taught one person or kind sent something else → default: keep it
 *
 * And it confirms Checking entries the evidence supports, so nobody is asked:
 *   second_source   another thing sent separately says the same (title and day, or payee, amount and day)
 *   recurring       a bill or receipt matching that payee's pattern (amount within 25% of its usual,
 *                   due within 3 days of its usual day of the month), or a grocery the household has
 *                   added and kept at least twice before
 *
 * It never confirms a health document (a person does), never moves money,
 * never deletes, and never puts an amount or a health detail in a question.
 */

export type VerifyEntry = {
  changeId: string;
  itemId: string;
  kind: BarKind;
  /** Lower-cased title words, for matching. */
  title: string;
  /** Shown in a question: the household's own title. */
  label: string;
  date: string | null;
  time: string | null;
  amount: number | null;
  payee: string | null;
  sender: string | null;
  subjectMemberId: string | null;
  createdByMemberId: string | null;
  contentHash: string | null;
  unconfirmed: boolean;
  createdAt: string;
};

/** Something sent that is not itself a live entry (set aside, waiting, or undone): a second source. */
export type SourceItem = { itemId: string; kind: string | null; title: string; date: string | null; amount: number | null; payee: string | null; contentHash: string | null };

export const CONFLICT_REASONS = ["duplicate", "date_clash", "unusual_amount", "sender_mismatch"] as const;
export type ConflictReason = (typeof CONFLICT_REASONS)[number];

/** "keep" leaves it; "remove" undoes this entry through HomeSend's own Undo, only on a person's tap. */
export type ConflictAnswer = { id: "keep" | "remove"; label: string; action: "keep" | "undo_this" };

export type Conflict = {
  reason: ConflictReason;
  changeId: string;
  /** The HomeSend item behind the entry: what "Needs you" asks about and Undo reverses. */
  itemId: string;
  /** The entry's own title and kind, for the question's words and topic mark. */
  label: string;
  kind: BarKind;
  /** The entry's day, when it has one: an earlier day leads the list. */
  dueOn: string | null;
  /** The other entry, for a duplicate or a clash. */
  otherChangeId: string | null;
  /** Who is most likely to know: whoever sent it in, else nobody named (the area owner, Needs-you decides). */
  recipientMemberId: string | null;
  question: string;
  answers: ConflictAnswer[];
  defaultAnswerId: string;
  /** "If nobody answers…" in words. */
  defaultWords: string;
  evidence: string[];
};

export type Confirmation = { changeId: string; basis: "second_source" | "recurring"; evidence: string[] };

export type VerifyPlan = { conflicts: Conflict[]; confirm: Confirmation[] };

export const RECENT_HOURS = 48;
/** At most this many conflicts a night per household: only real ones. */
export const MAX_CONFLICTS = 5;
const UNUSUAL_HIGH = 2.5;
const UNUSUAL_LOW = 0.4;
const RECURRING_SPREAD = 0.25;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

function dayOfMonth(date: string | null): number | null {
  const match = date ? /^\d{4}-\d{2}-(\d{2})/.exec(date) : null;
  return match ? Number(match[1]) : null;
}

function sameDay(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && a.slice(0, 10) === b.slice(0, 10);
}

function sameThing(a: { title: string; date: string | null; contentHash?: string | null }, b: { title: string; date: string | null; contentHash?: string | null }): boolean {
  if (a.contentHash && b.contentHash && a.contentHash === b.contentHash) return true;
  return a.title.length > 0 && a.title === b.title && sameDay(a.date, b.date);
}

const DAY_KINDS: ReadonlySet<BarKind> = new Set(["event", "school_item", "activity_item"]);

/** Plans the night: conflicts to raise and Checking entries to confirm. `now` bounds "recent". */
export function planVerification(input: {
  entries: readonly VerifyEntry[];
  sources: readonly SourceItem[];
  rules: readonly HouseholdRule[];
  /** Names for questions: member id → first name. */
  names: ReadonlyMap<string, string>;
  /** Change ids already raised on an earlier night: never asked twice. */
  alreadyRaised: ReadonlySet<string>;
  now: Date;
}): VerifyPlan {
  const since = input.now.getTime() - RECENT_HOURS * 3_600_000;
  const recent = input.entries.filter((entry) => Date.parse(entry.createdAt) >= since);
  const conflicts: Conflict[] = [];
  const confirm: Confirmation[] = [];
  const flagged = new Set<string>();
  const raise = (conflict: Conflict) => {
    if (flagged.has(conflict.changeId) || input.alreadyRaised.has(conflict.changeId)) return;
    flagged.add(conflict.changeId);
    conflicts.push(conflict);
  };
  const ordered = [...input.entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (const entry of recent) {
    const earlier = ordered.filter((other) => other.changeId !== entry.changeId && other.createdAt <= entry.createdAt && other.kind === entry.kind);

    // 1. Duplicate: the same thing recorded twice. A grocery said twice is a top-up (I-27), never a duplicate.
    if (entry.kind !== "grocery_item") {
      const twin = earlier.find((other) => sameThing(other, entry) && (entry.kind !== "bill" || other.amount === entry.amount));
      if (twin) {
        raise({
          reason: "duplicate",
          changeId: entry.changeId,
          itemId: entry.itemId,
          label: entry.label,
          kind: entry.kind,
          dueOn: entry.date?.slice(0, 10) ?? null,
          otherChangeId: twin.changeId,
          recipientMemberId: entry.createdByMemberId,
          question: `“${entry.label}” looks like it was added twice. Remove the copy?`,
          answers: [
            { id: "remove", label: "Remove this copy", action: "undo_this" },
            { id: "keep", label: "They're different", action: "keep" },
          ],
          // A default never removes anything: unanswered, both stay.
          defaultAnswerId: "keep",
          defaultWords: "I'll keep both.",
          evidence: [`Another “${entry.label}”${entry.date ? ` on ${entry.date.slice(0, 10)}` : ""} was added ${twin.createdAt.slice(0, 10)}.`],
        });
        continue;
      }
    }

    // 2. Date clash: two different things for the same person at the same day and time.
    if (DAY_KINDS.has(entry.kind) && entry.time && entry.subjectMemberId) {
      const clash = input.entries.find(
        (other) => other.changeId !== entry.changeId && DAY_KINDS.has(other.kind) && other.subjectMemberId === entry.subjectMemberId && sameDay(other.date, entry.date) && other.time === entry.time && other.title !== entry.title,
      );
      // One question per pair: the other side of a clash already raised tonight is not asked again.
      if (clash && !conflicts.some((raised) => raised.reason === "date_clash" && raised.changeId === clash.changeId)) {
        const who = input.names.get(entry.subjectMemberId) ?? "the same person";
        raise({
          reason: "date_clash",
          changeId: entry.changeId,
          itemId: entry.itemId,
          label: entry.label,
          kind: entry.kind,
          dueOn: entry.date?.slice(0, 10) ?? null,
          otherChangeId: clash.changeId,
          recipientMemberId: entry.createdByMemberId,
          question: `“${entry.label}” and “${clash.label}” are both for ${who} at the same time. Is one of them wrong?`,
          answers: [
            { id: "keep", label: "Both are right", action: "keep" },
            { id: "remove", label: `Remove “${entry.label}”`, action: "undo_this" },
          ],
          defaultAnswerId: "keep",
          defaultWords: "I'll keep both.",
          evidence: [`Both are on ${entry.date!.slice(0, 10)} at ${entry.time}.`],
        });
        continue;
      }
    }

    // 3. An amount far from that payee's usual (never said in the question: it may reach WhatsApp).
    if ((entry.kind === "bill" || entry.kind === "receipt") && entry.amount !== null && entry.amount > 0) {
      const key = vendorKey(entry.payee);
      const history = key ? earlier.filter((other) => vendorKey(other.payee) === key && other.amount !== null && other.amount > 0).map((other) => other.amount!) : [];
      if (history.length >= 3) {
        const usual = median(history);
        const ratio = entry.amount / usual;
        if (ratio >= UNUSUAL_HIGH || ratio <= UNUSUAL_LOW) {
          raise({
            reason: "unusual_amount",
            changeId: entry.changeId,
            itemId: entry.itemId,
          label: entry.label,
          kind: entry.kind,
          dueOn: entry.date?.slice(0, 10) ?? null,
            otherChangeId: null,
            recipientMemberId: entry.createdByMemberId,
            question: `The amount on “${entry.label}” is far ${ratio >= UNUSUAL_HIGH ? "higher" : "lower"} than usual for ${entry.payee}. Is it right?`,
            answers: [
              { id: "keep", label: "It's right", action: "keep" },
              { id: "remove", label: "Remove it", action: "undo_this" },
            ],
            defaultAnswerId: "keep",
            defaultWords: "I'll keep it as it is.",
            evidence: [`${entry.payee}'s last ${history.length} ${entry.kind === "bill" ? "bills" : "receipts"} were all near the usual amount; this one is ${ratio >= UNUSUAL_HIGH ? `${Math.round(ratio * 10) / 10} times` : "well under"} that.`],
          });
          continue;
        }
      }
    }

    // 4. A sender the household taught one person or kind sent something else.
    const key = senderKey(entry.sender);
    if (key) {
      const area = ruleFor(input.rules, "sender_area", key);
      const person = ruleFor(input.rules, entry.kind === "school_item" || entry.kind === "activity_item" ? "sender_child" : "sender_person", key);
      const otherKind = area?.valueText && area.valueText !== entry.kind && kindOfDomain(area.valueText) !== entry.kind;
      const otherPerson = person?.valueMemberId && entry.subjectMemberId && person.valueMemberId !== entry.subjectMemberId;
      if (otherKind || otherPerson) {
        const taught = otherPerson ? `for ${input.names.get(person!.valueMemberId!) ?? "someone else"}` : `${area!.valueText!.replace(/_/g, " ")}`;
        raise({
          reason: "sender_mismatch",
          changeId: entry.changeId,
          itemId: entry.itemId,
          label: entry.label,
          kind: entry.kind,
          dueOn: entry.date?.slice(0, 10) ?? null,
          otherChangeId: null,
          recipientMemberId: entry.createdByMemberId,
          question: `“${entry.label}” came from ${key.replace(/^sender:/, "")}, whose things are usually ${taught}. Is it right as it is?`,
          answers: [
            { id: "keep", label: "It's right", action: "keep" },
            { id: "remove", label: "Remove it", action: "undo_this" },
          ],
          defaultAnswerId: "keep",
          defaultWords: "I'll keep it as it is.",
          evidence: [`Your household told WonderHome that ${key.replace(/^sender:/, "")}'s things are ${taught}.`],
        });
        continue;
      }
    }
  }

  // Confirm Checking entries the evidence supports, recent or not (none of them was flagged tonight).
  for (const entry of input.entries) {
    if (!entry.unconfirmed || entry.kind === "health_document" || flagged.has(entry.changeId)) continue;
    const second = input.sources.find(
      (source) =>
        source.itemId !== entry.itemId &&
        (source.kind === entry.kind || source.kind === null) &&
        (sameThing({ title: normalizeWords(source.title) ?? "", date: source.date, contentHash: null }, { title: entry.title, date: entry.date, contentHash: null }) ||
          (entry.amount !== null && source.amount === entry.amount && sameDay(source.date, entry.date) && vendorKey(source.payee) !== null && vendorKey(source.payee) === vendorKey(entry.payee))) &&
        // The same bytes sent twice are one source, not two.
        !(source.contentHash && entry.contentHash && source.contentHash === entry.contentHash),
    );
    if (second) {
      confirm.push({ changeId: entry.changeId, basis: "second_source", evidence: [`Something else sent separately says the same: “${second.title}”${second.date ? ` on ${second.date.slice(0, 10)}` : ""}.`] });
      continue;
    }
    const before = input.entries.filter((other) => other.changeId !== entry.changeId && other.kind === entry.kind && !other.unconfirmed && other.createdAt < entry.createdAt);
    if ((entry.kind === "bill" || entry.kind === "receipt") && entry.amount !== null && entry.amount > 0) {
      const key = vendorKey(entry.payee);
      const pattern = key ? before.filter((other) => vendorKey(other.payee) === key && other.amount !== null && other.amount > 0) : [];
      if (pattern.length >= 2) {
        const usual = median(pattern.map((other) => other.amount!));
        const day = dayOfMonth(entry.date);
        const days = pattern.map((other) => dayOfMonth(other.date)).filter((value): value is number => value !== null);
        const onUsualDay = entry.kind === "receipt" || (day !== null && days.length >= 2 && Math.abs(day - median(days)) <= 3);
        if (Math.abs(entry.amount - usual) / usual <= RECURRING_SPREAD && onUsualDay) {
          confirm.push({ changeId: entry.changeId, basis: "recurring", evidence: [`It matches ${entry.payee}'s last ${pattern.length} ${entry.kind === "bill" ? "bills" : "receipts"}, which the household kept.`] });
          continue;
        }
      }
    }
    if (entry.kind === "grocery_item") {
      const kept = before.filter((other) => other.title === entry.title);
      if (kept.length >= 2) confirm.push({ changeId: entry.changeId, basis: "recurring", evidence: [`“${entry.label}” has been added and kept ${kept.length} times before.`] });
    }
  }

  return { conflicts: conflicts.slice(0, MAX_CONFLICTS), confirm };
}
