import { createHash } from "node:crypto";

/**
 * Idempotency for scheduled portal fetches (story 08-033).
 *
 * The same homework or message shows up on every run, so a fetch that filed
 * whatever it read would bury a household in duplicates twice a day. Each item
 * gets a stable hash of what identifies it; the per-connection cursor keeps the
 * hashes already seen, and only genuinely new items go on to HomeSend. Pure and
 * order-stable, so it is trivially testable.
 */

export type PortalItemIdentity = {
  connectionId: string;
  /** The scrape URL the item was read from. */
  sourceUrl: string;
  kind: string;
  title: string;
  /** The day it is about (YYYY-MM-DD), when known — lets the same title on two days differ. */
  occurredOn?: string | null;
};

/** A stable content hash for one item's identity. */
export function itemHash(identity: PortalItemIdentity): string {
  const key = [
    identity.connectionId,
    identity.sourceUrl.trim().toLowerCase(),
    identity.kind.trim().toLowerCase(),
    identity.title.trim().replace(/\s+/g, " ").toLowerCase(),
    identity.occurredOn ?? "",
  ].join("\u0000");
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Keep only items not already seen (and not duplicated within this batch),
 * returning them in input order plus the hashes to add to the cursor.
 */
export function selectNew<T extends PortalItemIdentity>(items: readonly T[], seen: Iterable<string>): { fresh: T[]; hashes: string[] } {
  const seenSet = new Set(seen);
  const fresh: T[] = [];
  const hashes: string[] = [];
  const batch = new Set<string>();
  for (const item of items) {
    const hash = itemHash(item);
    if (seenSet.has(hash) || batch.has(hash)) continue;
    batch.add(hash);
    fresh.push(item);
    hashes.push(hash);
  }
  return { fresh, hashes };
}
