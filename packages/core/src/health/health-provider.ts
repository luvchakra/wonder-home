import { ApiError } from "../api/errors";

/**
 * The provider-neutral abstraction a fitness goal or session's data claims
 * to have come from (story 21-008).
 *
 * The same discipline `health_vitals.source_type` already established one
 * entity earlier: Manual, HomeTalk, HomeSend and Calendar are genuinely
 * live paths that already exist in this codebase today, each turning
 * something a person actually did into a canonical fitness record. Apple
 * HealthKit, Android Health Connect and a generic wearable are declared
 * members of the same type — so every fitness API contract, form and
 * executor is already shaped to accept one — but none of the three is live:
 * `assertHealthProviderLive` throws for all of them until a real connector,
 * credentials, consent UI and disconnect/revoke exist for that specific
 * provider (CLAUDE.md's external-providers rule). `fitness.ts`'s domain
 * services depend only on this module, never on a provider SDK — there is
 * none to depend on yet, and that is the point.
 */

export const HEALTH_PROVIDER_IDS = [
  "manual",
  "home_talk",
  "home_send",
  "calendar",
  "apple_health_kit",
  "android_health_connect",
  "wearable",
] as const;
export type HealthProviderId = (typeof HEALTH_PROVIDER_IDS)[number];

export type HealthProvider = {
  readonly id: HealthProviderId;
  /** Safe to show a household — never a provider's own product name jargon. */
  readonly label: string;
  /**
   * Whether this is a real integration or a declared placeholder. A provider
   * with `live: false` is never reported to a household as connected, and no
   * write may claim it — see `assertHealthProviderLive`.
   */
  readonly live: boolean;
};

export const HEALTH_PROVIDERS: Readonly<Record<HealthProviderId, HealthProvider>> = {
  manual: { id: "manual", label: "Entered by hand", live: true },
  home_talk: { id: "home_talk", label: "Logged through HomeTalk", live: true },
  home_send: { id: "home_send", label: "From a HomeSend upload", live: true },
  calendar: { id: "calendar", label: "Imported from a calendar", live: true },
  apple_health_kit: { id: "apple_health_kit", label: "Apple Health", live: false },
  android_health_connect: { id: "android_health_connect", label: "Android Health Connect", live: false },
  wearable: { id: "wearable", label: "A connected wearable", live: false },
};

export function resolveHealthProvider(id: HealthProviderId): HealthProvider {
  return HEALTH_PROVIDERS[id];
}

export function isLiveHealthProvider(id: HealthProviderId): boolean {
  return HEALTH_PROVIDERS[id].live;
}

/**
 * Refuses any write claiming a provider this codebase cannot yet honestly
 * connect to — the one place that stands between "declared" and "claimed
 * live" for the three inert providers.
 */
export function assertHealthProviderLive(id: HealthProviderId): HealthProvider {
  const provider = resolveHealthProvider(id);
  if (!provider.live) {
    throw ApiError.badRequest(`${provider.label} is not connected yet — WonderHome does not have a live connection to it.`);
  }
  return provider;
}
