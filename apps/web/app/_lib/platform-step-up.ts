import "server-only";

import { createIsolatedClient } from "@wonderhome/core/db/isolated";
import { createClient, verifyUser } from "@wonderhome/core/db/server";
import { log } from "@wonderhome/core/observability/logger";

export type StaffPasswordCheck = "ok" | "wrong" | "limited" | "unavailable";

/**
 * Re-authentication for a platform staff member before a destructive action.
 * The proof is the account's own password, checked server-side against
 * Supabase on a throwaway client (the same way the household step-up does,
 * `security/step-up-repository.ts`), so the caller's session is untouched.
 * Supabase rate limits sign-in itself; a 429 comes back as "limited".
 */
export async function confirmStaffPassword(password: string): Promise<StaffPasswordCheck> {
  try {
    const user = await verifyUser(await createClient());
    if (!user?.email || !password) return "wrong";
    const client = createIsolatedClient();
    const { error } = await client.auth.signInWithPassword({ email: user.email, password });
    if (error) return error.status === 429 ? "limited" : "wrong";
    await client.auth.signOut({ scope: "local" }).catch(() => undefined);
    return "ok";
  } catch {
    log.warn("platform step-up unavailable", { event: "platform_step_up_unavailable", allow: ["event"] });
    return "unavailable";
  }
}
