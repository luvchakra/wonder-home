import { describe, expect, it } from "vitest";

import { blocksFor, reasonForCode, sendTestNotification, type ChannelFacts } from "./channel-check";
import type { ChannelAdapter, DeliveryChannel } from "./channels";

const facts = (over: Partial<ChannelFacts> = {}): ChannelFacts => ({ channel: "email", live: true, enabled: true, hasTarget: true, inQuiet: false, sentToday: 0, ...over });

describe("blocksFor (story 27-003)", () => {
  it("is empty when the channel will reach the person", () => {
    expect(blocksFor(facts())).toEqual([]);
  });

  it("says the channel cannot send here at all, and nothing else", () => {
    expect(blocksFor(facts({ live: false, enabled: false, hasTarget: false }))).toEqual(["not_set_up"]);
  });

  it("names every reason, most basic first", () => {
    expect(blocksFor(facts({ enabled: false, hasTarget: false, inQuiet: true, sentToday: 6 }))).toEqual(["off", "no_address", "quiet_hours", "daily_limit"]);
  });

  it("calls a missing push registration a missing device and a missing email or number a missing address", () => {
    expect(blocksFor(facts({ channel: "push", hasTarget: false }))).toEqual(["no_device"]);
    expect(blocksFor(facts({ channel: "whatsapp", hasTarget: false }))).toEqual(["no_address"]);
  });

  it("uses each channel's own ceiling, and WhatsApp has none", () => {
    expect(blocksFor(facts({ channel: "push", sentToday: 3 }))).toEqual([]);
    expect(blocksFor(facts({ channel: "push", sentToday: 4 }))).toEqual(["daily_limit"]);
    expect(blocksFor(facts({ channel: "email", sentToday: 5 }))).toEqual([]);
    expect(blocksFor(facts({ channel: "whatsapp", sentToday: 99 }))).toEqual([]);
  });
});

describe("reasonForCode", () => {
  it("turns a provider's error code into the person's set-up reason", () => {
    expect(reasonForCode("not_configured", "email")).toBe("not_set_up");
    expect(reasonForCode("no_target", "push")).toBe("no_device");
    expect(reasonForCode("no_target", "whatsapp")).toBe("no_address");
    expect(reasonForCode("gone", "push")).toBe("no_device");
    expect(reasonForCode("unavailable", "email")).toBe("unreachable");
    expect(reasonForCode("whatever", "email")).toBe("refused");
  });
});

/** A database stand-in that answers each table the test send reads. */
function fakeAdmin(rows: { preference?: Record<string, unknown>; devices?: Record<string, unknown>[]; email?: string | null; profile?: boolean }) {
  const tables: Record<string, unknown[]> = {
    notification_preferences: rows.preference ? [rows.preference] : [],
    push_subscriptions: rows.devices ?? [],
    household_members: [{ profile_id: rows.profile === false ? null : "p1" }],
  };
  const query = (table: string) => {
    const result: Record<string, unknown> = {
      select: () => result,
      eq: () => result,
      neq: () => result,
      in: () => result,
      update: () => result,
      delete: () => result,
      maybeSingle: async () => ({ data: (tables[table] ?? [])[0] ?? null }),
      then: (resolve: (value: unknown) => unknown) => resolve({ data: tables[table] ?? [] }),
    };
    return result;
  };
  return {
    from: query,
    auth: { admin: { getUserById: async () => ({ data: { user: rows.email ? { email: rows.email, email_confirmed_at: "2026-01-01" } : null } }) } },
  } as never;
}

function adapter(channel: DeliveryChannel, send: ChannelAdapter["send"], live = true): ChannelAdapter {
  return { channel, live, send };
}
const adapters = (over: Partial<Record<DeliveryChannel, ChannelAdapter>>) =>
  ({
    in_app: adapter("in_app", async () => ({ ok: true })),
    push: adapter("push", async () => ({ ok: true }), false),
    email: adapter("email", async () => ({ ok: true }), false),
    whatsapp: adapter("whatsapp", async () => ({ ok: true }), false),
    ...over,
  }) as Record<DeliveryChannel, ChannelAdapter>;
const notification = { title: "Hello", body: "A test" };

describe("sendTestNotification", () => {
  it("is not set up when the deployment cannot send on that channel", async () => {
    const result = await sendTestNotification(fakeAdmin({}), { memberId: "m", channel: "email", notification }, adapters({}));
    expect(result).toEqual({ ok: false, reason: "not_set_up" });
  });

  it("says a channel that is switched off is off", async () => {
    const sent: string[] = [];
    const result = await sendTestNotification(
      fakeAdmin({ preference: { channel: "email", enabled: false }, email: "a@b.co" }),
      { memberId: "m", channel: "email", notification },
      adapters({ email: adapter("email", async (_n, to) => (sent.push(String(to)), { ok: true })) }),
    );
    expect(result).toEqual({ ok: false, reason: "off" });
    expect(sent).toEqual([]);
  });

  it("sends an email to the account's confirmed address, even in quiet hours", async () => {
    const sent: { to: string | null; title: string }[] = [];
    const result = await sendTestNotification(
      fakeAdmin({ preference: { channel: "email", enabled: true, quiet_from: 0, quiet_until: 23 }, email: "a@b.co" }),
      { memberId: "m", channel: "email", notification },
      adapters({ email: adapter("email", async (n, to) => (sent.push({ to, title: n.title }), { ok: true })) }),
    );
    expect(result).toEqual({ ok: true });
    expect(sent).toEqual([{ to: "a@b.co", title: "Hello" }]);
  });

  it("has no address when the account has no confirmed email", async () => {
    const result = await sendTestNotification(
      fakeAdmin({ preference: { channel: "email", enabled: true }, email: null }),
      { memberId: "m", channel: "email", notification },
      adapters({ email: adapter("email", async () => ({ ok: true })) }),
    );
    expect(result).toEqual({ ok: false, reason: "no_address" });
  });

  it("reports an unreachable mail server in the person's terms", async () => {
    const result = await sendTestNotification(
      fakeAdmin({ preference: { channel: "email", enabled: true }, email: "a@b.co" }),
      { memberId: "m", channel: "email", notification },
      adapters({ email: adapter("email", async () => ({ ok: false, error: { code: "unavailable", retryable: true, message: "x" } })) }),
    );
    expect(result).toEqual({ ok: false, reason: "unreachable" });
  });

  it("sends WhatsApp to the saved number, and has no address without one", async () => {
    const to: (string | null)[] = [];
    const wa = adapters({ whatsapp: adapter("whatsapp", async (_n, target) => (to.push(target), { ok: true })) });
    expect(await sendTestNotification(fakeAdmin({ preference: { channel: "whatsapp", enabled: true, target: "+919812345678" } }), { memberId: "m", channel: "whatsapp", notification }, wa)).toEqual({ ok: true });
    expect(to).toEqual(["+919812345678"]);
    expect(await sendTestNotification(fakeAdmin({ preference: { channel: "whatsapp", enabled: true, target: null } }), { memberId: "m", channel: "whatsapp", notification }, wa)).toEqual({ ok: false, reason: "no_address" });
  });

  it("has no device for push without a registered one, and counts the devices it reached", async () => {
    const push = adapters({ push: adapter("push", async () => ({ ok: true })) });
    expect(await sendTestNotification(fakeAdmin({}), { memberId: "m", channel: "push", notification }, push)).toEqual({ ok: false, reason: "no_device" });
    const device = { id: "d1", endpoint: "https://push.example/1", p256dh: "k", auth: "a" };
    expect(await sendTestNotification(fakeAdmin({ devices: [device, { ...device, id: "d2", endpoint: "https://push.example/2" }] }), { memberId: "m", channel: "push", notification }, push)).toEqual({ ok: true, devices: 2 });
  });
});
