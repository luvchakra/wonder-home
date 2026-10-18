import { describe, expect, it } from "vitest";

import { channelAdaptersFromEnv } from "./channels";
import { PUSH_DAILY_LIMIT, pushWorthSending } from "./push-gate";
import { createWebPushAdapter, parsePushTarget, pushPayload, webPushConfigFromEnv } from "./web-push";

const device = JSON.stringify({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) } });
const config = { publicKey: "pub", privateKey: "priv", subject: "mailto:support@wonderapps.biz" };

describe("pushWorthSending", () => {
  it("critical always buzzes, whatever came before", () => {
    expect(pushWorthSending({ priority: "critical", reason: "alert", sentToday: 99 })).toBe(true);
  });
  it("high buzzes up to its daily ceiling", () => {
    expect(pushWorthSending({ priority: "high", reason: "alert", sentToday: PUSH_DAILY_LIMIT.high - 1 })).toBe(true);
    expect(pushWorthSending({ priority: "high", reason: "alert", sentToday: PUSH_DAILY_LIMIT.high })).toBe(false);
  });
  it("normal buzzes only for a reminder timed for this person, within a tighter ceiling", () => {
    expect(pushWorthSending({ priority: "normal", reason: "reminder", sentToday: 0 })).toBe(true);
    expect(pushWorthSending({ priority: "normal", reason: "reminder", sentToday: PUSH_DAILY_LIMIT.normal })).toBe(false);
    expect(pushWorthSending({ priority: "normal", reason: "alert", sentToday: 0 })).toBe(false);
  });
  it("low never interrupts", () => {
    expect(pushWorthSending({ priority: "low", reason: "reminder", sentToday: 0 })).toBe(false);
  });
});

describe("web push", () => {
  it("is off until the deployment sets its key pair", () => {
    expect(webPushConfigFromEnv({})).toBeNull();
    expect(webPushConfigFromEnv({ WONDERHOME_VAPID_PUBLIC_KEY: "pub" })).toBeNull();
    expect(webPushConfigFromEnv({ WONDERHOME_VAPID_PUBLIC_KEY: "pub", WONDERHOME_VAPID_PRIVATE_KEY: "priv" })?.subject).toBe("mailto:support@wonderapps.biz");
    expect(webPushConfigFromEnv({ WONDERHOME_VAPID_PUBLIC_KEY: "pub", WONDERHOME_VAPID_PRIVATE_KEY: "priv", WONDERHOME_VAPID_SUBJECT: "not a contact" })).toBeNull();
    expect(channelAdaptersFromEnv({}).push.live).toBe(false);
    expect(channelAdaptersFromEnv({ WONDERHOME_VAPID_PUBLIC_KEY: "pub", WONDERHOME_VAPID_PRIVATE_KEY: "priv" }).push.live).toBe(true);
  });

  it("reads only a well-formed https subscription", () => {
    expect(parsePushTarget(device)?.endpoint).toBe("https://fcm.googleapis.com/fcm/send/abc");
    expect(parsePushTarget(JSON.stringify({ endpoint: "http://x", keys: { p256dh: "a", auth: "b" } }))).toBeNull();
    expect(parsePushTarget("not json")).toBeNull();
    expect(parsePushTarget(null)).toBeNull();
  });

  it("sends the words, where to open and the thread, never more than fits", () => {
    const payload = JSON.parse(pushPayload({ title: "Electricity bill due tomorrow", body: "₹2,340 to BSES — pay before 6 pm.", priority: "high", tag: "n-1" }));
    expect(payload).toEqual({ title: "Electricity bill due tomorrow", body: "₹2,340 to BSES — pay before 6 pm.", url: "/notifications", tag: "n-1", critical: false });
    expect(JSON.parse(pushPayload({ title: "x".repeat(500), body: "y".repeat(900), priority: "critical" })).title).toHaveLength(120);
  });

  it("asks for urgency by priority and keeps a reminder only while it is timely", async () => {
    const calls: { urgency: string; TTL: number }[] = [];
    const adapter = createWebPushAdapter(config, async (_target, _payload, options) => {
      calls.push(options);
      return { statusCode: 201 };
    });
    expect(await adapter.send({ title: "t", body: "b", priority: "critical" }, device)).toEqual({ ok: true });
    expect(await adapter.send({ title: "t", body: "b", priority: "normal" }, device)).toEqual({ ok: true });
    expect(calls).toEqual([
      { urgency: "high", TTL: 86_400 },
      { urgency: "normal", TTL: 4 * 3600 },
    ]);
  });

  it("says a device is gone when its push service does, so it is forgotten", async () => {
    const gone = createWebPushAdapter(config, async () => {
      throw Object.assign(new Error("Gone"), { statusCode: 410 });
    });
    const result = await gone.send({ title: "t", body: "b", priority: "high" }, device);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("gone");
    const down = createWebPushAdapter(config, async () => {
      throw Object.assign(new Error("Busy"), { statusCode: 503 });
    });
    const second = await down.send({ title: "t", body: "b", priority: "high" }, device);
    expect(!second.ok && second.error).toMatchObject({ code: "unavailable", retryable: true });
    expect((await gone.send({ title: "t", body: "b", priority: "high" }, null)).ok).toBe(false);
  });
});
