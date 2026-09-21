import { createFixtureConnector, type FixtureOptions } from "../integrations/registry";
import type { Connector, ProviderRecord } from "../integrations/connector";
import type { SchoolItem, SchoolItemKind } from "./items";

/**
 * The school connector (stories 08-002, 08-003, 08-008).
 *
 * A thin specialisation of the shared contract: one canonical payload shape
 * that every school adapter must produce, and the translation from that shape
 * into WonderHome's own model. A portal that calls an exam a "graded activity"
 * is the adapter's problem, and it stops at this boundary.
 *
 * `CLAUDE.md` governs whether any of this is real: no connector is live until
 * credentials, consent, authentication and integration tests exist. What ships
 * today is the contract and a fixture, and the fixture says so.
 */

/** What every school adapter must hand back, whatever the portal called it. */
export type SchoolPayload = {
  /** The provider's identifier for the child, mapped to a member by the household. */
  externalChildId: string;
  kind: SchoolItemKind;
  title: string;
  subject?: string | null;
  detail?: string | null;
  dueAt?: string | null;
  estimatedMinutes?: number | null;
  /** Only ever 'cancelled' or absent. A portal cannot report work as done. */
  status?: "cancelled" | null;
};

export type SchoolConnector = Connector<SchoolPayload>;

export const SCHOOL_SCOPES = {
  assignments: "assignments.read",
  documents: "documents.read",
  communications: "communications.read",
} as const;

/**
 * A school connector that returns exactly the records it was given.
 *
 * Every failure the domain has to survive — an outage, a rate limit, a
 * withdrawn scope, a partial sync — is reachable from here without a network,
 * which is what lets 08-003 and 08-005 be tested honestly.
 */
export function createFixtureSchoolConnector(
  options: Omit<FixtureOptions<SchoolPayload>, "kind">,
): SchoolConnector {
  return createFixtureConnector<SchoolPayload>({ ...options, kind: "school" });
}

export type ChildMapping = {
  /** The provider's id for a child, to the household's own member id. */
  externalChildId: string;
  childMemberId: string;
};

/** A translated item, carrying what reconciliation needs beyond the canonical shape. */
export type TranslatedSchoolItem = Omit<SchoolItem, "id" | "status" | "completedAt" | "externalId"> & {
  /** Always present: a translated item always came from a provider record. */
  externalId: string;
  /** Identity plus a stable hash of the payload, so a re-sync can tell "unchanged" from "corrected". */
  contentHash: string;
  /**
   * Whether the provider itself reported this item cancelled (17-004).
   *
   * Applying it is the reconciler's decision, not this function's: a provider
   * saying "cancelled" is exactly as unable to report work *done* as it is to
   * un-report work a child already turned in, so a reconciler must never let
   * this override an item already submitted or done.
   */
  providerCancelled: boolean;
};

export type Translation = {
  /** Ready to become canonical school items. */
  items: TranslatedSchoolItem[];
  /**
   * Records naming a child this household has not mapped.
   *
   * Never guessed at. A worksheet filed against the wrong child is worse than
   * one that waits for somebody to say who it belongs to — and a portal can
   * return other families' children when a share is misconfigured.
   */
  unmatched: ProviderRecord<SchoolPayload>[];
};

/**
 * Turns provider records into canonical items (08-003).
 *
 * Note what does not appear in the output: status and completion. A translation
 * describes work that exists, never work that is finished.
 */
export function translate(
  records: readonly ProviderRecord<SchoolPayload>[],
  mappings: readonly ChildMapping[],
  provider: string,
): Translation {
  const byExternalChild = new Map(mappings.map((mapping) => [mapping.externalChildId, mapping.childMemberId]));

  const items: Translation["items"] = [];
  const unmatched: ProviderRecord<SchoolPayload>[] = [];

  for (const record of records) {
    const childMemberId = byExternalChild.get(record.payload.externalChildId);
    if (!childMemberId) {
      unmatched.push(record);
      continue;
    }

    const dueAt = record.payload.dueAt ? new Date(record.payload.dueAt) : null;

    items.push({
      childMemberId,
      kind: record.payload.kind,
      title: record.payload.title,
      subject: record.payload.subject ?? null,
      // A provider never sends a household's own notes about the work.
      detail: null,
      dueAt: dueAt && !Number.isNaN(dueAt.getTime()) ? dueAt : null,
      estimatedMinutes: record.payload.estimatedMinutes ?? null,
      estimateSource: record.payload.estimatedMinutes != null ? "provider" : null,
      provider,
      externalId: record.externalId,
      contentHash: record.contentHash,
      providerCancelled: record.payload.status === "cancelled",
    });
  }

  return { items, unmatched };
}

/**
 * What a household is told when a school connection is unhealthy (08-002).
 *
 * The criterion is that connector failures are visible as integration health
 * issues and never fabricate school data. So the message is about the
 * connection, and it says plainly that the work list may be incomplete — an
 * empty homework list and a broken connection must never look alike.
 */
export function describeSchoolHealth(input: {
  status: "connected" | "degraded" | "error" | "revoked" | "not_connected" | "connecting";
  lastSuccessAt: Date | null;
  now?: Date;
}): { tone: "silent" | "informational" | "needs_action"; message: string } {
  const now = input.now ?? new Date();

  switch (input.status) {
    case "connected":
      return { tone: "silent", message: "School is connected." };
    case "connecting":
    case "not_connected":
      return { tone: "silent", message: "No school account is connected yet." };
    case "degraded": {
      const hours = input.lastSuccessAt
        ? Math.floor((now.getTime() - input.lastSuccessAt.getTime()) / 3_600_000)
        : null;
      return {
        tone: "informational",
        message:
          hours === null
            ? "The school connection is having trouble, so this list may be incomplete."
            : `The school connection last worked ${hours} hours ago, so this list may be incomplete.`,
      };
    }
    case "error":
      return {
        tone: "needs_action",
        message: "The school connection is not working. Homework may be missing from this list.",
      };
    case "revoked":
      return {
        tone: "needs_action",
        message: "The school account needs connecting again before homework can arrive.",
      };
  }
}
