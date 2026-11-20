import type { HomeSendKind } from "./items";
import type { IntakePerson, SubjectResolution } from "./resolve";

/**
 * "Who may file health records for others" (the owner, 2026-11-20: "for
 * health record make it configurable on admin level, so the check can be
 * bypassed for allowed users"). An Admin picks adult members on Settings →
 * AI Assistant, in "Money and health entries"; nobody by default. A health
 * document one of them sends that names another household member is filed
 * for that person at once, marked Checking, with Undo and an audit row, and
 * no "Who is this for?". Everyone else keeps today's rule: a health document
 * is filed for its sender, or a child they look after; for anyone else it is
 * asked. Who can see the record is unchanged (`wh.may_see_health`).
 *
 * Kept like the other record-first settings: one versioned `policies` row,
 * category `ai_autonomy`, Admin-only to change and audited
 * (`household/direct-add-repository.ts`). Pure here.
 */

export const HEALTH_FILERS_POLICY_NAME = "Who may file health records for others";

/** At most this many members on the list (a household has far fewer adults). */
export const HEALTH_FILERS_MAX = 20;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The member ids an Admin picked, from the policy's stored rule; nobody when it is missing or malformed. */
export function asHealthFilers(rule: unknown): string[] {
  const members = (rule as { members?: unknown } | null)?.members;
  if (!Array.isArray(members)) return [];
  return [...new Set(members.filter((id): id is string => typeof id === "string" && UUID.test(id)))].slice(0, HEALTH_FILERS_MAX);
}

/** Who an Admin may pick: an adult, or a helper only by an Admin's explicit pick; never a child. */
export function pickableFiler(memberType: string | null | undefined): boolean {
  return memberType === "adult" || memberType === "helper";
}

/** Whether this member may file a health record for someone else: on the Admin's list, and never a child (even if stored). */
export function mayFileForOthers(filers: readonly string[], member: { memberId: string | null; memberType: string | null | undefined } | null): boolean {
  if (!member?.memberId || !pickableFiler(member.memberType)) return false;
  return filers.includes(member.memberId);
}

/**
 * Today's rule for who a health document may be filed for on its own, kept
 * for every sender not on the list: themselves, or a child (whose guardian
 * the database checks, as it always has). Someone else picked from the
 * content becomes the question "Who is this for?" instead of a write the
 * database would refuse. An allowed sender keeps the person it named.
 */
export function gateHealthSubject(
  kind: HomeSendKind | null | undefined,
  subject: SubjectResolution,
  sender: { memberId: string | null; memberType: string | null | undefined } | null,
  filer: boolean,
): SubjectResolution {
  if (kind !== "health_document" || !subject.selected) return subject;
  const selected = subject.selected;
  if (filer) return subject;
  if (sender?.memberId && selected.memberId === sender.memberId) return subject;
  if (selected.memberType === "child" && sender?.memberType === "adult") return subject;
  return { said: subject.said, selected: null, candidates: [selected], question: "Who is this for?" };
}

export type HealthMember = { id: string; displayName: string; memberType: string | null; status?: string | null };

function words(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

/**
 * The household member a health document names, read from its own words
 * (the name it says it is for, the people it mentions): exactly one active
 * adult or child by full name, else by first name. A helper is never one; a
 * name matching nobody, or two people, is nobody — today's question.
 */
export function namedHealthSubject(names: readonly (string | null | undefined)[], members: readonly HealthMember[]): HealthMember | null {
  const eligible = members.filter((member) => (member.memberType === "adult" || member.memberType === "child") && (member.status ?? "active") === "active");
  const found = new Map<string, HealthMember>();
  for (const raw of names) {
    const name = typeof raw === "string" ? words(raw) : "";
    if (name.length < 2) continue;
    const full = eligible.filter((member) => words(member.displayName) === name);
    const first = full.length > 0 ? full : eligible.filter((member) => words(member.displayName).split(" ")[0] === name.split(" ")[0] && (name.split(" ").length === 1 || words(member.displayName).split(" ").length === 1));
    if (first.length === 1) found.set(first[0]!.id, first[0]!);
    else if (first.length > 1) return null;
  }
  return found.size === 1 ? [...found.values()][0]! : null;
}

/**
 * Who an allowed sender's waiting health document is filed for, by the
 * deadlines step (instead of "Add this bill?"): the one member it names, when
 * that is someone other than the sender. Null keeps today's behaviour.
 */
export function healthFiledFor(input: {
  kind: HomeSendKind | null;
  sender: { memberId: string | null; memberType: string | null | undefined } | null;
  filers: readonly string[];
  names: readonly (string | null | undefined)[];
  members: readonly HealthMember[];
}): string | null {
  if (input.kind !== "health_document" || !mayFileForOthers(input.filers, input.sender)) return null;
  const named = namedHealthSubject(input.names, input.members);
  return named && named.id !== input.sender?.memberId ? named.id : null;
}

/** As an `IntakePerson`, for the review's subject. */
export function asIntakePerson(member: HealthMember): IntakePerson {
  return { memberId: member.id, displayName: member.displayName, memberType: member.memberType === "child" ? "child" : member.memberType === "helper" ? "helper" : "adult" };
}

/**
 * Whose a waiting health document is, from its own words, for a sender not
 * on "Who may file health records for others" (the owner, 2026-11-20: a
 * default never fills who a health document is for). "sender": the one
 * household member it names is the sender. "other": it names someone else,
 * or names that match nobody or several people. "unclear": it names nobody.
 * Only "sender" is ever filed without a person saying so; the others ask the
 * sender "Who is this for?" (`deadlines.ts` `healthForQuestion`).
 */
export type HealthSubjectFor = "sender" | "other" | "unclear";

export function healthSubjectFor(input: { senderMemberId: string | null; names: readonly (string | null | undefined)[]; members: readonly HealthMember[] }): HealthSubjectFor {
  const named = namedHealthSubject(input.names, input.members);
  if (named) return input.senderMemberId && named.id === input.senderMemberId ? "sender" : "other";
  return input.names.some((name) => typeof name === "string" && words(name).length >= 2) ? "other" : "unclear";
}
