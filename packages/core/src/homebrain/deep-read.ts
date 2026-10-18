import type { ContextDomain, HouseholdContextItem } from "../context/types";
import type { BrainReading } from "./question";

/**
 * Looking deeper (HomeBrain 4.0 §3.7, story 14-026).
 *
 * The owner, 2026-10-18: "if it doesn't have the answer then it should check
 * the WonderHome database, get the right answer then update the HomeBrain
 * context subsequently." Asked "can you check the WonderHome database and
 * find out?", HomeTalk had nowhere to look and said the same thing twice.
 *
 * So before HomeBrain says "nothing is on record" about something the
 * question named — a part of the home, a person, an event — it reads those
 * domains again, live, through the person's own session (RLS decides, the
 * same as any screen), and answers once more from what it finds. When the
 * live read had something the stored context did not, the store is wrong:
 * the caller marks it stale so it is rebuilt after the response, and the
 * miss is counted (`homebrain_misses`), so a builder that leaves something
 * out shows up as a number rather than as a household being told "no".
 *
 * Pure apart from the read the caller hands in. Never reads a domain the
 * viewer could not, never widens the consent gate, never runs twice in a
 * turn and never writes household data.
 */

/** At most this many domains in one deeper look (§7.4's budget). */
export const DEEP_READ_MAX_DOMAINS = 3;
/** And at most this long: a slow turn feels broken. */
export const DEEP_READ_TIMEOUT_MS = 1500;

/** Domains that only frame an answer: re-reading them never finds what a question is about. */
const NEVER_TARGETS: ReadonlySet<ContextDomain> = new Set(["household", "attention", "hometalk", "notifications", "agents", "integrations"]);

/**
 * The domains a deeper look reads for this reading, most specific first:
 * what the question is unmistakably about, then the domains of what it
 * named, then what those connect to. Empty when it names nothing a re-read
 * could find — a broad "what's going on?" is the agenda's, not this.
 */
export function deepReadTargets(reading: BrainReading, items: readonly HouseholdContextItem[]): ContextDomain[] {
  const ordered: ContextDomain[] = [];
  const add = (domain: ContextDomain) => {
    if (!NEVER_TARGETS.has(domain) && !ordered.includes(domain)) ordered.push(domain);
  };
  for (const domain of reading.focus) add(domain);
  // A person named ("what does Asmi have on Friday?") is answered from her school, calendar and preferences.
  const named = new Set(reading.people.map((person) => person.memberId));
  if (named.size > 0 && reading.focus.size === 0) for (const domain of ["calendar", "school", "preferences"] as const) add(domain);
  for (const item of items) {
    if (item.subjectMemberIds.some((member) => named.has(member)) && item.tier === 1) add(item.domain);
  }
  for (const domain of reading.domains) add(domain);
  for (const domain of reading.connected) add(domain);
  return ordered.slice(0, DEEP_READ_MAX_DOMAINS);
}

/** Live items win over stored ones with the same id; anything new is added. */
export function mergeLiveItems(stored: readonly HouseholdContextItem[], live: readonly HouseholdContextItem[]): { items: HouseholdContextItem[]; added: number; changed: number } {
  const byId = new Map(stored.map((item) => [item.id, item]));
  let added = 0;
  let changed = 0;
  for (const item of live) {
    const before = byId.get(item.id);
    if (!before) added += 1;
    else if (before.summary !== item.summary) changed += 1;
    byId.set(item.id, item);
  }
  return { items: [...byId.values()], added, changed };
}

/** A read that takes too long is a read that found nothing. */
export async function withinDeepReadBudget<T>(read: Promise<T>, ms: number = DEEP_READ_TIMEOUT_MS): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([read, new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), ms)))]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** What a turn says about the look it took: closed words for `homebrain_misses`, never content. */
export type DeepReadRecord = {
  domains: ContextDomain[];
  trigger: "not_on_record" | "asked_to_look" | "unknown";
  /** The live read had something the stored context did not. */
  found: boolean;
  latencyMs: number;
};
