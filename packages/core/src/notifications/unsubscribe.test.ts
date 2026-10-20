import { describe, expect, it } from "vitest";

import { notificationMail } from "./email";
import { unsubscribeSecret, unsubscribeUrl, verifyUnsubscribe } from "./unsubscribe";

const MEMBER = "6f1c0c4e-7d34-4b2a-9c1e-0a5d2f3b4c5d";
const OTHER = "11111111-2222-4333-8444-555555555555";
const ENV = { WONDERHOME_LINK_SECRET: "a-long-enough-secret" };

const tokenOf = (url: string) => new URL(url).searchParams.get("t") ?? "";

describe("the unsubscribe link (story 27-009)", () => {
  it("names the member and verifies for that member only", () => {
    const url = unsubscribeUrl("https://home.example", MEMBER, ENV)!;
    expect(url.startsWith("https://home.example/api/v1/notifications/email-off?m=")).toBe(true);
    expect(verifyUnsubscribe(MEMBER, tokenOf(url), ENV)).toBe(true);
    expect(verifyUnsubscribe(OTHER, tokenOf(url), ENV)).toBe(false);
  });

  it("refuses a token made with another secret, a changed token, an empty one and a non-member id", () => {
    const token = tokenOf(unsubscribeUrl("https://x", MEMBER, ENV)!);
    expect(verifyUnsubscribe(MEMBER, token, { WONDERHOME_LINK_SECRET: "another-secret" })).toBe(false);
    expect(verifyUnsubscribe(MEMBER, `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`, ENV)).toBe(false);
    expect(verifyUnsubscribe(MEMBER, "", ENV)).toBe(false);
    expect(verifyUnsubscribe("not-an-id", token, ENV)).toBe(false);
  });

  it("falls back to the cron secret, and signs nothing with no secret at all", () => {
    expect(unsubscribeSecret({ CRON_SECRET: "cron" })).toBe("cron");
    expect(unsubscribeUrl("https://x", MEMBER, {})).toBeNull();
    expect(verifyUnsubscribe(MEMBER, "anything", {})).toBe(false);
  });

  it("is in the email as a line, a link and the mail app's own unsubscribe header", () => {
    const off = unsubscribeUrl("https://home.example", MEMBER, ENV)!;
    const mail = notificationMail({ title: "Bill due", body: "Tomorrow", priority: "high", emailWords: { open: "Open", why: "Why", off: "Turn email off with one tap" }, emailOff: off }, "a@b.co", "https://home.example");
    expect(mail.text).toContain(`Turn email off with one tap: ${off}`);
    expect(mail.html).toContain("Turn email off with one tap");
    expect(mail.headers).toEqual({ "List-Unsubscribe": `<${off}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
  });

  it("has no unsubscribe line or header when the deployment cannot sign one", () => {
    const mail = notificationMail({ title: "Bill due", body: "Tomorrow", priority: "high" }, "a@b.co", "https://home.example");
    expect(mail.headers).toBeUndefined();
    expect(mail.text).not.toContain("email-off");
  });
});
