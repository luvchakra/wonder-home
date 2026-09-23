import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  fetchReceivedAttachment,
  fetchReceivedEmail,
  parseEmailReceivedEvent,
  platformResendConfig,
  toEmailSource,
  verifySvixSignature,
} from "./email-gateway";

const SECRET = "whsec_" + Buffer.from("a-test-signing-secret-32-bytes!!").toString("base64");

function sign(id: string, timestamp: string, rawBody: string, secret: string): string {
  const secretBase64 = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  const secretBytes = Buffer.from(secretBase64, "base64");
  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const digest = createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  return `v1,${digest}`;
}

describe("platformResendConfig", () => {
  it("is null when either the API key or the webhook secret is missing", () => {
    expect(platformResendConfig({})).toBeNull();
    expect(platformResendConfig({ RESEND_API_KEY: "re_x" })).toBeNull();
    expect(platformResendConfig({ RESEND_WEBHOOK_SECRET: SECRET })).toBeNull();
  });

  it("reads both when present", () => {
    expect(platformResendConfig({ RESEND_API_KEY: "re_x", RESEND_WEBHOOK_SECRET: SECRET })).toEqual({
      apiKey: "re_x",
      webhookSecret: SECRET,
    });
  });
});

describe("verifySvixSignature", () => {
  const rawBody = JSON.stringify({ type: "email.received", data: { email_id: "abc" } });
  const now = new Date("2026-09-22T00:00:00Z");
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const id = "msg_test123";

  it("accepts a genuinely valid Svix signature", () => {
    const signature = sign(id, timestamp, rawBody, SECRET);
    expect(verifySvixSignature({ headers: { id, timestamp, signature }, rawBody, secret: SECRET }, now)).toBe(true);
  });

  it("accepts when the header carries multiple space-separated signature versions", () => {
    const signature = sign(id, timestamp, rawBody, SECRET);
    const multi = `v0,not-a-real-sig ${signature}`;
    expect(verifySvixSignature({ headers: { id, timestamp, signature: multi }, rawBody, secret: SECRET }, now)).toBe(true);
  });

  it("rejects a signature computed over different content", () => {
    const signature = sign(id, timestamp, "different body", SECRET);
    expect(verifySvixSignature({ headers: { id, timestamp, signature }, rawBody, secret: SECRET }, now)).toBe(false);
  });

  it("rejects the right signature under the wrong secret", () => {
    const otherSecret = "whsec_" + Buffer.from("a-completely-different-secret!!").toString("base64");
    const signature = sign(id, timestamp, rawBody, otherSecret);
    expect(verifySvixSignature({ headers: { id, timestamp, signature }, rawBody, secret: SECRET }, now)).toBe(false);
  });

  it("rejects a stale timestamp outside the tolerance window", () => {
    const staleTimestamp = String(Math.floor(now.getTime() / 1000) - 3600);
    const signature = sign(id, staleTimestamp, rawBody, SECRET);
    expect(
      verifySvixSignature({ headers: { id, timestamp: staleTimestamp, signature }, rawBody, secret: SECRET }, now),
    ).toBe(false);
  });

  it("rejects when any header is missing", () => {
    const signature = sign(id, timestamp, rawBody, SECRET);
    expect(verifySvixSignature({ headers: { id: null, timestamp, signature }, rawBody, secret: SECRET }, now)).toBe(false);
    expect(verifySvixSignature({ headers: { id, timestamp: null, signature }, rawBody, secret: SECRET }, now)).toBe(false);
    expect(verifySvixSignature({ headers: { id, timestamp, signature: null }, rawBody, secret: SECRET }, now)).toBe(false);
  });
});

describe("parseEmailReceivedEvent", () => {
  it("parses a real envelope", () => {
    const event = parseEmailReceivedEvent(
      JSON.stringify({ type: "email.received", data: { email_id: "e1", to: ["hs-abc@inbox.example"], received_for: [] } }),
    );
    expect(event).toEqual({ type: "email.received", data: { email_id: "e1", to: ["hs-abc@inbox.example"], received_for: [] } });
  });

  it("returns null for malformed JSON", () => {
    expect(parseEmailReceivedEvent("not json")).toBeNull();
  });

  it("returns null when the shape does not match", () => {
    expect(parseEmailReceivedEvent(JSON.stringify({ type: "email.received" }))).toBeNull();
  });
});

describe("fetchReceivedEmail", () => {
  it("returns the parsed email on a 200 with a matching shape", async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ id: "e1", from: "sender@example.com", subject: "Hi", text: "Hello" }), { status: 200 })) as typeof fetch;
    const result = await fetchReceivedEmail("e1", "re_x", fakeFetch);
    expect(result).toMatchObject({ id: "e1", from: "sender@example.com", subject: "Hi", text: "Hello", html: null, attachments: [] });
  });

  it("keeps the HTML part of an HTML-only email, so it can be reduced to text rather than dropped", async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ id: "e2", from: "school@example.org", subject: "Notice", text: null, html: "<p>Sports Day</p>" }), { status: 200 })) as typeof fetch;
    expect(await fetchReceivedEmail("e2", "re_x", fakeFetch)).toMatchObject({ id: "e2", from: "school@example.org", subject: "Notice", text: null, html: "<p>Sports Day</p>" });
  });

  it("returns null on a non-2xx response", async () => {
    const fakeFetch = (async () => new Response("nope", { status: 404 })) as typeof fetch;
    expect(await fetchReceivedEmail("e1", "re_x", fakeFetch)).toBeNull();
  });

  it("returns null when the response body does not match the expected shape", async () => {
    const fakeFetch = (async () => new Response(JSON.stringify({ unexpected: true }), { status: 200 })) as typeof fetch;
    expect(await fetchReceivedEmail("e1", "re_x", fakeFetch)).toBeNull();
  });

  it("returns null rather than throwing when the network call itself fails", async () => {
    const fakeFetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    expect(await fetchReceivedEmail("e1", "re_x", fakeFetch)).toBeNull();
  });
});

describe("the email contract (Wave 3 §6)", () => {
  it("turns a provider message into the provider-neutral EmailSource", async () => {
    const fakeFetch = (async () =>
      new Response(
        JSON.stringify({
          id: "e3",
          from: "office@school.example.org",
          to: ["hs-abc@inbox.example"],
          cc: ["hs-def@inbox.example"],
          created_at: "2026-09-23T08:00:00Z",
          subject: "  Science Exhibition moved  ",
          text: "It moved to 29 September.",
          html: null,
          attachments: [{ id: "att-1", filename: "circular.pdf", content_type: "application/pdf", size: 1200 }],
        }),
        { status: 200 },
      )) as typeof fetch;
    const received = await fetchReceivedEmail("e3", "re_x", fakeFetch);
    expect(received).not.toBeNull();
    expect(toEmailSource(received!)).toEqual({
      externalId: "e3",
      from: "office@school.example.org",
      to: ["hs-abc@inbox.example"],
      cc: ["hs-def@inbox.example"],
      subject: "Science Exhibition moved",
      receivedAt: "2026-09-23T08:00:00Z",
      text: "It moved to 29 September.",
      html: null,
      attachmentIds: ["att-1"],
      attachments: [{ id: "att-1", filename: "circular.pdf", contentType: "application/pdf", size: 1200 }],
    });
  });
});

describe("fetchReceivedAttachment (Wave 3 §7)", () => {
  const PDF = new TextEncoder().encode("%PDF-1.4 circular");

  function provider(meta: Record<string, unknown>, bytes: Uint8Array = PDF) {
    const calls: string[] = [];
    const fakeFetch = (async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith("https://api.resend.com/")) return new Response(JSON.stringify(meta), { status: 200 });
      return new Response(new Blob([bytes as Uint8Array<ArrayBuffer>]), { status: 200 });
    }) as typeof fetch;
    return { fakeFetch, calls };
  }

  it("fetches the metadata, then the bytes from the signed link", async () => {
    const { fakeFetch, calls } = provider({ id: "att-1", filename: "circular.pdf", content_type: "application/pdf", size: PDF.length, download_url: "https://inbound-cdn.resend.com/att-1?sig=x" });
    const result = await fetchReceivedAttachment("e3", "att-1", "re_x", 1024 * 1024, fakeFetch);
    expect(result).toMatchObject({ ok: true, filename: "circular.pdf", contentType: "application/pdf" });
    expect(calls).toEqual(["https://api.resend.com/emails/receiving/e3/attachments/att-1", "https://inbound-cdn.resend.com/att-1?sig=x"]);
  });

  it("never follows a download link to anywhere but the provider", async () => {
    const { fakeFetch, calls } = provider({ id: "att-1", download_url: "http://169.254.169.254/latest/meta-data/" });
    expect(await fetchReceivedAttachment("e3", "att-1", "re_x", 1024, fakeFetch)).toEqual({ ok: false, reason: "unavailable" });
    expect(calls).toHaveLength(1);
  });

  it("refuses an attachment over the limit, declared or actual", async () => {
    const declared = provider({ id: "a", size: 5000, download_url: "https://inbound-cdn.resend.com/a" });
    expect(await fetchReceivedAttachment("e3", "a", "re_x", 1000, declared.fakeFetch)).toEqual({ ok: false, reason: "too_large" });
    const actual = provider({ id: "a", download_url: "https://inbound-cdn.resend.com/a" }, new Uint8Array(2000));
    expect(await fetchReceivedAttachment("e3", "a", "re_x", 1000, actual.fakeFetch)).toEqual({ ok: false, reason: "too_large" });
  });

  it("says unavailable, never throws, when the provider fails", async () => {
    const failing = (async () => new Response("no", { status: 500 })) as typeof fetch;
    expect(await fetchReceivedAttachment("e3", "a", "re_x", 1000, failing)).toEqual({ ok: false, reason: "unavailable" });
    const throwing = (async () => {
      throw new Error("down");
    }) as typeof fetch;
    expect(await fetchReceivedAttachment("e3", "a", "re_x", 1000, throwing)).toEqual({ ok: false, reason: "unavailable" });
  });
});
