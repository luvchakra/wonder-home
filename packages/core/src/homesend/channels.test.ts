import { describe, expect, it } from "vitest";

import { channelOf, inboxSegments, inChannel, readInboxChannel } from "./channels";
import { HOME_SEND_SOURCES, type HomeSendSource } from "./items";

const item = (source: HomeSendSource, waiting = true) => ({ source, waiting });

describe("HomeSend inbox channels (story 14-016)", () => {
  it("puts every source in exactly one tab", () => {
    for (const source of HOME_SEND_SOURCES) {
      const tabs = (["whatsapp", "email", "uploads"] as const).filter((tab) => inChannel([item(source)], tab).length === 1);
      expect(tabs, source).toHaveLength(1);
      expect(tabs[0]).toBe(channelOf(source));
    }
    expect(channelOf("whatsapp_media")).toBe("whatsapp");
    expect(channelOf("email_attachment")).toBe("email");
    expect(channelOf("audio_note")).toBe("uploads");
  });

  it("reads anything unknown as All", () => {
    expect(readInboxChannel("whatsapp")).toBe("whatsapp");
    expect(readInboxChannel(["email", "uploads"])).toBe("email");
    expect(readInboxChannel("sms")).toBe("all");
    expect(readInboxChannel(undefined)).toBe("all");
  });

  it("shows no tabs when uploads are the only way in", () => {
    expect(inboxSegments([item("manual_upload")], { whatsapp: false, email: false })).toEqual([]);
  });

  it("offers WhatsApp once it is available, or once something came that way", () => {
    expect(inboxSegments([], { whatsapp: true, email: false }).map((segment) => segment.key)).toEqual(["all", "whatsapp", "uploads"]);
    expect(inboxSegments([item("whatsapp")], { whatsapp: false, email: false }).map((segment) => segment.key)).toEqual(["all", "whatsapp", "uploads"]);
    expect(inboxSegments([], { whatsapp: true, email: true }).map((segment) => segment.label)).toEqual(["All", "WhatsApp", "Email", "Uploads"]);
  });

  it("counts only what is waiting, and links each tab", () => {
    const segments = inboxSegments(
      [item("whatsapp"), item("whatsapp_media"), item("whatsapp", false), item("email"), item("pasted_text", false)],
      { whatsapp: true, email: true },
    );
    expect(Object.fromEntries(segments.map((segment) => [segment.key, segment.count]))).toEqual({ all: 3, whatsapp: 2, email: 1, uploads: 0 });
    expect(segments.find((segment) => segment.key === "all")?.href).toBe("/home-send");
    expect(segments.find((segment) => segment.key === "whatsapp")?.href).toBe("/home-send?channel=whatsapp");
  });
});
