import { describe, expect, it } from "vitest";

import { parseSchoolChannel, toChannelIntake, type ParseSchoolChannelResult, type SchoolChannelRef } from "./channels";

const reasonOf = (result: ParseSchoolChannelResult) => (result.ok ? null : result.reason);

describe("parseSchoolChannel", () => {
  it("recognises a Loop Learning channel link, the owner's example", () => {
    const result = parseSchoolChannel("https://www.looplearning.com/channel/2044541");
    expect(result).toEqual({
      ok: true,
      channel: { provider: "loop-learning", channelId: "2044541", url: "https://www.looplearning.com/channel/2044541" },
    });
  });

  it("normalises a trailing slash, a query and the bare host", () => {
    const withExtras = parseSchoolChannel("https://looplearning.com/channel/2044541/?ref=email");
    expect(withExtras.ok).toBe(true);
    expect(withExtras.ok && withExtras.channel.url).toBe("https://looplearning.com/channel/2044541");
  });

  it("refuses a host no provider claims", () => {
    expect(parseSchoolChannel("https://evil.example.com/channel/2044541")).toEqual({
      ok: false,
      reason: "unknown_provider",
    });
  });

  it("refuses a known host whose path is not a channel", () => {
    expect(reasonOf(parseSchoolChannel("https://www.looplearning.com/feed/2044541"))).toBe("unsupported_path");
    expect(reasonOf(parseSchoolChannel("https://www.looplearning.com/channel/"))).toBe("unsupported_path");
  });

  it("refuses something that is not a URL", () => {
    expect(reasonOf(parseSchoolChannel("not a link"))).toBe("invalid_url");
    expect(reasonOf(parseSchoolChannel("ftp://looplearning.com/channel/1"))).toBe("invalid_url");
  });
});

describe("toChannelIntake", () => {
  const channel: SchoolChannelRef = {
    provider: "loop-learning",
    channelId: "2044541",
    url: "https://www.looplearning.com/channel/2044541",
  };

  it("keys a message idempotently by provider, channel and message id", () => {
    const a = toChannelIntake(channel, { externalId: "m-1", text: "Homework: fractions page 12." });
    const b = toChannelIntake(channel, { externalId: "m-1", text: "Homework: fractions page 12." });
    expect(a.externalId).toBe("school_channel:loop-learning:2044541:m-1");
    expect(a.externalId).toBe(b.externalId);
    // A different channel with the same portal message id never collides.
    const other = toChannelIntake({ ...channel, channelId: "9" }, { externalId: "m-1", text: "x" });
    expect(other.externalId).not.toBe(a.externalId);
  });

  it("reads the sender, when known, ahead of the message, and names the channel", () => {
    const intake = toChannelIntake(channel, { externalId: "m-2", from: "Tulika ma'am", text: "PTM on Friday." });
    expect(intake.text).toBe("Tulika ma'am: PTM on Friday.");
    expect(intake.context).toEqual({
      channel: "a message in a Loop Learning class channel",
      url: "https://www.looplearning.com/channel/2044541",
    });
  });

  it("keeps the message as-is when no sender is given", () => {
    const intake = toChannelIntake(channel, { externalId: "m-3", from: "   ", text: "Holiday tomorrow." });
    expect(intake.text).toBe("Holiday tomorrow.");
  });
});
