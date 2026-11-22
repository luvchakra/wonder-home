import type { SupabaseClient } from "@supabase/supabase-js";
import { readHouseholdKey } from "../../ai/credentials";
import { currentPlatformKey, resolveModelKey } from "../../ai/model-key";
import { routeToProvider } from "../../ai/privacy";
import { loadDataUse } from "../../ai/privacy-repository";
import { createTidyJudge, type TidyJudge } from "./tidy-model";

export async function judgeForHousehold(admin: SupabaseClient, householdId: string): Promise<TidyJudge | null> {
  const [policy, householdKey] = await Promise.all([loadDataUse(admin, householdId), readHouseholdKey(householdId).catch(() => null)]);
  const key = resolveModelKey(householdKey, (await currentPlatformKey()));
  const route = routeToProvider({ provider: key.provider, keySource: key.source, policy, hasContent: true });
  return route.ok && key.provider && key.key ? createTidyJudge(key.provider, key.key) : null;
}
