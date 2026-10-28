import { describe, expect, it } from "vitest";

import { config } from "./middleware";

// Next matches the pattern against the whole path, as a regular expression.
const runs = (path: string) => new RegExp(`^${config.matcher[0]}$`).test(path);

describe("which requests the session middleware sees (audit B9)", () => {
  it("runs on every page and every member-facing API route", () => {
    for (const path of ["/", "/today", "/ai", "/sign-in", "/platform-admin", "/household/settings", "/api/v1/households/h1/conversation", "/api/v1/households/h1/webhooks", "/api/v1/households/h1/webhooks/w1", "/api/v1/billing/checkout"]) {
      expect(runs(path), path).toBe(true);
    }
  });

  it("skips built assets, public files by extension and the webhooks other services call", () => {
    for (const path of ["/_next/static/chunks/a.js", "/_next/image", "/favicon.ico", "/sw.js", "/manifest.webmanifest", "/robots.txt", "/icon-192.png", "/brand/mark.svg", "/fonts/sora.woff2", "/api/v1/whatsapp/webhook", "/api/v1/billing/webhook", "/api/v1/billing/webhook/stripe", "/api/v1/homesend/email/webhook", "/api/v1/platform/webhook-delivery"]) {
      expect(runs(path), path).toBe(false);
    }
  });
});
