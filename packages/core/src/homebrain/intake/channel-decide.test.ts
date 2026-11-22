import { describe, expect, it } from "vitest";
import { checkedRoute, decideChannelMessage, type ChannelDecider } from "./channel-decide";
import { asksAboutAThing } from "../../conversation/engine";

const model = (kind: string, route: "hometalk" | "homesend" | "both"): ChannelDecider => ({ provider: "anthropic", read: async () => ({ kind, route }) as never });
const down: ChannelDecider = { provider: "anthropic", read: async () => null };
const throws: ChannelDecider = { provider: "anthropic", read: async () => { throw new Error("refused"); } };

// The owner, 2026-11-22: "any kind of message should be analysed by ai and proper response should be given".
describe("HomeBrain decides what a channel message is: the model first", () => {
  it("takes the model's reading when it answers", async () => {
    expect(await decideChannelMessage({ text: "lovely weather today" }, model("small_talk", "hometalk"))).toEqual({ route: "hometalk", kind: "small_talk", source: "model" });
    expect(await decideChannelMessage({ text: "PTM on Saturday 10am" }, model("content", "homesend"))).toMatchObject({ route: "homesend", source: "model" });
  });

  it("never lets the model drop what was sent: a file or forward is always kept", async () => {
    expect((await decideChannelMessage({ text: "what's this?", media: true }, model("question", "hometalk"))).route).toBe("both");
    expect((await decideChannelMessage({ text: "hi", forwarded: true }, model("greeting", "hometalk"))).route).toBe("both");
    expect(checkedRoute({ text: null, media: true }, "homesend")).toBe("homesend");
  });

  it("answers a typed line once: 'both' with nothing attached is HomeTalk's, which files what it is told", () => {
    expect(checkedRoute({ text: "remind me about the PTM on Saturday" }, "both")).toBe("hometalk");
  });
});

describe("with no model, the rules decide (never the primary path)", () => {
  it.each([null, down, throws])("greetings and questions still reach HomeTalk (decider %#)", async (decider) => {
    for (const text of ["hello", "thanks", "👍", "whats the plan", "anything due this week", "kal ka plan kya hai", "no, it's on the 12th"]) {
      expect(await decideChannelMessage({ text }, decider)).toEqual({ route: "hometalk", kind: null, source: "rules" });
    }
  });

  it("keeps a file, and answers its words too when they ask", async () => {
    expect((await decideChannelMessage({ text: "remind me about this", media: true }, null)).route).toBe("both");
    expect((await decideChannelMessage({ text: null, media: true }, null)).route).toBe("homesend");
    expect((await decideChannelMessage({ text: "URGENT pay now at http://bit.ly/x", forwarded: true }, null)).route).toBe("homesend");
  });
});

describe("a lone thing asked about is a question", () => {
  it.each(["milk?", "school fees??", "Asmi's bus?"])("%s", (text) => expect(asksAboutAThing(text)).toBe(true));
  it.each(["add milk?", "milk", "what is the plan for the long weekend?"])("not %s", (text) => expect(asksAboutAThing(text)).toBe(false));
});
