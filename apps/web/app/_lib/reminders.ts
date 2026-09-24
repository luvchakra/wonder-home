import { after } from "next/server";

import { createAdminClient } from "@wonderhome/core/db/admin";
import { reconcileHouseholdReminders } from "@wonderhome/core/notifications/reconcile";

/**
 * Keeping a household's reminders true to its records (module 23) whenever
 * someone uses the app — throttled per household, so this is one cheap
 * write most of the time. Never in the way of a page: after the response
 * by default, and a failure (no service key in a preview, a slow database)
 * leaves yesterday's reminders exactly as they were.
 */
export function reconcileRemindersSoon(householdId: string): void {
  after(() => reconcileRemindersNow(householdId));
}

/** For the screen that shows the reminders themselves, where they should be fresh before it reads. */
export async function reconcileRemindersNow(householdId: string, options: { force?: boolean } = {}): Promise<void> {
  try {
    await reconcileHouseholdReminders(createAdminClient(), householdId, options);
  } catch {
    // The feed still shows what was already there.
  }
}
