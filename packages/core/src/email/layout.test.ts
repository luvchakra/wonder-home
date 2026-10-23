import { describe, expect, it } from "vitest";

import { notificationMail } from "../notifications/email";
import { inviteEmail } from "../identity/invite-email";
import { firstName, renderEmailLayout } from "./layout";

const origin = "https://home.wonderapps.biz";

describe("every WonderHome email is a complete, signed-off message", () => {
  it("is a whole document with a language, a charset, a preview line, the sender and why it came", () => {
    const { html, text } = renderEmailLayout({ origin, lang: "hi", preheader: "Electricity is due tomorrow", bodyHtml: "<p>Body</p>", bodyText: "Body", reason: "Because email is on.", links: [{ label: "Privacy", href: "/legal" }] });
    expect(html).toMatch(/^<!doctype html>\n<html lang="hi"><head><meta charset="utf-8">/);
    expect(html).toContain("<title>WonderHome</title>");
    expect(html).toContain("Electricity is due tomorrow");
    expect(html).toContain('src="https://home.wonderapps.biz/icon-192.png"');
    expect(html).toContain("WonderHome · home.wonderapps.biz");
    expect(html).toContain('href="https://home.wonderapps.biz/legal"');
    expect(text).toBe("Body\n\n—\nWonderHome · home.wonderapps.biz\nBecause email is on.\nPrivacy: https://home.wonderapps.biz/legal");
  });

  it("greets a notification's reader by name and links to the settings that control it", () => {
    const mail = notificationMail(
      { title: "Electricity", body: "Due tomorrow · ₹3,100. Pay by 24 Oct.", url: "/bills", priority: "normal", tag: "n1", emailWords: { open: "Open in WonderHome", why: "Email is on.", hello: "Hi Kunal,", settings: "Notification settings", privacy: "Privacy", off: "Turn email off" }, emailOff: "https://home.wonderapps.biz/email-off?t=x" },
      "kunal@example.com",
      origin,
    );
    expect(mail.subject).toBe("Electricity");
    expect(mail.html).toContain("Hi Kunal,");
    expect(mail.html).toContain('href="https://home.wonderapps.biz/bills"');
    expect(mail.html).toContain('href="https://home.wonderapps.biz/settings/notifications"');
    expect(mail.text.startsWith("Hi Kunal,\n\nElectricity\n\nDue tomorrow")).toBe(true);
    expect(mail.headers?.["List-Unsubscribe"]).toBe("<https://home.wonderapps.biz/email-off?t=x>");
  });

  it("escapes every value a person or a household typed", () => {
    const mail = notificationMail({ title: "<script>x</script>", body: "a & b", priority: "normal", tag: "n1", emailWords: { open: "Open", why: "Why", hello: "Hi <b>Eve</b>," } }, "e@example.com", origin);
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("Hi &lt;b&gt;Eve&lt;/b&gt;,");
    expect(mail.html).toContain("a &amp; b");
  });

  it("frames an invitation the same way, the link written out for a mail app that strips buttons", () => {
    const mail = inviteEmail({ to: "a@example.com", link: "https://home.wonderapps.biz/invite/abc", subject: "Join the Fills", greeting: "Hi Asha,", message: "Kunal invited you.", action: "Join", expiry: "The link works for 7 days.", footer: "Ignore this if you weren't expecting it.", privacy: "Privacy", lang: "en" });
    expect(mail.html).toContain('<meta charset="utf-8">');
    expect(mail.html).toContain(">https://home.wonderapps.biz/invite/abc</a>");
    expect(mail.text).toContain("Join: https://home.wonderapps.biz/invite/abc");
    expect(mail.text).toContain("Ignore this if you weren't expecting it.");
  });

  it("greets by first name only, and not at all without one", () => {
    expect(firstName("Kunal Chakrabarty")).toBe("Kunal");
    expect(firstName("  ")).toBeNull();
    expect(firstName(null)).toBeNull();
  });
});
