"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "../db/server";

/**
 * Sign a member out (story 01-001's smallest honest version of auth UI).
 *
 * Shared rather than living only in `apps/web`'s auth routes, because the
 * nav drawer needs the same real action: signing out is a POST (an
 * unauthenticated link must never be able to do it to somebody), so the
 * drawer's row is a form around this action, not a link to a page that
 * happens to sign out on load.
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // Drop every screen this tab kept (next.config staleTimes) so the next person at this
  // device never sees the last one's. Clearing the cookie does this too; this says it.
  revalidatePath("/", "layout");
  redirect("/");
}
