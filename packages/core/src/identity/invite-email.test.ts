import { describe, expect, it } from "vitest";

import { inviteEmail } from "./invite-email";

const words = {
  to: "asha@example.com",
  link: "https://home.wonderapps.biz/invite/abc123",
  subject: "Join The Sharmas on WonderHome",
  greeting: "Hi Asha,",
  message: "Kunal invited you to join The Sharmas on WonderHome. Open this link to come in:",
  action: "Join The Sharmas",
  expiry: "The link works once and stops working after 7 days.",
  footer: "If you weren't expecting this, you can ignore this email.",
};

describe("inviteEmail", () => {
  it("carries the link as a button and written out, in plain text too", () => {
    const mail = inviteEmail(words);
    expect(mail).toMatchObject({ to: "asha@example.com", subject: "Join The Sharmas on WonderHome" });
    expect(mail.text).toContain("https://home.wonderapps.biz/invite/abc123");
    expect(mail.html.match(/href="https:\/\/home\.wonderapps\.biz\/invite\/abc123"/g)).toHaveLength(2);
    expect(mail.html).toContain("The link works once");
  });

  it("treats a household's name as text, never markup", () => {
    const mail = inviteEmail({ ...words, action: `Join <script>alert(1)</script>` });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });
});
