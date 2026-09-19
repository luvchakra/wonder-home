import { createHash } from "node:crypto";

import type { ConnectorContext, ProviderRecord } from "../integrations/connector";
import { canTransition, type CommercePayload, type CommerceConnector, type OrderStatus } from "./orders";

/**
 * Reconciling what a merchant says about an order (story 17-005).
 *
 * Commerce is the first connector that is not simply a feed. A calendar, an
 * inbox and a school portal all own the things they report; a merchant is
 * reporting back on something **this household created**, with money already
 * committed to it. That changes what a sync is allowed to do.
 *
 * Two rules follow, and both are about not corrupting canonical state.
 *
 * **A merchant cannot rewind an order.** `canTransition` is the household's
 * lifecycle, not the provider's, and a record saying "shipped" about an order
 * already delivered is refused rather than applied. Providers do resend stale
 * webhooks and do replay queues out of order; a reconciler that takes the
 * latest message as the newest truth will eventually un-deliver a delivery.
 *
 * **A merchant cannot quietly reprice.** A household approved an amount. If a
 * sync reports a different one, that is an exception for a person to see, not
 * a column to overwrite — the same rule `finance/payments.ts` applies when an
 * amount changes after approval, for the same reason.
 *
 * `CLAUDE.md` governs whether any of this is real: no connector is live until
 * credentials, consent, authentication and integration tests exist. What ships
 * is the contract and a fixture, and the fixture says so.
 */

export const COMMERCE_SCOPES = {
  orders: "orders.read",
  place: "orders.write",
} as const;

/** A provider record, translated into what reconciliation needs. */
export type TranslatedOrderUpdate = {
  externalId: string;
  status: OrderStatus;
  /** Absent when the provider did not restate it. Absent is not zero. */
  totalMinor: number | null;
  currency: string | null;
  expectedAt: Date | null;
  /** Identity plus a hash of the payload, so a re-sync tells unchanged from changed. */
  contentHash: string;
};

export type CommerceTranslation = {
  updates: TranslatedOrderUpdate[];
  /** Records that could not become updates, with why. Never silently dropped. */
  skipped: { record: ProviderRecord<CommercePayload>; because: string }[];
};

export function translateCommerce(
  records: readonly ProviderRecord<CommercePayload>[],
): CommerceTranslation {
  const updates: TranslatedOrderUpdate[] = [];
  const skipped: CommerceTranslation["skipped"] = [];

  for (const record of records) {
    const { externalOrderId, status, totalMinor, currency, expectedAt } = record.payload;

    if (!externalOrderId) {
      skipped.push({ record, because: "The merchant did not say which order this was about." });
      continue;
    }

    const expected = expectedAt ? new Date(expectedAt) : null;

    updates.push({
      externalId: externalOrderId,
      status,
      totalMinor: typeof totalMinor === "number" ? totalMinor : null,
      currency: currency ?? null,
      expectedAt: expected && !Number.isNaN(expected.getTime()) ? expected : null,
      contentHash: hashOf(record.payload),
    });
  }

  return { updates, skipped };
}

function hashOf(payload: CommercePayload): string {
  const stable = [
    payload.externalOrderId,
    payload.status,
    payload.totalMinor ?? "",
    payload.currency ?? "",
    payload.expectedAt ?? "",
  ].join("|");
  return createHash("sha256").update(stable).digest("hex").slice(0, 32);
}

export type ExistingOrder = {
  id: string;
  externalId: string;
  status: OrderStatus;
  totalMinor: number;
  currency: string;
};

export type OrderSyncPlan = {
  apply: { id: string; update: TranslatedOrderUpdate }[];
  unchanged: number;
  /**
   * An update the lifecycle refuses — a merchant trying to move an order
   * backwards, or out of a terminal state.
   */
  refused: { externalId: string; from: OrderStatus; to: OrderStatus; because: string }[];
  /**
   * An order whose total no longer matches what the household agreed to.
   *
   * Deliberately its own category rather than an update or a refusal. The
   * status change may well be real and worth applying; what must not happen
   * is the new amount replacing the approved one without anybody seeing it.
   */
  repriced: { externalId: string; approvedMinor: number; reportedMinor: number; currency: string }[];
  /**
   * A record naming an order this household does not have.
   *
   * Usually somebody ordering in the merchant's own app. Never inserted here:
   * an order WonderHome did not place has no approval behind it, and inventing
   * one would put a purchase nobody agreed to into the household's history.
   */
  unmatched: TranslatedOrderUpdate[];
};

export function planOrderSync(
  existing: readonly ExistingOrder[],
  seen: ReadonlySet<string>,
  incoming: readonly TranslatedOrderUpdate[],
): OrderSyncPlan {
  const byExternalId = new Map(existing.map((order) => [order.externalId, order]));
  const plan: OrderSyncPlan = { apply: [], unchanged: 0, refused: [], repriced: [], unmatched: [] };

  for (const update of incoming) {
    const current = byExternalId.get(update.externalId);

    if (!current) {
      plan.unmatched.push(update);
      continue;
    }

    if (seen.has(`${update.externalId}:${update.contentHash}`)) {
      plan.unchanged += 1;
      continue;
    }

    // Checked whether or not the status is applied: a silent reprice on an
    // order that is merely being confirmed is still a silent reprice.
    if (
      update.totalMinor !== null &&
      update.totalMinor !== current.totalMinor &&
      (update.currency ?? current.currency) === current.currency
    ) {
      plan.repriced.push({
        externalId: update.externalId,
        approvedMinor: current.totalMinor,
        reportedMinor: update.totalMinor,
        currency: current.currency,
      });
    }

    if (update.status === current.status) {
      // Same status, different content: the expected date moved, which is the
      // ordinary case and the one a household most wants to hear about.
      plan.apply.push({ id: current.id, update });
      continue;
    }

    if (!canTransition(current.status, update.status)) {
      plan.refused.push({
        externalId: update.externalId,
        from: current.status,
        to: update.status,
        because: describeRefusal(current.status, update.status),
      });
      continue;
    }

    plan.apply.push({ id: current.id, update });
  }

  return plan;
}

function describeRefusal(from: OrderStatus, to: OrderStatus): string {
  if (from === "delivered") {
    return "This order is already delivered. A delivery that turned out to be wrong is a return, not a rewind.";
  }
  if (from === "cancelled" || from === "failed") {
    return `This order is already ${from}. The merchant cannot reopen it from their side.`;
  }
  return `An order cannot go from ${from} back to ${to}.`;
}

// ---------------------------------------------------------------------------
// Placing an order
// ---------------------------------------------------------------------------

/**
 * What a merchant needs to place an order, and what it hands back.
 *
 * Separate from `Connector` because placing is not syncing: it is the only
 * outbound, money-moving thing any connector in this product does, and giving
 * it its own type means a read-only commerce adapter is a legal thing to
 * write. A connector without `place` can report on orders and cannot create
 * them, which is the safer default for an adapter somebody is still building.
 */
export type PlacementRequest = {
  idempotencyKey: string;
  currency: string;
  totalMinor: number;
  lines: readonly { description: string; quantity: number; unitPriceMinor: number }[];
};

export type PlacementResult =
  | { placed: true; externalOrderId: string; expectedAt: Date | null }
  | { placed: false; code: string; reason: string };

export type PlacingCommerceConnector = CommerceConnector & {
  place(context: ConnectorContext, request: PlacementRequest): Promise<PlacementResult>;
};

export function canPlace(connector: CommerceConnector): connector is PlacingCommerceConnector {
  return typeof (connector as PlacingCommerceConnector).place === "function";
}

export type PlacementRefusal =
  | "not_previewed"
  | "not_approved"
  | "amount_changed"
  | "provider_cannot_place"
  | "provider_not_live";

export type PlacementCheck =
  | { mayPlace: true }
  | { mayPlace: false; code: PlacementRefusal; reason: string };

/**
 * Whether an order may actually be sent to a merchant (17-005, 09-004).
 *
 * The criterion is that expected cost and quantity are shown "before any
 * purchase side effect occurs", and this is where that stops being a
 * description of a screen and becomes a rule. A placement must carry the
 * preview it was approved against, and the totals must still match — an order
 * repriced between the preview and the click is a different order.
 *
 * `prepareOrder` produces the preview and the policy decision; this decides
 * whether the pair in hand is still good enough to act on.
 */
export function mayPlaceOrder(input: {
  connector: CommerceConnector | null;
  /** The decision `evaluatePurchase` reached when the household was shown this. */
  previewed: { outcome: "allow" | "needs_approval" | "refuse"; totalMinor: number } | null;
  /** Whether a person has since approved it. Irrelevant when the policy allowed it outright. */
  approved: boolean;
  /** What the order costs now. */
  totalMinor: number;
}): PlacementCheck {
  if (!input.previewed) {
    return {
      mayPlace: false,
      code: "not_previewed",
      reason: "Nothing has been priced yet, so there is nothing to agree to.",
    };
  }

  if (input.previewed.outcome === "refuse") {
    return {
      mayPlace: false,
      code: "not_approved",
      reason: "The household's rules refuse this purchase.",
    };
  }

  if (input.previewed.outcome === "needs_approval" && !input.approved) {
    return {
      mayPlace: false,
      code: "not_approved",
      reason: "This is waiting for somebody to approve it.",
    };
  }

  if (input.previewed.totalMinor !== input.totalMinor) {
    return {
      mayPlace: false,
      code: "amount_changed",
      reason: "The price changed after this was shown, so it needs agreeing to again.",
    };
  }

  if (!input.connector) {
    return {
      mayPlace: false,
      code: "provider_not_live",
      reason:
        "No merchant is configured. A provider goes live only once its credentials, consent flow and integration tests are in place.",
    };
  }

  if (!canPlace(input.connector)) {
    return {
      mayPlace: false,
      code: "provider_cannot_place",
      reason: "This merchant connection can follow orders but cannot place them.",
    };
  }

  return { mayPlace: true };
}
