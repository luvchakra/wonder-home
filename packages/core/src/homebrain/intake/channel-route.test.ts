import { describe, expect, it } from "vitest";
import { isSmallTalk, routeChannelMessage } from "./channel-route";

// No model anywhere here: the route is decided by rules alone, so a missing, refused or slow key
// never turns "hello" into a HomeSend item (the owner's WhatsApp, 2026-11-22).
describe("talk or keep, with no model", () => {
  it.each(["hello", "hi", "Hi there!", "hey wonderhome", "good morning", "thanks", "thank you so much 🙏", "ok", "bye", "help"])("small talk goes to HomeTalk: %s", (text) => {
    expect(isSmallTalk(text)).toBe(true);
    expect(routeChannelMessage({ text })).toBe("hometalk");
  });

  it.each(["whats the plan", "whats are the upcoming stuff", "what's coming up", "anything due this week", "is there milk?", "add milk to the list", "remind me to call the plumber at 5"])(
    "a question or everyday request goes to HomeTalk: %s",
    (text) => {
      expect(routeChannelMessage({ text })).toBe("hometalk");
    },
  );

  it("keeps a forward, a document, a photo, a notice and a link for HomeSend", () => {
    expect(routeChannelMessage({ text: "hello", forwarded: true })).toBe("homesend");
    expect(routeChannelMessage({ text: null, media: true })).toBe("homesend");
    expect(routeChannelMessage({ text: "what's this?", media: true })).toBe("homesend");
    expect(routeChannelMessage({ text: "Sports Day is on Friday. Children must bring a water bottle." })).toBe("homesend");
    expect(routeChannelMessage({ text: "Electricity bill ₹2,840 due 25 Sep" })).toBe("homesend");
    expect(routeChannelMessage({ text: "what about https://school.example/notice" })).toBe("homesend");
    expect(routeChannelMessage({ text: "PTM\nSaturday 10am" })).toBe("homesend");
  });

  it("never reads a greeting inside a longer line as small talk", () => {
    expect(isSmallTalk("hello parents, the PTM is on Saturday")).toBe(false);
    expect(isSmallTalk("thanks for paying the fees of 4500")).toBe(false);
  });
});
