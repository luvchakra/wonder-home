import { describe, expect, it } from "vitest";

import { escapeHtml, platformMailConfig, platformMailer, singleRecipient } from "./mailer";

const env = { WONDERHOME_SMTP_HOST: "smtpout.secureserver.net", WONDERHOME_SMTP_USER: "connect@wonderapps.biz", WONDERHOME_SMTP_PASSWORD: "not-a-real-password" };

describe("platformMailConfig", () => {
  it("is null — nothing offered — until host, user and password are all set", () => {
    expect(platformMailConfig({})).toBeNull();
    expect(platformMailConfig({ ...env, WONDERHOME_SMTP_PASSWORD: "" })).toBeNull();
    expect(platformMailer({})).toBeNull();
  });

  it("defaults to implicit TLS on 465 and a WonderHome sender", () => {
    expect(platformMailConfig(env)).toMatchObject({ port: 465, secure: true, from: "WonderHome <connect@wonderapps.biz>" });
  });

  it("uses STARTTLS on another port, and refuses a port that is not one", () => {
    expect(platformMailConfig({ ...env, WONDERHOME_SMTP_PORT: "587" })).toMatchObject({ port: 587, secure: false });
    expect(platformMailConfig({ ...env, WONDERHOME_SMTP_PORT: "mail" })).toBeNull();
  });
});

describe("singleRecipient", () => {
  it("takes one plain address and nothing that could add a recipient or a header", () => {
    expect(singleRecipient(" asha@example.com ")).toBe("asha@example.com");
    expect(singleRecipient("asha@example.com, eve@evil.test")).toBeNull();
    expect(singleRecipient("Asha <asha@example.com>")).toBeNull();
    expect(singleRecipient("asha@example.com\r\nBcc: eve@evil.test")).toBeNull();
    expect(singleRecipient("not an address")).toBeNull();
  });
});

describe("escapeHtml", () => {
  it("turns markup into text", () => {
    expect(escapeHtml(`<a href="x">Tom & "Jerry"</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;Tom &amp; &quot;Jerry&quot;&lt;/a&gt;");
  });
});
