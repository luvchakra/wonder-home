import { describe, expect, it } from "vitest";

import { keyFingerprint } from "./key-alerts";
import { openPlatformKeyAlert, platformKeyMail, tellPlatformAdmins } from "./platform-key-alert";

const ENV = { WONDERHOME_AI_KEY: "sk-ant-platform-test", NEXT_PUBLIC_SITE_URL: "https://home.example" };
const NOW = new Date("2026-10-26T12:00:00Z");

/** A service-role client over one alert row, the staff list and their sign-in emails. */
function admin(alert: Record<string, unknown> | null, staff = [{ profile_id: "p-owner" }]) {
  const updates: Record<string, unknown>[] = [];
  const looked: string[] = [];
  const chain = (table: string) => {
    const query: Record<string, unknown> = {};
    const self = {
      select: () => self,
      eq: (column: string, value: unknown) => ((query[column] = value), self),
      is: () => self,
      in: () => self,
      limit: async () => ({ data: table === "platform_admins" ? staff : [], error: null }),
      maybeSingle: async () => {
        looked.push(String(query.key_fingerprint));
        return { data: alert && query.key_fingerprint === keyFingerprint(ENV.WONDERHOME_AI_KEY) ? alert : null, error: null };
      },
      update: (patch: Record<string, unknown>) => (updates.push(patch), self),
      then: (resolve: (value: unknown) => void) => resolve({ data: [{ id: "a-1" }], error: null }),
    };
    return self;
  };
  const client = {
    from: chain,
    rpc: async () => ({ data: 0, error: null }),
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: { email: `${id}@example.com` } } }) } },
  } as never;
  return { client, updates, looked };
}

const row = (over: Record<string, unknown> = {}) => ({ id: "a-1", provider: "anthropic", kind: "out_of_credits", failures: 3, first_seen_at: "2026-10-26T11:00:00Z", last_seen_at: "2026-10-26T11:58:00Z", platform_notified_at: null, ...over });

function mailer() {
  const sent: { to: string; subject: string; text: string }[] = [];
  return { sent, send: async (mail: { to: string; subject: string; text: string }) => (sent.push(mail), { ok: true as const }) };
}

describe("an alert on WonderHome's own AI key (14-048)", () => {
  it("is found by the platform key's fingerprint, and only while it is open", async () => {
    expect(await openPlatformKeyAlert(admin(row()).client, ENV)).toMatchObject({ id: "a-1", kind: "out_of_credits", notifiedAt: null });
    expect(await openPlatformKeyAlert(admin(null).client, ENV)).toBeNull();
    expect(await openPlatformKeyAlert(admin(row()).client, {})).toBeNull();
  });

  it("emails the platform's owners and operators, and stamps the alert", async () => {
    const db = admin(row(), [{ profile_id: "p-owner" }, { profile_id: "p-operator" }]);
    const mail = mailer();
    expect(await tellPlatformAdmins(db.client, mail, NOW, ENV)).toBe(2);
    expect(mail.sent.map((sent) => sent.to)).toEqual(["p-owner@example.com", "p-operator@example.com"]);
    expect(mail.sent[0]!.subject).toBe("WonderHome's own Anthropic key is out of credits");
    expect(mail.sent[0]!.text).not.toContain(ENV.WONDERHOME_AI_KEY);
    expect(db.updates).toEqual([{ platform_notified_at: NOW.toISOString() }]);
  });

  it("tells again only after a day, and waits for a quota refusal to last", async () => {
    const mail = mailer();
    expect(await tellPlatformAdmins(admin(row({ platform_notified_at: "2026-10-26T11:05:00Z" })).client, mail, NOW, ENV)).toBe(0);
    expect(await tellPlatformAdmins(admin(row({ kind: "quota_exhausted", first_seen_at: "2026-10-26T11:55:00Z" })).client, mail, NOW, ENV)).toBe(0);
    expect(await tellPlatformAdmins(admin(row()).client, null, NOW, ENV)).toBe(0);
    expect(mail.sent).toEqual([]);
  });

  it("tells again every day it stays open, saying which day (the one email of 14 Nov went unnoticed)", async () => {
    const mail = mailer();
    const db = admin(row({ first_seen_at: "2026-10-24T11:00:00Z", platform_notified_at: "2026-10-25T11:30:00Z" }));
    expect(await tellPlatformAdmins(db.client, mail, NOW, ENV)).toBe(1);
    expect(mail.sent[0]!.subject).toBe("Still not fixed, day 3: WonderHome's own Anthropic key is out of credits");
  });

  it("says what to do and what families see, never the key", () => {
    const mail = platformKeyMail({ provider: "google", kind: "key_rejected" }, "https://home.example", NOW, 4);
    expect(mail.subject).toBe("WonderHome's own Google key was refused as not valid");
    expect(mail.text).toContain("Create a new key in Google's console, save it in Platform admin → AI & providers, then press Test key.");
    expect(mail.text).toContain("4 things sent in since it started were kept unread");
  });
});
