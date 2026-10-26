import { describe, expect, it } from "vitest";

import type { SchoolChannel } from "./channel-repository";
import { syncSchoolChannels, type ChannelIntake, type ChannelMessageFetcher } from "./channel-sync";

const channel = (over: Partial<SchoolChannel> = {}): SchoolChannel => ({
  id: "ch-1",
  householdId: "house-1",
  integrationId: "int-1",
  provider: "loop-learning",
  channelId: "2044541",
  url: "https://www.looplearning.com/channel/2044541",
  childMemberId: null,
  active: true,
  createdBy: "admin-1",
  lastMessageExternalId: null,
  lastPolledAt: null,
  ...over,
});

function ports(fetch: ChannelMessageFetcher) {
  const filed: { memberId: string; intake: ChannelIntake }[] = [];
  const polls: { channelId: string; cursor: string | null }[] = [];
  return {
    filed,
    polls,
    ports: {
      fetch,
      fileMessage: async (actor: { householdId: string; memberId: string }, intake: ChannelIntake) => {
        filed.push({ memberId: actor.memberId, intake });
      },
      recordPoll: async (channelId: string, cursor: string | null) => {
        polls.push({ channelId, cursor });
      },
    },
  };
}

describe("syncSchoolChannels", () => {
  it("files each message under the channel's member and advances the cursor", async () => {
    const p = ports(async () => ({
      messages: [
        { externalId: "m-1", text: "Homework: fractions." },
        { externalId: "m-2", text: "PTM on Friday.", from: "Tulika ma'am" },
      ],
      cursor: null,
    }));

    const report = await syncSchoolChannels({ householdId: "house-1", channels: [channel()], ports: p.ports });

    expect(report).toEqual({ channelsPolled: 1, filed: 2, skippedNoActor: 0 });
    expect(p.filed.map((f) => f.memberId)).toEqual(["admin-1", "admin-1"]);
    expect(p.filed[0]?.intake.externalId).toBe("school_channel:loop-learning:2044541:m-1");
    expect(p.filed[1]?.intake.text).toBe("Tulika ma'am: PTM on Friday.");
    // No cursor from the provider → resume past the last message's own id.
    expect(p.polls).toEqual([{ channelId: "ch-1", cursor: "m-2" }]);
  });

  it("resumes from the channel's cursor and honours a provider cursor", async () => {
    const seen: (string | null)[] = [];
    const p = ports(async (_ref, cursor) => {
      seen.push(cursor);
      return { messages: [{ externalId: "m-9", text: "Holiday Monday." }], cursor: "cursor-xyz" };
    });

    await syncSchoolChannels({ householdId: "house-1", channels: [channel({ lastMessageExternalId: "m-3" })], ports: p.ports });

    expect(seen).toEqual(["m-3"]);
    expect(p.polls).toEqual([{ channelId: "ch-1", cursor: "cursor-xyz" }]);
  });

  it("skips an inactive channel and one with no member to file under", async () => {
    const p = ports(async () => ({ messages: [{ externalId: "x", text: "hi" }], cursor: null }));
    const report = await syncSchoolChannels({
      householdId: "house-1",
      channels: [channel({ active: false }), channel({ id: "ch-2", createdBy: null })],
      ports: p.ports,
    });
    expect(report).toEqual({ channelsPolled: 0, filed: 0, skippedNoActor: 1 });
    expect(p.filed).toHaveLength(0);
  });
});
