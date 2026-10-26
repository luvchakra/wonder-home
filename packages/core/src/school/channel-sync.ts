import { toChannelIntake, type SchoolChannelMessage, type SchoolChannelRef } from "./channels";
import type { SchoolChannel } from "./channel-repository";

/**
 * Polling the school channels a household tracks (story 08-031).
 *
 * The orchestration only, over injected ports, so it is testable without a
 * network or a database and carries no opinion about which portal a channel is
 * on. A live provider's adapter supplies `fetch`; today no adapter is live, so
 * in production nothing calls this with a real fetcher and nothing is polled —
 * the machinery is ready, honest about having no portal to read yet.
 *
 * Every message it files is untrusted: it goes to HomeSend to be understood and
 * confirmed, never written on its own. A channel with no member to file under
 * (its creator was removed) is skipped, not guessed at.
 */

export type ChannelMessageFetcher = (
  channel: SchoolChannelRef,
  cursor: string | null,
) => Promise<{ messages: SchoolChannelMessage[]; cursor: string | null }>;

export type ChannelIntake = {
  externalId: string;
  text: string;
  url?: string | null;
  from?: string | null;
  channelDescription?: string;
};

export type ChannelSyncPorts = {
  /** Ask the provider for messages since the channel's cursor. */
  fetch: ChannelMessageFetcher;
  /** File one message into HomeSend, under the given member, awaiting a person. */
  fileMessage(actor: { householdId: string; memberId: string }, intake: ChannelIntake): Promise<void>;
  /** Record where this channel's poll stopped, so the next one resumes. */
  recordPoll(channelId: string, lastMessageExternalId: string | null): Promise<void>;
};

export type ChannelSyncReport = {
  channelsPolled: number;
  filed: number;
  /** Channels skipped because no member could be the one who brought them in. */
  skippedNoActor: number;
};

export async function syncSchoolChannels(input: {
  householdId: string;
  channels: readonly SchoolChannel[];
  ports: ChannelSyncPorts;
}): Promise<ChannelSyncReport> {
  const report: ChannelSyncReport = { channelsPolled: 0, filed: 0, skippedNoActor: 0 };

  for (const channel of input.channels) {
    if (!channel.active) continue;
    if (!channel.createdBy) {
      report.skippedNoActor += 1;
      continue;
    }

    const ref: SchoolChannelRef = { provider: channel.provider, channelId: channel.channelId, url: channel.url };
    const { messages, cursor } = await input.ports.fetch(ref, channel.lastMessageExternalId);
    report.channelsPolled += 1;

    for (const message of messages) {
      const intake = toChannelIntake(ref, message);
      await input.ports.fileMessage(
        { householdId: input.householdId, memberId: channel.createdBy },
        { externalId: intake.externalId, text: intake.text, url: ref.url, from: message.from ?? null, channelDescription: intake.context.channel },
      );
      report.filed += 1;
    }

    // The cursor the provider returned, or the last message's own id, so a feed
    // that gives no cursor still resumes past what it just delivered.
    const lastId = cursor ?? messages[messages.length - 1]?.externalId ?? channel.lastMessageExternalId;
    await input.ports.recordPoll(channel.id, lastId ?? null);
  }

  return report;
}
