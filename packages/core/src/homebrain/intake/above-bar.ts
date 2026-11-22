import type { SupabaseClient } from "@supabase/supabase-js";

import { loadAutomationBar } from "../kind-bar-repository";
import { DEFAULT_AUTO_ADD_PERCENT } from "./auto-add";
import type { HomeSendKind } from "../../homesend/items";

/**
 * Is this reading more sure than the household's bar for `kind`? Above it, an
 * entry that is neither money nor health is added as confirmed whatever it was
 * read from: a photo, a file, text or voice (the owner, 2026-11-21: "why it's
 * still waiting? it automatically add in WonderHome"). Below it, Checking.
 * Same comparison as `confirmation.ts` (strictly more than the bar).
 */
export async function readsAboveTheBar(client: SupabaseClient, householdId: string, kind: HomeSendKind | null, score: number | null | undefined): Promise<boolean> {
  if (typeof score !== "number") return false;
  const percent = await loadAutomationBar(client, householdId, kind)
    .then((bar) => bar.percent)
    .catch(() => DEFAULT_AUTO_ADD_PERCENT);
  return score > percent / 100;
}
