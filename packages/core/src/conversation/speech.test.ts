import { describe, expect, it } from "vitest";

import { pickVoice } from "../components/ui/use-live-voice";
import { speakable, speechChunks, voiceQuality } from "./speech";

describe("a reply said out loud", () => {
  it("gives directions through screens instead of reading the arrow", () => {
    expect(speakable("Open Settings → AI Assistant to change it.")).toBe("Open Settings, then AI Assistant to change it.");
    expect(speakable("Go to More -> Manage Household")).toBe("Go to More, then Manage Household.");
  });

  it("says a link's words, never its address, and drops bare URLs", () => {
    expect(speakable("See [your bills](/bills) or https://example.com/x for more")).toBe("See your bills or for more.");
  });

  it("turns a list into sentences and drops the markup", () => {
    expect(speakable("Here is today:\n- **Milk** is low\n- Anya has a test")).toBe("Here is today. Milk is low. Anya has a test.");
  });

  it("says units, ratings and separators the way people do, without emoji", () => {
    expect(speakable("Toit · 4.4 km · ★4.5 🍕")).toBe("Toit, 4.4 kilometres, rated 4.5.");
    expect(speakable("About 450 m away & open now")).toBe("About 450 metres away and open now.");
  });

  it("leaves an ordinary sentence alone", () => {
    expect(speakable("Done. I added almond milk to the groceries.")).toBe("Done. I added almond milk to the groceries.");
    expect(speakable("   ")).toBe("");
  });
});

describe("choosing a browser voice", () => {
  it("prefers a natural voice over a robotic fallback in the same language", () => {
    const voices = [
      { name: "eSpeak English", lang: "en-IN" },
      { name: "Microsoft Ravi - English (India)", lang: "en-IN" },
      { name: "Google UK English Male", lang: "en-GB" },
      { name: "Microsoft Neerja Online (Natural) - English (India)", lang: "en-IN" },
    ];
    expect(pickVoice(voices, "en-IN")?.name).toBe("Microsoft Neerja Online (Natural) - English (India)");
    expect(voiceQuality({ name: "eSpeak" })).toBeLessThan(0);
  });
});

describe("speechChunks", () => {
  it("speaks the first sentence on its own, then the rest in whole sentences", () => {
    const reply = "You have three things today. Asmi has a maths test at 10 am. The electricity bill is due. Dinner is pasta.";
    expect(speechChunks(reply)).toEqual(["You have three things today.", "Asmi has a maths test at 10 am. The electricity bill is due. Dinner is pasta."]);
  });

  it("joins a first sentence too short to be worth a request with the next one", () => {
    expect(speechChunks("Done. Milk is on the list. Anything else?")).toEqual(["Done. Milk is on the list.", "Anything else?"]);
  });

  it("never splits a sentence, and keeps long replies to a few pieces", () => {
    const long = Array.from({ length: 12 }, (_, i) => `This is sentence number ${i + 1} of a long answer.`).join(" ");
    const chunks = speechChunks(long, { rest: 120 });
    expect(chunks.join(" ")).toBe(long);
    for (const chunk of chunks) expect(chunk).toMatch(/\.$/);
  });

  it("returns one piece for one sentence, and none for nothing", () => {
    expect(speechChunks("Nothing is due today")).toEqual(["Nothing is due today"]);
    expect(speechChunks("   ")).toEqual([]);
  });
});
