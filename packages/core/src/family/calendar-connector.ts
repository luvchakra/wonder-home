import type { Connector, ProviderRecord } from "../integrations/connector";
import { createFixtureConnector, type FixtureOptions } from "../integrations/registry";
import type { IdentityMapping } from "../integrations/repository";
import type { EventKind } from "./schedule";

/**
 * The calendar connector (story 17-002).
 *
 * The same shape as the school connector: one canonical payload every calendar
 * adapter must produce, and the translation from that shape into WonderHome's
 * own events. Whether the provider calls something an "appointment", a
 * "meeting" or a "busy block" stops at this boundary.
 *
 * Three rules are the point of the module, and each is a test:
 *
 * - **An imported event is never protected.** Protected family time is a
 *   decision a person makes about their family, not a flag a provider can set.
 * - **An imported event is never confirmed.** A provider can say an event
 *   exists and when; only a person confirms a family commitment.
 * - **A private event is time and nothing else.** The acceptance criterion for
 *   availability is "the minimum free/busy information needed for planning,
 *   not private calendar details", and that begins at import: a private entry
 *   arrives as "Busy" with no title and no location.
 *
 * `CLAUDE.md` governs whether any of this is real: no connector is live until
 * credentials, consent, authentication and integration tests exist. What ships
 * is the contract and a fixture, and the fixture says so.
 */

/** What every calendar adapter must hand back, whatever the provider called it. */
export type CalendarPayload = {
  /** The provider's identifier for the calendar, mapped to a member by the household. */
  externalCalendarId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay?: boolean;
  location?: string | null;
  /** The provider's own status. Nothing here can make an event confirmed. */
  status?: "confirmed" | "tentative" | "cancelled" | null;
  /** The provider's identifiers for other people on the invitation. */
  attendeeIds?: readonly string[];
  /** Marked private at the provider. Only its time is imported. */
  private?: boolean;
  /** What kind of thing the adapter believes this is; absent means an appointment. */
  kind?: Extract<EventKind, "appointment" | "travel" | "school_event" | "gathering"> | null;
};

export type CalendarConnector = Connector<CalendarPayload>;

export const CALENDAR_SCOPES = {
  events: "calendar.events.read",
  freeBusy: "calendar.freebusy.read",
} as const;

/** A calendar connector that returns exactly the records it was given. */
export function createFixtureCalendarConnector(
  options: Omit<FixtureOptions<CalendarPayload>, "kind">,
): CalendarConnector {
  return createFixtureConnector<CalendarPayload>({ ...options, kind: "calendar" });
}

export type { IdentityMapping } from "../integrations/repository";

/** An event as it will be written, carrying the provider identity that makes it reconcilable. */
export type ImportedEvent = {
  externalId: string;
  contentHash: string;
  title: string;
  kind: EventKind;
  startsAt: Date;
  endsAt: Date;
  location: string | null;
  /** Never `confirmed`: a provider reports existence, a person confirms. */
  status: "planned" | "proposed" | "cancelled";
  ownerMemberId: string;
  participantMemberIds: string[];
  provider: string;
};

export type CalendarTranslation = {
  events: ImportedEvent[];
  /** Records from a calendar this household has not said whose it is. Never guessed. */
  unmatched: ProviderRecord<CalendarPayload>[];
  /** Records that cannot become an event, with why, so a bad feed is visible rather than silent. */
  skipped: { record: ProviderRecord<CalendarPayload>; reason: string }[];
};

/** What a private entry is called. The title is the only thing a household ever sees of it. */
export const PRIVATE_TITLE = "Busy";

export function translateCalendar(
  records: readonly ProviderRecord<CalendarPayload>[],
  mappings: readonly IdentityMapping[],
  provider: string,
): CalendarTranslation {
  const byExternalId = new Map(mappings.map((mapping) => [mapping.externalId, mapping.memberId]));

  const events: ImportedEvent[] = [];
  const unmatched: CalendarTranslation["unmatched"] = [];
  const skipped: CalendarTranslation["skipped"] = [];

  for (const record of records) {
    const ownerMemberId = byExternalId.get(record.payload.externalCalendarId);
    if (!ownerMemberId) {
      unmatched.push(record);
      continue;
    }

    const startsAt = new Date(record.payload.startsAt);
    const endsAt = new Date(record.payload.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      skipped.push({ record, reason: "The provider sent a time that could not be read." });
      continue;
    }
    if (endsAt <= startsAt) {
      skipped.push({ record, reason: "The provider sent an event that ends before it starts." });
      continue;
    }

    const isPrivate = record.payload.private === true;
    const title = isPrivate ? PRIVATE_TITLE : record.payload.title.trim();
    if (title.length === 0) {
      skipped.push({ record, reason: "The provider sent an event with no title." });
      continue;
    }

    // Attendees are mapped where the household has said who they are, and
    // dropped otherwise. A stranger on an invitation is not a household member.
    const attendees = (record.payload.attendeeIds ?? [])
      .map((externalId) => byExternalId.get(externalId))
      .filter((memberId): memberId is string => memberId !== undefined && memberId !== ownerMemberId);

    events.push({
      externalId: record.externalId,
      contentHash: record.contentHash,
      title: title.slice(0, 200),
      kind: isPrivate ? "appointment" : (record.payload.kind ?? "appointment"),
      startsAt,
      endsAt,
      location: isPrivate ? null : (record.payload.location?.trim().slice(0, 200) || null),
      status: statusFor(record.payload.status),
      ownerMemberId,
      participantMemberIds: [ownerMemberId, ...new Set(attendees)],
      provider,
    });
  }

  return { events, unmatched, skipped };
}

function statusFor(status: CalendarPayload["status"]): ImportedEvent["status"] {
  if (status === "cancelled") return "cancelled";
  if (status === "tentative") return "proposed";
  // "confirmed" at the provider is still only "planned" here. Confirming a
  // family commitment is a person's act, and the calendar is not that person.
  return "planned";
}

/** An event already imported from this connection, as reconciliation needs it. */
export type ExistingImport = {
  id: string;
  externalId: string;
  status: "proposed" | "planned" | "confirmed" | "happened" | "cancelled";
};

export type ReconciliationPlan = {
  insert: ImportedEvent[];
  update: { id: string; event: ImportedEvent }[];
  /** Local ids of events the provider no longer has. Cancelled, never deleted. */
  cancel: string[];
  unchanged: number;
};

/**
 * What a sync should change (the "reconciled using provider identifiers plus
 * household scope" criterion).
 *
 * Identity is the provider's id within this connection; change is the content
 * hash. A record seen with the same hash is skipped without a write, one with a
 * new hash updates the row it already has, and a new id inserts.
 *
 * An event that vanished from the provider is cancelled rather than deleted,
 * because people may have answered it and a cancelled row still explains
 * itself. And it is only cancelled when the sync was complete: a partial sync
 * has not seen everything, and treating what it missed as withdrawn is how an
 * outage would rewrite a family's calendar.
 */
export function planReconciliation(
  existing: readonly ExistingImport[],
  seen: ReadonlySet<string>,
  incoming: readonly ImportedEvent[],
  options: { complete: boolean },
): ReconciliationPlan {
  const byExternalId = new Map(existing.map((row) => [row.externalId, row]));
  const plan: ReconciliationPlan = { insert: [], update: [], cancel: [], unchanged: 0 };
  const incomingIds = new Set<string>();

  for (const event of incoming) {
    incomingIds.add(event.externalId);

    if (seen.has(`${event.externalId}:${event.contentHash}`)) {
      plan.unchanged += 1;
      continue;
    }

    const current = byExternalId.get(event.externalId);
    if (current) plan.update.push({ id: current.id, event });
    else plan.insert.push(event);
  }

  if (options.complete) {
    for (const row of existing) {
      if (!incomingIds.has(row.externalId) && row.status !== "cancelled" && row.status !== "happened") {
        plan.cancel.push(row.id);
      }
    }
  }

  return plan;
}

/**
 * What a household is told when a calendar connection is unhealthy.
 *
 * The message is about the connection, and it says that availability may be
 * out of date — a free afternoon and a stale calendar must never look alike.
 */
export function describeCalendarHealth(input: {
  status: "connected" | "degraded" | "error" | "revoked" | "not_connected" | "connecting";
  lastSuccessAt: Date | null;
  now?: Date;
}): { tone: "silent" | "informational" | "needs_action"; message: string } {
  const now = input.now ?? new Date();

  switch (input.status) {
    case "connected":
      return { tone: "silent", message: "Calendars are connected." };
    case "connecting":
    case "not_connected":
      return { tone: "silent", message: "No calendar is connected yet." };
    case "degraded": {
      const hours = input.lastSuccessAt
        ? Math.floor((now.getTime() - input.lastSuccessAt.getTime()) / 3_600_000)
        : null;
      return {
        tone: "informational",
        message:
          hours === null
            ? "The calendar connection is having trouble, so availability may be out of date."
            : `The calendar connection last worked ${hours} hours ago, so availability may be out of date.`,
      };
    }
    case "error":
      return {
        tone: "needs_action",
        message: "The calendar connection is not working. Events may be missing and free time may be wrong.",
      };
    case "revoked":
      return {
        tone: "needs_action",
        message: "The calendar needs connecting again before new events can arrive.",
      };
  }
}
