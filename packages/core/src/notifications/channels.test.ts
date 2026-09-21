import { describe, expect, it } from "vitest";

import {
  CHANNEL_ADAPTERS,
  anyDelivered,
  channelLabel,
  dispatchToChannels,
  emailAdapter,
  inAppAdapter,
  pushAdapter,
  selectChannels,
  whatsappAdapter,
  type ChannelAdapter,
  type ChannelNotification,
  type ChannelPreference,
  type DeliveryChannel,
} from "./channels";

const NOW = new Date("2026-09-17T14:00:00Z"); // 14:00 UTC

const notification = (over: Partial<ChannelNotification> = {}): ChannelNotification => ({
  title: "Laundry is at risk",
  body: "It will not be ready for the week unless something changes",
  priority: "normal",
  ...over,
});

const preference = (over: Partial<ChannelPreference> = {}): ChannelPreference => ({
  channel: "in_app",
  enabled: true,
  quietFrom: null,
  quietUntil: null,
  target: null,
  ...over,
});

describe("selectChannels", () => {
  it("skips a disabled channel", () => {
    const selected = selectChannels([preference({ enabled: false })], notification(), NOW);
    expect(selected).toHaveLength(0);
  });

  it("skips push and whatsapp without an address on file", () => {
    const selected = selectChannels(
      [preference({ channel: "push", target: null }), preference({ channel: "whatsapp", target: null })],
      notification(),
      NOW,
    );
    expect(selected).toHaveLength(0);
  });

  it("email needs no stored address — it resolves from the account", () => {
    const selected = selectChannels([preference({ channel: "email", target: null })], notification(), NOW);
    expect(selected.map((s) => s.channel)).toEqual(["email"]);
  });

  it("in_app needs no address either", () => {
    const selected = selectChannels([preference({ channel: "in_app", target: null })], notification(), NOW);
    expect(selected).toHaveLength(1);
  });

  it("attempts push and whatsapp once an address is on file", () => {
    const selected = selectChannels(
      [
        preference({ channel: "push", target: "sub-abc" }),
        preference({ channel: "whatsapp", target: "+15551234567" }),
      ],
      notification(),
      NOW,
    );
    expect(selected.map((s) => s.channel).sort()).toEqual(["push", "whatsapp"]);
  });

  it("defers a channel in its own quiet hours", () => {
    // NOW is 14:00 UTC; quiet 13:00-15:00 covers it.
    const selected = selectChannels(
      [preference({ channel: "push", target: "sub-abc", quietFrom: 13, quietUntil: 15 })],
      notification(),
      NOW,
    );
    expect(selected).toHaveLength(0);
  });

  it("a critical notification overrides quiet hours", () => {
    const selected = selectChannels(
      [preference({ channel: "push", target: "sub-abc", quietFrom: 13, quietUntil: 15 })],
      notification({ priority: "critical" }),
      NOW,
    );
    expect(selected).toHaveLength(1);
  });

  it("each channel keeps its own quiet hours — one silenced does not silence another", () => {
    const selected = selectChannels(
      [
        preference({ channel: "push", target: "sub-abc", quietFrom: 13, quietUntil: 15 }),
        preference({ channel: "email", quietFrom: 2, quietUntil: 3 }),
      ],
      notification(),
      NOW,
    );
    expect(selected.map((s) => s.channel)).toEqual(["email"]);
  });
});

describe("adapters", () => {
  it("in_app always succeeds — the row already exists", async () => {
    const result = await inAppAdapter.send(notification(), null);
    expect(result).toEqual({ ok: true });
  });

  it("in_app is the only adapter marked live", () => {
    expect(inAppAdapter.live).toBe(true);
    expect(pushAdapter.live).toBe(false);
    expect(emailAdapter.live).toBe(false);
    expect(whatsappAdapter.live).toBe(false);
  });

  it("a fixture adapter without a target says so rather than pretending to send", async () => {
    const result = await pushAdapter.send(notification(), null);
    expect(result).toEqual({ ok: false, error: { code: "no_target", retryable: false, message: expect.any(String) } });
  });

  it("a fixture adapter with a target still never claims delivery — no provider is configured", async () => {
    const result = await whatsappAdapter.send(notification(), "+15551234567");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("not_configured");
  });

  it("every channel has an adapter registered", () => {
    const channels: DeliveryChannel[] = ["in_app", "push", "email", "whatsapp"];
    for (const channel of channels) {
      expect(CHANNEL_ADAPTERS[channel].channel).toBe(channel);
    }
  });
});

describe("dispatchToChannels", () => {
  it("reports every selected channel's own outcome, not just the first", async () => {
    const attempts = await dispatchToChannels(
      [preference({ channel: "in_app" }), preference({ channel: "email" }), preference({ channel: "push", target: null })],
      notification(),
      NOW,
    );
    // push is not selected at all (no target), so only in_app and email are attempted.
    expect(attempts.map((a) => a.channel).sort()).toEqual(["email", "in_app"]);
    expect(attempts.find((a) => a.channel === "in_app")?.result).toEqual({ ok: true });
    expect(attempts.find((a) => a.channel === "email")?.result.ok).toBe(false);
  });

  it("accepts a substitute adapter set, so a test never depends on a real fixture's behavior", async () => {
    const stub: ChannelAdapter = { channel: "push", live: true, send: async () => ({ ok: true }) };
    const attempts = await dispatchToChannels(
      [preference({ channel: "push", target: "sub-abc" })],
      notification(),
      NOW,
      { ...CHANNEL_ADAPTERS, push: stub },
    );
    expect(attempts).toEqual([{ channel: "push", result: { ok: true } }]);
  });
});

describe("anyDelivered", () => {
  it("is true once one channel succeeds, even if others failed", () => {
    expect(
      anyDelivered([
        { channel: "email", result: { ok: false, error: { code: "not_configured", retryable: false, message: "x" } } },
        { channel: "in_app", result: { ok: true } },
      ]),
    ).toBe(true);
  });

  it("is false when nothing was attempted", () => {
    expect(anyDelivered([])).toBe(false);
  });
});

describe("channelLabel", () => {
  it("names every channel", () => {
    expect(channelLabel("in_app")).toBe("In-app");
    expect(channelLabel("push")).toBe("Push");
    expect(channelLabel("email")).toBe("Email");
    expect(channelLabel("whatsapp")).toBe("WhatsApp");
  });
});
