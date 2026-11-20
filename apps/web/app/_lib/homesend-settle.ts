import { after } from "next/server";

import { adminClientFor, adminGrant } from "@wonderhome/core/db/admin-context";
import { runNeedsYouDeadlines } from "@wonderhome/core/hometalk/needs-you-run";
import type { HouseholdMembership } from "@wonderhome/core/identity/schemas";

/**
 * Settles what HomeSend can do on its own for one household at once, rather
 * than at the next ten-minute clock (the owner's 2026-11-20 review, part 2):
 * a payment proof marks the bill it paid, a matched bill with a newer amount
 * or date is updated, a document's several bills are added, each marked
 * Checking with Undo. The same deadlines pass the clock runs, with the service
 * role, after the response. A failure (no service key in a preview) leaves it
 * to the clock.
 */
export function settleHomeSendSoon(membership: HouseholdMembership): void {
  const householdId = membership.household.id;
  const run = async () => {
    try {
      // A signed-in member's own household only: the grant is scoped to it.
      const admin = adminClientFor(adminGrant.member(membership, "settle what HomeSend can do on its own for this household"), householdId);
      await runNeedsYouDeadlines(admin, { householdIds: [householdId], limit: 1 });
    } catch {
      // The clock's next pass does it.
    }
  };
  try {
    after(run);
  } catch {
    // Outside a request (a script, a test): the clock's next pass does it.
  }
}
