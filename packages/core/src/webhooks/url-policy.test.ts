import { describe, expect, it } from "vitest";

import { validateWebhookUrl } from "./url-policy";

describe("validateWebhookUrl", () => {
  it("accepts a plain public https URL", () => {
    const result = validateWebhookUrl("https://example.com/hooks/wonderhome");
    expect(result.ok).toBe(true);
  });

  it("refuses a non-URL string", () => {
    expect(validateWebhookUrl("not a url").ok).toBe(false);
  });

  it("refuses http", () => {
    expect(validateWebhookUrl("http://example.com/hook").ok).toBe(false);
  });

  it("refuses a URL carrying credentials", () => {
    expect(validateWebhookUrl("https://user:pass@example.com/hook").ok).toBe(false);
  });

  it("refuses a disallowed port", () => {
    expect(validateWebhookUrl("https://example.com:6379/hook").ok).toBe(false);
  });

  it("allows the standard https port and 8443", () => {
    expect(validateWebhookUrl("https://example.com/hook").ok).toBe(true);
    expect(validateWebhookUrl("https://example.com:443/hook").ok).toBe(true);
    expect(validateWebhookUrl("https://example.com:8443/hook").ok).toBe(true);
  });

  it("refuses localhost", () => {
    expect(validateWebhookUrl("https://localhost/hook").ok).toBe(false);
  });

  it("refuses a private-range literal address", () => {
    expect(validateWebhookUrl("https://10.0.0.5/hook").ok).toBe(false);
    expect(validateWebhookUrl("https://192.168.1.1/hook").ok).toBe(false);
    expect(validateWebhookUrl("https://127.0.0.1/hook").ok).toBe(false);
  });

  it("refuses the cloud metadata address", () => {
    expect(validateWebhookUrl("https://169.254.169.254/hook").ok).toBe(false);
  });

  it("refuses the cloud metadata hostname", () => {
    expect(validateWebhookUrl("https://metadata.google.internal/hook").ok).toBe(false);
  });
});
