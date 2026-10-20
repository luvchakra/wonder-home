import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type { Mailer, OutgoingMail } from "../email/mailer";
import { CHANNEL_ADAPTERS, channelAdaptersFromEnv, type ChannelNotification } from "./channels";
import { deliverNotification } from "./deliver";
import { createEmailAdapter, notificationMail, siteOrigin } from "./email";
import { EMAIL_DAILY_LIMIT, emailWorthSending } from "./push-gate";

const NOTE: ChannelNotification = { title: "Electricity bill due", body: "Due tomorrow — ₹2,840 to City Power.", priority: "high", url: "/notifications" };

function recordingMailer(result: Awaited<ReturnType<Mailer["send"]>> = { ok: true }) {
  const sent: OutgoingMail[] = [];
  const mailer: Mailer = { async send(mail) { sent.push(mail); return result; } };
  return { mailer, sent };
}

describe("emailWorthSending", () => {
  it("critical always goes, and high goes up to its ceiling", () => {
    expect(emailWorthSending({ priority: "critical", reason: "alert", sentToday: 99 })).toBe(true);
    expect(emailWorthSending({ priority: "high", reason: "alert", sentToday: EMAIL_DAILY_LIMIT.high - 1 })).toBe(true);
    expect(emailWorthSending({ priority: "high", reason: "alert", sentToday: EMAIL_DAILY_LIMIT.high })).toBe(false);
  });
  it("normal goes only as a reminder timed for this person, and low never", () => {
    expect(emailWorthSending({ priority: "normal", reason: "reminder", sentToday: 0 })).toBe(true);
    expect(emailWorthSending({ priority: "normal", reason: "alert", sentToday: 0 })).toBe(false);
    expect(emailWorthSending({ priority: "normal", reason: "reminder", sentToday: EMAIL_DAILY_LIMIT.normal })).toBe(false);
    expect(emailWorthSending({ priority: "low", reason: "reminder", sentToday: 0 })).toBe(false);
  });
});

describe("the message", () => {
  it("carries the notification's own words, one button back, and why it arrived", () => {
    const mail = notificationMail({ ...NOTE, emailWords: { open: "Ouvrir", why: "Vous recevez ceci car l'e-mail est activé." } }, "kunal@example.com", "https://home.wonderapps.biz");
    expect(mail).toMatchObject({ to: "kunal@example.com", subject: "Electricity bill due" });
    expect(mail.text).toContain("Due tomorrow — ₹2,840 to City Power.");
    expect(mail.text).toContain("Ouvrir: https://home.wonderapps.biz/notifications");
    expect(mail.text).toContain("Vous recevez ceci");
    expect(mail.html).toContain('href="https://home.wonderapps.biz/notifications"');
  });

  it("escapes every value: a title is text, never markup", () => {
    const mail = notificationMail({ ...NOTE, title: '<script>alert("x")</script>', body: "a & b" }, "a@b.co", "https://x.test");
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).toContain("a &amp; b");
  });

  it("only ever links inside WonderHome", () => {
    expect(notificationMail({ ...NOTE, url: "https://evil.example/x" }, "a@b.co", "https://x.test").text).toContain("https://x.test/notifications");
  });

  it("reads WonderHome's address from the deployment, with production as the default", () => {
    expect(siteOrigin({ NEXT_PUBLIC_SITE_URL: "https://home.example/" })).toBe("https://home.example");
    expect(siteOrigin({ VERCEL_ENV: "production", VERCEL_URL: "x.vercel.app" })).toBe("https://home.wonderapps.biz");
    expect(siteOrigin({})).toBe("https://home.wonderapps.biz");
  });
});

describe("the email adapter", () => {
  it("sends to one plain address and reports it as sent", async () => {
    const { mailer, sent } = recordingMailer();
    expect(await createEmailAdapter(mailer, {}).send(NOTE, "kunal@example.com")).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
  });

  it("has nowhere to send without an address, or with one that is not a single plain address", async () => {
    const { mailer, sent } = recordingMailer();
    const adapter = createEmailAdapter(mailer, {});
    for (const target of [null, "", "a@b.co, c@d.co", "Name <a@b.co>"]) {
      expect(await adapter.send(NOTE, target)).toMatchObject({ ok: false, error: { code: "no_target", retryable: false } });
    }
    expect(sent).toHaveLength(0);
  });

  it("says whether a failure is worth trying again", async () => {
    expect(await createEmailAdapter(recordingMailer({ ok: false, reason: "rejected" }).mailer, {}).send(NOTE, "a@b.co")).toMatchObject({ ok: false, error: { retryable: false } });
    expect(await createEmailAdapter(recordingMailer({ ok: false, reason: "unreachable" }).mailer, {}).send(NOTE, "a@b.co")).toMatchObject({ ok: false, error: { retryable: true } });
  });

  it("is live only where the deployment has a mailer", () => {
    expect(channelAdaptersFromEnv({}, null).email.live).toBe(false);
    expect(channelAdaptersFromEnv({}, recordingMailer().mailer).email.live).toBe(true);
  });
});

/** A database that answers each table with the rows it was given, and records what is written. */
function fakeDatabase(tables: Record<string, Record<string, unknown>[]>, options: { emailsToday?: number; user?: { email: string | null; email_confirmed_at: string | null } | null } = {}) {
  const writes: { table: string; values: unknown }[] = [];
  const client = {
    from(table: string) {
      const rows = () => tables[table] ?? [];
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        neq: () => chain,
        gte: () => chain,
        maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
        insert: (values: unknown) => {
          writes.push({ table, values });
          return Promise.resolve({ error: null });
        },
        update: () => chain,
        then: (resolve: (value: unknown) => void) => resolve({ data: rows(), count: options.emailsToday ?? 0, error: null }),
      };
      return chain;
    },
    auth: { admin: { getUserById: () => Promise.resolve({ data: { user: options.user === undefined ? { email: "kunal@example.com", email_confirmed_at: "2026-10-01T00:00:00Z" } : options.user } }) } },
  };
  return { client: client as unknown as SupabaseClient, writes };
}

const PREFERENCES = [{ channel: "email", enabled: true, quiet_from: null, quiet_until: null, target: null }];
const MEMBER = { profile_id: "u1", language: null, date_format: null, time_format: null, measurement_system: null };
const HOUSEHOLD = { timezone: "Asia/Kolkata", region: "IN", currency: "INR", measurement_system: "metric", default_language: "en" };
const input = { householdId: "h1", notificationId: "n1", recipientMemberId: "m1", notification: NOTE, reason: "reminder" as const };

describe("delivery by email", () => {
  it("mails the address of the member's own confirmed account, and records it in closed words", async () => {
    const { mailer, sent } = recordingMailer();
    const database = fakeDatabase({ notification_preferences: PREFERENCES, households: [HOUSEHOLD], household_members: [MEMBER] });
    const result = await deliverNotification(database.client, input, { ...CHANNEL_ADAPTERS, email: createEmailAdapter(mailer, {}) });
    expect(result).toEqual({ sent: ["email"], failed: [] });
    expect(sent[0]).toMatchObject({ to: "kunal@example.com", subject: "Electricity bill due" });
    expect(sent[0]!.text).toContain("Open in WonderHome");
    expect(database.writes[0]?.values).toEqual([{ household_id: "h1", notification_id: "n1", channel: "email", event_type: "sent", metadata: {} }]);
  });

  it("records no_target, and mails nobody, for a member with no confirmed account email", async () => {
    for (const user of [null, { email: "kunal@example.com", email_confirmed_at: null }, { email: null, email_confirmed_at: "2026-10-01T00:00:00Z" }]) {
      const { mailer, sent } = recordingMailer();
      const database = fakeDatabase({ notification_preferences: PREFERENCES, households: [HOUSEHOLD], household_members: [MEMBER] }, { user });
      const result = await deliverNotification(database.client, input, { ...CHANNEL_ADAPTERS, email: createEmailAdapter(mailer, {}) });
      expect(result).toEqual({ sent: [], failed: ["email"] });
      expect(sent).toHaveLength(0);
      expect(database.writes[0]?.values).toEqual([{ household_id: "h1", notification_id: "n1", channel: "email", event_type: "delivery_failed", metadata: { code: "no_target", retryable: false } }]);
    }
  });

  it("does not mail a low-priority note, or one past the day's ceiling", async () => {
    for (const [priority, emailsToday] of [["low", 0], ["normal", EMAIL_DAILY_LIMIT.normal]] as const) {
      const { mailer, sent } = recordingMailer();
      const database = fakeDatabase({ notification_preferences: PREFERENCES, households: [HOUSEHOLD], household_members: [MEMBER] }, { emailsToday });
      const result = await deliverNotification(database.client, { ...input, notification: { ...NOTE, priority } }, { ...CHANNEL_ADAPTERS, email: createEmailAdapter(mailer, {}) });
      expect(result).toEqual({ sent: [], failed: [] });
      expect(sent).toHaveLength(0);
    }
  });

  it("does nothing for a person who has not switched email on, or where there is no mailer", async () => {
    const off = recordingMailer();
    const notOn = fakeDatabase({ notification_preferences: [{ ...PREFERENCES[0], enabled: false }], households: [HOUSEHOLD], household_members: [MEMBER] });
    expect(await deliverNotification(notOn.client, input, { ...CHANNEL_ADAPTERS, email: createEmailAdapter(off.mailer, {}) })).toEqual({ sent: [], failed: [] });
    expect(off.sent).toHaveLength(0);
    const noMailer = fakeDatabase({ notification_preferences: PREFERENCES, households: [HOUSEHOLD], household_members: [MEMBER] });
    expect(await deliverNotification(noMailer.client, input, CHANNEL_ADAPTERS)).toEqual({ sent: [], failed: [] });
    expect(noMailer.writes).toEqual([]);
  });
});

describe("a kind of reminder kept off a channel (story 27-002)", () => {
  const MUTES = [{ category: "bills", channel: "email" }];
  const tables = { notification_preferences: PREFERENCES, households: [HOUSEHOLD], household_members: [MEMBER], notification_channel_mutes: MUTES };

  it("skips email for the kind the person keeps off it, and sends the rest", async () => {
    const off = recordingMailer();
    const bills = await deliverNotification(fakeDatabase(tables).client, { ...input, category: "bills" }, { ...CHANNEL_ADAPTERS, email: createEmailAdapter(off.mailer, {}) });
    expect(bills).toEqual({ sent: [], failed: [] });
    expect(off.sent).toHaveLength(0);

    const on = recordingMailer();
    const school = await deliverNotification(fakeDatabase(tables).client, { ...input, category: "school" }, { ...CHANNEL_ADAPTERS, email: createEmailAdapter(on.mailer, {}) });
    expect(school).toEqual({ sent: ["email"], failed: [] });
    expect(on.sent).toHaveLength(1);
  });

  it("never lets a mute hold back something critical", async () => {
    const { mailer, sent } = recordingMailer();
    const result = await deliverNotification(fakeDatabase(tables).client, { ...input, category: "bills", notification: { ...NOTE, priority: "critical" } }, { ...CHANNEL_ADAPTERS, email: createEmailAdapter(mailer, {}) });
    expect(result).toEqual({ sent: ["email"], failed: [] });
    expect(sent).toHaveLength(1);
  });

  it("sends as before when no kind is named", async () => {
    const { mailer, sent } = recordingMailer();
    expect(await deliverNotification(fakeDatabase(tables).client, input, { ...CHANNEL_ADAPTERS, email: createEmailAdapter(mailer, {}) })).toEqual({ sent: ["email"], failed: [] });
    expect(sent).toHaveLength(1);
  });
});
