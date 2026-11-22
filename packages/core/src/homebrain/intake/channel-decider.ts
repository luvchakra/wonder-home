import type { SupabaseClient } from "@supabase/supabase-js";
import { readHouseholdKey } from "../../ai/credentials";
import { currentPlatformKey, resolveModelKey } from "../../ai/model-key";
import { routeToProvider } from "../../ai/privacy";
import { loadDataUse } from "../../ai/privacy-repository";
import { createChannelDecider, type ChannelDecider } from "./channel-decide";

/** The household's model for deciding what a channel message is, or null (no key, or its data-use policy says no): the rules decide then. */
export async function channelDeciderForHousehold(admin: SupabaseClient, householdId: string): Promise<ChannelDecider | null> {
  const [policy, householdKey] = await Promise.all([loadDataUse(admin, householdId), readHouseholdKey(householdId).catch(() => null)]);
  const key = resolveModelKey(householdKey, await currentPlatformKey());
  const route = routeToProvider({ provider: key.provider, keySource: key.source, policy, hasContent: true });
  return route.ok && key.provider && key.key ? createChannelDecider(key.provider, key.key) : null;
}
