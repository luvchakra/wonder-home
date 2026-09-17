import { createFixtureConnector, type FixtureOptions } from "../integrations/registry";
import type { Connector } from "../integrations/connector";

/**
 * Orders and merchants (stories 09-003, 09-005, 09-006, 09-008).
 *
 * An order's lifecycle matters here for one reason: the household's outcomes
 * depend on it. "Everyone has clean clothes" waits on detergent arriving, and
 * the criterion is that an order's status can resolve or replan a dependent
 * outcome "without generating duplicate notifications" — so the transition, not
 * the polling, is what speaks, and only when the transition is new.
 */

export const ORDER_STATUSES = [
  "draft",
  "pending_approval",
  "placed",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
  "failed",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type Order = {
  id: string;
  provider: string;
  status: OrderStatus;
  totalMinor: number;
  currency: string;
  placedAt: Date | null;
  expectedAt: Date | null;
  deliveredAt: Date | null;
  /** The household's own key, so a provider timeout is safe to retry. */
  idempotencyKey: string | null;
};

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  draft: ["pending_approval", "placed", "cancelled"],
  pending_approval: ["placed", "cancelled", "failed"],
  placed: ["confirmed", "shipped", "delivered", "cancelled", "failed"],
  confirmed: ["shipped", "delivered", "cancelled", "failed"],
  shipped: ["delivered", "failed"],
  // Terminal. A delivery that turns out to be wrong is a new order or a return,
  // not a rewind — otherwise the history stops meaning anything.
  delivered: [],
  cancelled: [],
  failed: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export type OutcomeEffect =
  | { kind: "none"; because: string }
  | { kind: "resolve"; because: string }
  | { kind: "replan"; because: string; expectedAt: Date | null }
  | { kind: "escalate"; because: string };

/**
 * What an order's new status does to the outcome that was waiting on it.
 *
 * `previous` is required, and that is the whole defence against duplicate
 * notifications: a poll that sees "shipped" for the fourth time produces
 * nothing, because nothing changed. Only an actual transition can speak.
 */
export function outcomeEffect(previous: OrderStatus, next: OrderStatus, order: Pick<Order, "expectedAt">): OutcomeEffect {
  if (previous === next) {
    return { kind: "none", because: "Nothing has changed since the last time we looked." };
  }

  switch (next) {
    case "delivered":
      return { kind: "resolve", because: "It arrived, so whatever was waiting on it can go ahead." };
    case "shipped":
    case "confirmed":
      return {
        kind: "replan",
        because: "The delivery date is firmer now.",
        expectedAt: order.expectedAt,
      };
    case "cancelled":
    case "failed":
      // Somebody has to decide what happens instead, and only a person can.
      return { kind: "escalate", because: "The order will not arrive, so the plan needs somebody." };
    case "placed":
      return { kind: "replan", because: "It is on its way.", expectedAt: order.expectedAt };
    default:
      return { kind: "none", because: "Nothing that changes a household plan." };
  }
}

/**
 * Whether a delivery is late enough to matter.
 *
 * Not the moment it passes the estimate — couriers are late by an hour all the
 * time and a household does not need to hear about it. What matters is when
 * being late starts to threaten something the family was counting on.
 */
export const LATE_AFTER_HOURS = 24;

export function isLate(order: Order, now: Date = new Date()): boolean {
  if (!order.expectedAt) return false;
  if (order.status === "delivered" || order.status === "cancelled" || order.status === "failed") return false;

  return now.getTime() - order.expectedAt.getTime() > LATE_AFTER_HOURS * 3_600_000;
}

/**
 * A stable key for one intended purchase (09-004).
 *
 * Derived from what is being bought rather than from a clock, so the retry of a
 * timed-out placement produces the same key and the merchant can recognise it.
 * A random key per attempt would make idempotency decorative.
 */
export function idempotencyKeyFor(input: {
  householdId: string;
  provider: string;
  lineItems: readonly { consumableId: string | null; description: string; quantity: number }[];
  /** The day the order is for, so tomorrow's identical order is a new one. */
  forDate: string;
}): string {
  const lines = [...input.lineItems]
    .map((item) => `${item.consumableId ?? item.description}x${item.quantity}`)
    .sort()
    .join("|");

  return `${input.householdId}:${input.provider}:${input.forDate}:${lines}`;
}

export type Offer = {
  provider: string;
  priceMinor: number;
  currency: string;
  available: boolean;
  deliveryDays: number | null;
  observedAt: Date;
};

/** How long a price is worth comparing against. Older than this is folklore. */
export const OFFER_FRESHNESS_HOURS = 24;

export type Comparison =
  | { chosen: Offer; because: string; alternatives: Offer[] }
  | { chosen: null; because: string; alternatives: Offer[] };

/**
 * Which merchant to buy from (story 09-008).
 *
 * Cheapest is not automatically best: an offer that arrives after the household
 * needs the thing is worth nothing, so availability and timing are filters and
 * price decides among what is left. Stale prices are excluded rather than
 * trusted, because quoting yesterday's price as today's is a small lie that
 * shows up on a bill.
 */
export function compareOffers(
  offers: readonly Offer[],
  options: { neededInDays?: number | null; now?: Date } = {},
): Comparison {
  const now = options.now ?? new Date();

  const fresh = offers.filter(
    (offer) => (now.getTime() - offer.observedAt.getTime()) / 3_600_000 <= OFFER_FRESHNESS_HOURS,
  );
  if (fresh.length === 0) {
    return { chosen: null, because: "No recent prices to compare.", alternatives: [] };
  }

  const inStock = fresh.filter((offer) => offer.available);
  if (inStock.length === 0) {
    return { chosen: null, because: "Nobody has it in stock.", alternatives: fresh };
  }

  const inTime =
    options.neededInDays == null
      ? inStock
      : inStock.filter((offer) => offer.deliveryDays === null || offer.deliveryDays <= options.neededInDays!);

  if (inTime.length === 0) {
    return {
      chosen: null,
      because: "Nobody can deliver it in time.",
      alternatives: inStock,
    };
  }

  const sorted = [...inTime].sort((a, b) => a.priceMinor - b.priceMinor);
  const chosen = sorted[0]!;
  const runnerUp = sorted[1];

  return {
    chosen,
    because: runnerUp
      ? `Cheapest of ${inTime.length} that can deliver in time, by ${((runnerUp.priceMinor - chosen.priceMinor) / 100).toFixed(2)}.`
      : "The only one that can deliver it in time.",
    alternatives: sorted.slice(1),
  };
}

/** What every commerce adapter must produce, whatever the merchant calls it. */
export type CommercePayload = {
  externalOrderId: string;
  status: OrderStatus;
  totalMinor?: number;
  currency?: string;
  expectedAt?: string | null;
};

export type CommerceConnector = Connector<CommercePayload>;

export function createFixtureCommerceConnector(
  options: Omit<FixtureOptions<CommercePayload>, "kind">,
): CommerceConnector {
  return createFixtureConnector<CommercePayload>({ ...options, kind: "commerce" });
}
