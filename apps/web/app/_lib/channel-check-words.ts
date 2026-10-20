import type { Translate, TranslationKey } from "@wonderhome/core/i18n/translate";
import type { ChannelBlock } from "@wonderhome/core/notifications/channel-check";
import type { RoutableChannel } from "@wonderhome/core/notifications/routing";

/** Why a channel may not reach someone, in their own language (story 27-003). The reasons are closed words; the sentence is ours, never a provider's. */
export function reasonWords(t: Translate, reason: ChannelBlock | "refused" | "unreachable", channel: RoutableChannel): string {
  const key = reason === "no_address" ? `channelCheck.reason.no_address.${channel === "email" ? "email" : "whatsapp"}` : `channelCheck.reason.${reason}`;
  return t(key as TranslationKey);
}
