import type { AutonomyMode } from "@wonderhome/core/household/autonomy";
import type { Translate } from "@wonderhome/core/i18n/translate";

/**
 * The Responsibilities page's grouping, as pure functions so they can be
 * tested. The page groups by owner or by outcome area, and shows the one
 * autonomy mode a group shares.
 */

export type Row = {
  id: string;
  outcome_key: string;
  primary_member_id: string | null;
  backup_member_id: string | null;
  ai_mode: "prepare" | "execute";
  priority: number;
  playbook_items: { name: string; outcome_definition: string; cadence: Record<string, unknown> } | { name: string; outcome_definition: string; cadence: Record<string, unknown> }[] | null;
};

/**
 * Groups rows by who owns them, in household-member order, with a final
 * "Unowned" group for outcomes nobody owns yet — the group the household
 * most needs to notice, so it goes last rather than getting lost among
 * named owners (design rule 17: the thing to decide first reads first, and
 * an unassigned outcome is a decision, not a record of one already made).
 */
export function groupByOwner(
  rows: Row[],
  members: { id: string; displayName: string }[],
  nobodyYet: string,
): { ownerId: string | null; ownerName: string; rows: Row[] }[] {
  const byOwner = new Map<string | null, Row[]>();
  for (const row of rows) {
    const key = row.primary_member_id;
    const existing = byOwner.get(key);
    if (existing) existing.push(row);
    else byOwner.set(key, [row]);
  }

  const groups: { ownerId: string | null; ownerName: string; rows: Row[] }[] = members
    .map((member) => ({ ownerId: member.id, ownerName: member.displayName, rows: byOwner.get(member.id) ?? [] }))
    .filter((group) => group.rows.length > 0);

  const unowned = byOwner.get(null) ?? [];
  if (unowned.length > 0) groups.push({ ownerId: null, ownerName: nobodyYet, rows: unowned });

  return groups;
}

/** The outcome areas the starter outcomes name; any other prefix is shown as written. */
const KNOWN_AREAS = new Set(["laundry", "meals", "groceries", "finance", "school", "home", "household", "pets", "kids", "health"]);

/** An outcome's area is the part of its key before the dot: "laundry.ready" is laundry. */
export function areaOf(outcomeKey: string): string {
  return outcomeKey.split(".")[0] ?? outcomeKey;
}

/**
 * Groups rows by outcome area, in the order the first row of each area
 * appears (priority order). Anything keyed by an outcome groups the same
 * way: the Responsibilities page and the Household playbook share it.
 */
export function groupByArea<T extends { outcome_key: string }>(rows: T[], t: Translate): { ownerId: null; ownerName: string; area: string; rows: T[] }[] {
  const byArea = new Map<string, T[]>();
  for (const row of rows) {
    const area = areaOf(row.outcome_key);
    const existing = byArea.get(area);
    if (existing) existing.push(row);
    else byArea.set(area, [row]);
  }
  return [...byArea].map(([area, areaRows]) => ({
    ownerId: null,
    area,
    ownerName: KNOWN_AREAS.has(area) ? t(`manage.resp.area.${area}` as Parameters<Translate>[0]) : area.replace(/_/g, " "),
    rows: areaRows,
  }));
}

/** The one mode every responsibility in a group shares, so the group's dropdown can show it chosen. Null when they differ. */
export function sharedMode(groupRows: readonly Row[]): AutonomyMode | null {
  const first = groupRows[0]?.ai_mode ?? null;
  return first && groupRows.every((row) => row.ai_mode === first) ? first : null;
}
