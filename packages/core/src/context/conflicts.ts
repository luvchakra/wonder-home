import { detectConflicts, type ConflictSubject } from "../family/schedule";
import { isUsable } from "./freshness";
import type { ContextConflict, HouseholdContextItem } from "./types";

/**
 * What in the home disagrees with itself (Wave 1 §5 `findPotentialConflicts`).
 *
 * Three kinds, each naming the items involved so a person can act on it:
 *
 *  - two things one person is doing at once — the family module's own
 *    `detectConflicts`, reused rather than re-derived;
 *  - two beliefs about one thing that do not agree — a learned observation
 *    the household's confirmed word has overruled, waiting to be reviewed;
 *  - someone away on a day they are down to do something.
 *
 * A health appointment is only ever "an appointment" here: the conflict is
 * about someone's time, and naming what the appointment is for would carry
 * private health detail into a sentence about the calendar.
 */

function windowOf(item: HouseholdContextItem): { start: Date; end: Date } | null {
  const start = typeof item.attributes.startsAt === "string" ? new Date(item.attributes.startsAt) : null;
  if (!start || Number.isNaN(start.getTime())) return null;
  const endValue = typeof item.attributes.endsAt === "string" ? item.attributes.endsAt : item.validUntil;
  const end = endValue ? new Date(endValue) : new Date(start.getTime() + 60 * 60_000);
  return end.getTime() > start.getTime() ? { start, end } : { start, end: new Date(start.getTime() + 60 * 60_000) };
}

function labelOf(item: HouseholdContextItem): string {
  if (item.privacyClass === "health") return "an appointment";
  return typeof item.attributes.title === "string" ? item.attributes.title : item.entityType;
}

export function findPotentialConflicts(items: readonly HouseholdContextItem[]): ContextConflict[] {
  const conflicts: ContextConflict[] = [];
  const usable = items.filter(isUsable);

  // --- One person, two places at once ---------------------------------------
  const timed = usable.filter((item) => (item.entityType === "event" || item.entityType === "health_appointment") && windowOf(item));
  const byMember = new Map<string, HouseholdContextItem[]>();
  for (const item of timed) {
    for (const member of item.subjectMemberIds) {
      const list = byMember.get(member) ?? [];
      list.push(item);
      byMember.set(member, list);
    }
  }
  const seen = new Set<string>();
  for (const [memberId, list] of byMember) {
    const subjects: ConflictSubject[] = list.map((item) => ({
      kind: "event",
      id: item.id,
      label: labelOf(item),
      window: windowOf(item)!,
      protected: item.attributes.protected === true,
      optional: false,
    }));
    for (const clash of detectConflicts(subjects)) {
      const key = [clash.left.id, clash.right.id].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      const involved = list.filter((item) => item.id === clash.left.id || item.id === clash.right.id);
      conflicts.push({
        kind: "schedule_overlap",
        itemIds: [clash.left.id, clash.right.id],
        subjectMemberIds: [memberId],
        summary: `${clash.left.label} and ${clash.right.label} overlap. ${clash.proposedDetail}`,
        severity: involved.some((item) => item.attributes.protected === true) ? "high" : "medium",
      });
    }
  }

  // --- Two beliefs about one thing --------------------------------------------
  for (const loser of items.filter((item) => item.freshness === "superseded" && item.supersededBy)) {
    const winner = items.find((item) => item.id === loser.supersededBy);
    if (!winner || winner.entityType !== loser.entityType) continue;
    const differs = JSON.stringify(loser.attributes.value ?? loser.attributes.date ?? null) !== JSON.stringify(winner.attributes.value ?? winner.attributes.date ?? null);
    if (!differs) continue;
    conflicts.push({
      kind: "contradictory_facts",
      itemIds: [winner.id, loser.id],
      subjectMemberIds: Array.from(new Set([...winner.subjectMemberIds, ...loser.subjectMemberIds])),
      summary: winner.confirmed && !loser.confirmed
        ? `WonderHome picked up something different from what the household confirmed: kept "${winner.summary}" over "${loser.summary}".`
        : `Two records disagree; the newer one stands: "${winner.summary}" over "${loser.summary}".`,
      severity: "low",
    });
  }

  // --- Away, but down to do something -------------------------------------------
  const absences = usable.filter((item) => item.entityType === "absence");
  for (const absence of absences) {
    const memberId = absence.subjectMemberIds[0];
    const day = typeof absence.attributes.date === "string" ? absence.attributes.date : null;
    if (!memberId || !day) continue;
    for (const item of usable) {
      if (item.attributes.date !== day) continue;
      const cooking = item.entityType === "meal" && item.attributes.cookMemberId === memberId;
      const attending = (item.entityType === "event" || item.entityType === "health_appointment") && item.subjectMemberIds.includes(memberId);
      if (!cooking && !attending) continue;
      conflicts.push({
        kind: "away_but_assigned",
        itemIds: [absence.id, item.id],
        subjectMemberIds: [memberId],
        summary: cooking ? `${absence.summary.replace(/\.$/, "")}, but is down to cook ${labelOf(item)} that day.` : `${absence.summary.replace(/\.$/, "")}, but ${labelOf(item)} is on that day.`,
        severity: cooking ? "medium" : "low",
      });
    }
  }

  return conflicts;
}
