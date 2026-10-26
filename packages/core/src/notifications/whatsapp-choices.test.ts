import { describe, expect, it, vi } from "vitest";

import { readInboundMessages } from "../whatsapp/inbound";
import { interactiveMessage, sendWhatsAppChoices, type WhatsAppConfig } from "./whatsapp";

/**
 * HomeTalk's answers to pick, on WhatsApp (principle 20): reply buttons for
 * three or fewer, a list for up to ten, the `say` carried in each id and read
 * back as those words, and plain text whenever the choices can't go.
 */

const config: WhatsAppConfig = { accessToken: "token", phoneNumberId: "123", templateName: "t", templateLanguage: "en" };
const QUESTION = "Coconut oil: How much should I get?";

describe("the interactive message", () => {
  it("three or fewer short choices are reply buttons, each id carrying its words", () => {
    const message = interactiveMessage("+919800000000", QUESTION, [{ label: "Yes", say: "yes" }, { label: "Not now", say: "not now" }], "Pick an answer");
    expect(message).toEqual({
      messaging_product: "whatsapp",
      to: "919800000000",
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: QUESTION },
        action: { buttons: [{ type: "reply", reply: { id: "say:yes", title: "Yes" } }, { type: "reply", reply: { id: "say:not now", title: "Not now" } }] },
      },
    });
  });

  it("four to ten are a list, with the pick button in the person's language", () => {
    const choices = ["500 ml", "1 litre", "2 litres", "Skip"].map((label) => ({ label, say: label.toLowerCase() }));
    const message = interactiveMessage("+919800000000", QUESTION, choices, "जवाब चुनें");
    expect(message?.interactive.type).toBe("list");
    expect(message?.interactive.action).toEqual({ button: "जवाब चुनें", sections: [{ rows: choices.map((choice) => ({ id: `say:${choice.say}`, title: choice.label })) }] });
  });

  it("'Another day…' (nothing to send) is left out: typing is that answer on WhatsApp", () => {
    const message = interactiveMessage("+91", QUESTION, [{ label: "Today", say: "today" }, { label: "Another day…", say: null }], "Pick an answer");
    expect(message?.interactive.action).toEqual({ buttons: [{ type: "reply", reply: { id: "say:today", title: "Today" } }] });
  });

  it("no buttons when a label can't be shown whole, there are more than ten, or the body is too long", () => {
    const long = { label: "A label far too long for any WhatsApp row", say: "x" };
    expect(interactiveMessage("+91", QUESTION, [long], "Pick an answer")).toBeNull();
    expect(interactiveMessage("+91", QUESTION, Array.from({ length: 11 }, (_, index) => ({ label: `${index}`, say: `${index}` })), "Pick an answer")).toBeNull();
    expect(interactiveMessage("+91", "x".repeat(1025), [{ label: "Yes", say: "yes" }], "Pick an answer")).toBeNull();
    expect(interactiveMessage("+91", QUESTION, [], "Pick an answer")).toBeNull();
  });
});

describe("sending", () => {
  const ok = (id: string) => new Response(JSON.stringify({ messages: [{ id }] }), { status: 200 });

  it("sends the interactive message inside the open window", async () => {
    const fetch = vi.fn(async () => ok("wamid.1"));
    const sent = await sendWhatsAppChoices(config, "+919800000000", QUESTION, [{ label: "Yes", say: "yes" }], "Pick an answer", fetch as unknown as typeof globalThis.fetch);
    expect(sent).toEqual({ ok: true, providerMessageId: "wamid.1", interactive: true });
    expect(JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body)).type).toBe("interactive");
  });

  it("falls back to the same words as plain text when WhatsApp refuses the interactive message", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 131009 } }), { status: 400 })).mockResolvedValueOnce(ok("wamid.2"));
    const sent = await sendWhatsAppChoices(config, "+919800000000", QUESTION, [{ label: "Yes", say: "yes" }], "Pick an answer", fetch as unknown as typeof globalThis.fetch);
    expect(sent).toEqual({ ok: true, providerMessageId: "wamid.2" });
    const fallback = JSON.parse(String((fetch.mock.calls[1] as unknown as [string, RequestInit])[1].body));
    expect(fallback).toMatchObject({ type: "text", text: { body: QUESTION } });
  });

  it("falls back to text when WhatsApp can't be reached, and when the choices can't go as buttons", async () => {
    const unreachable = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce(ok("wamid.3"));
    expect(await sendWhatsAppChoices(config, "+91", QUESTION, [{ label: "Yes", say: "yes" }], "Pick an answer", unreachable as unknown as typeof globalThis.fetch)).toEqual({ ok: true, providerMessageId: "wamid.3" });
    const plain = vi.fn(async () => ok("wamid.4"));
    await sendWhatsAppChoices(config, "+91", QUESTION, [{ label: "A label far too long for any WhatsApp row", say: "x" }], "Pick an answer", plain as unknown as typeof globalThis.fetch);
    expect(plain).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String((plain.mock.calls[0] as unknown as [string, RequestInit])[1].body)).type).toBe("text");
  });
});

describe("receiving a pick", () => {
  const delivery = (interactive: Record<string, unknown>) => ({
    entry: [{ changes: [{ value: { messages: [{ id: "wamid.in", from: "919800000000", timestamp: "1793000000", type: "interactive", interactive } ] } }] }],
  });

  it("a button or list reply HomeTalk offered reads as its say", () => {
    expect(readInboundMessages(delivery({ type: "button_reply", button_reply: { id: "say:not now", title: "Not now" } }))[0]).toMatchObject({ type: "text", text: "not now" });
    expect(readInboundMessages(delivery({ type: "list_reply", list_reply: { id: "say:1 litre", title: "1 लीटर" } }))[0]).toMatchObject({ type: "text", text: "1 litre" });
  });

  it("any other button reads as what it showed", () => {
    expect(readInboundMessages(delivery({ type: "button_reply", button_reply: { id: "other", title: "Stop" } }))[0]).toMatchObject({ text: "Stop" });
  });
});
