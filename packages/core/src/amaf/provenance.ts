/**
 * Where a stored fact came from — said back when an AMAF answer disagrees
 * with it (the owner, 2026-10-20: "HomeTalk should mention that, clarifying
 * the source of stored information").
 *
 * A record's source is read from what the household's own trail already
 * keeps, never guessed:
 * - an AMAF answer of its own (`amaf_answers`): who told HomeTalk, and when;
 * - a HomeSend change (`homesend_changes`): which document or message, and who confirmed it;
 * - an audit event (`audit_events`): a HomeTalk action, or a change made on a screen, and by whom;
 * - the record's own `source` (a food preference's, a memory's);
 * - otherwise, only the date the record was last written.
 * The newest of these is the source. Closed words only: the screen and the
 * reply put them into the reader's language.
 */

export type ProvenanceChannel =
  /** Told to HomeTalk in Ask me about family. */
  | "amaf"
  /** Said to HomeTalk in an ordinary conversation. */
  | "hometalk"
  /** Read from a document, a photo or a message sent through HomeSend. */
  | "homesend"
  /** Entered during setup. */
  | "setup"
  /** Entered on a screen. */
  | "screen"
  /** Brought in from a connected service, such as a school portal. */
  | "integration"
  /** Only the record's own date is known. */
  | "record";

export type Provenance = {
  channel: ProvenanceChannel;
  /** Who did it, by name, where the trail says. */
  by: string | null;
  /** When, as an ISO instant. */
  at: string | null;
  /** The screen it was entered on ("Family", "Kids & School"), for a screen change. */
  screen?: string | null;
};

export type ProvenanceTrail = {
  amaf?: readonly { at: string; byMemberId: string | null }[];
  homesend?: readonly { at: string; byMemberId: string | null; undone: boolean }[];
  audit?: readonly { at: string; eventType: string; byMemberId: string | null }[];
  /** The record's own source column, where it has one ("onboarding", "homesend", "conversation", "manual"…). */
  recordSource?: string | null;
  recordUpdatedAt?: string | null;
};

const SETUP_SOURCES = new Set(["onboarding", "setup", "welcome"]);
const INTEGRATION_SOURCES = new Set(["integration", "provider", "portal", "connector"]);

/** The audit event types that are a person acting through HomeTalk rather than on a screen. */
function channelForEvent(eventType: string): ProvenanceChannel {
  if (eventType.startsWith("hometalk.")) return "hometalk";
  if (eventType.startsWith("homesend.")) return "homesend";
  if (eventType.startsWith("amaf.")) return "amaf";
  if (eventType.startsWith("onboarding.") || eventType === "household.created" || eventType === "child.created") return "setup";
  return "screen";
}

/** The newest entry of a trail, as one source. */
export function provenanceOf(trail: ProvenanceTrail, nameOf: (memberId: string) => string | null, screen: string | null = null): Provenance {
  const candidates: Provenance[] = [];
  for (const entry of trail.amaf ?? []) candidates.push({ channel: "amaf", by: entry.byMemberId ? nameOf(entry.byMemberId) : null, at: entry.at });
  for (const entry of trail.homesend ?? []) if (!entry.undone) candidates.push({ channel: "homesend", by: entry.byMemberId ? nameOf(entry.byMemberId) : null, at: entry.at });
  for (const entry of trail.audit ?? []) {
    const channel = channelForEvent(entry.eventType);
    candidates.push({ channel, by: entry.byMemberId ? nameOf(entry.byMemberId) : null, at: entry.at, ...(channel === "screen" ? { screen } : {}) });
  }
  const newest = candidates.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))[0];
  if (newest) return newest;
  const source = trail.recordSource?.toLowerCase() ?? null;
  if (source && SETUP_SOURCES.has(source)) return { channel: "setup", by: null, at: trail.recordUpdatedAt ?? null };
  if (source === "homesend") return { channel: "homesend", by: null, at: trail.recordUpdatedAt ?? null };
  if (source === "conversation" || source === "hometalk") return { channel: "hometalk", by: null, at: trail.recordUpdatedAt ?? null };
  if (source && INTEGRATION_SOURCES.has(source)) return { channel: "integration", by: null, at: trail.recordUpdatedAt ?? null };
  if (source === "manual") return { channel: "screen", by: null, at: trail.recordUpdatedAt ?? null, screen };
  return { channel: "record", by: null, at: trail.recordUpdatedAt ?? null };
}

/**
 * The source as a phrase key and its values, for the catalog:
 * "added by Kunal in Family on 12 Oct", "from a document sent through
 * HomeSend on 3 Sep", "told to HomeTalk by Priya on 1 Oct".
 */
export function provenanceWords(provenance: Provenance, formatDay: (iso: string) => string): { key: string; values: Record<string, string> } {
  const on = provenance.at ? formatDay(provenance.at) : null;
  const by = provenance.by;
  const suffix = `${by ? ".by" : ""}${on ? ".on" : ""}`;
  const values: Record<string, string> = { ...(by ? { name: by } : {}), ...(on ? { date: on } : {}) };
  if (provenance.channel === "screen" && provenance.screen) return { key: `amaf.source.screenNamed${suffix}`, values: { ...values, screen: provenance.screen } };
  return { key: `amaf.source.${provenance.channel}${suffix}`, values };
}
