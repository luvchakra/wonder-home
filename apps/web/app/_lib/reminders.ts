import { after } from "next/server";

import { createAdminClient } from "@wonderhome/core/db/admin";
import { RECONCILE_EVERY_MINUTES, reconcileHouseholdReminders } from "@wonderhome/core/notifications/reconcile";

/**
 * Keeping a household's reminders true to its records (module 23) whenever
 * someone uses the app — throttled per household, so this is one cheap
 * write most of the time. Never in the way of a page: after the response
 * by default, and a failure (no service key in a preview, a slow database)
 * leaves yesterday's reminders exactly as they were.
 */
export function reconcileRemindersSoon(householdId: string, now = Date.now()): void {
  // The database throttle (`claimReconcile`) is the real one; this only spares
  // it the round trips when this server instance asked for the same household
  // within the window, which on an active household is nearly every page.
  const last = lastAsked.get(householdId);
  if (last !== undefined && now - last < RECONCILE_EVERY_MINUTES * 60_000) return;
  lastAsked.set(householdId, now);
  if (lastAsked.size > 5000) lastAsked.delete(lastAsked.keys().next().value!);
  after(() => reconcileRemindersNow(householdId));
}

/** When this server instance last asked for each household's reminders to be reconciled. */
const lastAsked = new Map<string, number>();

/** For the screen that shows the reminders themselves, where they should be fresh before it reads. */
export async function reconcileRemindersNow(householdId: string, options: { force?: boolean } = {}): Promise<void> {
  try {
    await reconcileHouseholdReminders(createAdminClient(), householdId, options);
  } catch {
    // The feed still shows what was already there.
  }
}
