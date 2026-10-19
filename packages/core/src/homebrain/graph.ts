import type { HouseholdContextItem } from "../context/types";

/**
 * The household graph (HomeBrain 4.0 §3.3, story 14-028).
 *
 * The context store already holds every record as an item; what it did not
 * hold was how they relate. "A few people are coming to Asmi's birthday" is
 * Asmi, her party, its guests, the day's other plans and whoever is away —
 * five items no ranking of single items puts together. So the items are
 * linked by typed edges, and retrieval follows them from what a question
 * named to what it touches.
 *
 * Derived, never stored: built from the viewer-filtered items on the turn,
 * so an edge can never reach an item this person may not see (both ends are
 * already in their list), and the graph is never older than the items.
 * Pure and fast — a household's few thousand items link in a few
 * milliseconds.
 */

export type EdgeKind =
  /** Any record → the person it is about. */
  | "about_person"
  /** Two dated records on the same local day — what a plan has to fit around. */
  | "same_day"
  /** A meal → the grocery item it is short of. */
  | "needs"
  /** A responsibility → whoever owns it, or backs it up. */
  | "responsible_for"
  /** A record → the HomeSend item it was routed from. */
  | "routed_from"
  /** Two records a night's sleep linked across the home (HomeBrain Sleep): "Asmi likes pasta" ↔ Friday's pasta dinner. */
  | "associated";

export type Edge = { from: string; to: string; kind: EdgeKind };

export type HouseholdGraph = {
  edges: Edge[];
  /** Neighbours of an item, by edge kind. */
  next: Map<string, { to: string; kind: EdgeKind }[]>;
};

/** Domains whose records are about a particular day. */
const DATED = new Set(["calendar", "school", "meals", "absences", "bills", "health"]);

export function buildHouseholdGraph(items: readonly HouseholdContextItem[]): HouseholdGraph {
  const edges: Edge[] = [];
  const byId = new Map(items.map((item) => [item.id, item]));
  const memberItem = new Map(items.filter((item) => item.entityType === "member").map((item) => [item.entityId, item.id]));
  const consumableByName = new Map(items.filter((item) => item.entityType === "consumable").map((item) => [String(item.attributes.title ?? item.attributes.name ?? "").toLowerCase(), item.id]));
  const homeSendItem = new Map(items.filter((item) => item.entityType === "homesend_item").map((item) => [item.entityId, item.id]));
  const byDay = new Map<string, string[]>();

  for (const item of items) {
    // About the person — never the person's own row to itself. A
    // responsibility's people are its owner and backup (its builder puts both
    // in `subjectMemberIds`), so its edge says that instead.
    const kind: EdgeKind = item.entityType === "responsibility" ? "responsible_for" : "about_person";
    for (const member of item.subjectMemberIds) {
      const to = memberItem.get(member);
      if (to && to !== item.id) edges.push({ from: item.id, to, kind });
    }
    if (item.entityType === "meal" && Array.isArray(item.attributes.missing)) {
      for (const name of item.attributes.missing as unknown[]) {
        const to = consumableByName.get(String(name).toLowerCase());
        if (to) edges.push({ from: item.id, to, kind: "needs" });
      }
    }
    for (const ref of item.evidence) {
      const to = ref.type === "homesend_intake" && ref.sourceId ? homeSendItem.get(ref.sourceId) : undefined;
      if (to && to !== item.id) edges.push({ from: item.id, to, kind: "routed_from" });
    }
    // A link drawn overnight, only to a record this viewer can also see (both ends in their list).
    if (Array.isArray(item.attributes.associations)) {
      for (const link of item.attributes.associations as { to?: unknown }[]) {
        if (typeof link?.to === "string" && link.to !== item.id && byId.has(link.to)) edges.push({ from: item.id, to: link.to, kind: "associated" });
      }
    }
    const date = typeof item.attributes.date === "string" ? item.attributes.date.slice(0, 10) : null;
    if (date && DATED.has(item.domain)) byDay.set(date, [...(byDay.get(date) ?? []), item.id]);
  }

  // Same day: every pair, both ways — a day rarely holds more than a handful.
  for (const ids of byDay.values()) {
    if (ids.length > 12) continue;
    for (const a of ids) for (const b of ids) if (a !== b && byId.has(b)) edges.push({ from: a, to: b, kind: "same_day" });
  }

  const next = new Map<string, { to: string; kind: EdgeKind }[]>();
  for (const edge of edges) {
    next.set(edge.from, [...(next.get(edge.from) ?? []), { to: edge.to, kind: edge.kind }]);
    // Edges read both ways, except same-day, which is already symmetric.
    if (edge.kind !== "same_day") next.set(edge.to, [...(next.get(edge.to) ?? []), { to: edge.from, kind: edge.kind }]);
  }
  return { edges, next };
}

/** The items one hop from these, along the given kinds of edge, excluding the seeds themselves. */
export function neighbours(graph: HouseholdGraph, seeds: Iterable<string>, kinds: ReadonlySet<EdgeKind>): Map<string, { from: string; kind: EdgeKind }> {
  const seedSet = new Set(seeds);
  const found = new Map<string, { from: string; kind: EdgeKind }>();
  for (const seed of seedSet) {
    for (const edge of graph.next.get(seed) ?? []) {
      if (!kinds.has(edge.kind) || seedSet.has(edge.to) || found.has(edge.to)) continue;
      found.set(edge.to, { from: seed, kind: edge.kind });
    }
  }
  return found;
}
