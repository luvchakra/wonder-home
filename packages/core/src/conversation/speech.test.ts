import { describe, expect, it } from "vitest";

import { pickVoice } from "../components/ui/use-live-voice";
import { speakable, speechChunks, voiceQuality, spokenSummary } from "./speech";

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

describe("a long reply is heard as a short summary", () => {
  const long = [
    "Here is what I know about Asmi. She goes to Podar International Thane (school day 08:00 to 14:30).",
    "",
    "- **Today** — Science paper of the Unit test, 10:00am to 11:00am, covering Chapter 1-4 → [School](/school)",
    "- **Thu 22 Oct** — Bounce School Trip at 8:00am, protected family time → [Family](/family)",
    "- **Food** — eats vegetarian; likes Indian food, pink pasta, pasta, garlic bread and pizza → [Meals](/meals)",
    "- **Birthday** — 9 December, next on Wed, 9 Dec 2026 → [Family](/family)",
    "- **Routines** — morning routine, room tidy, school bag and homework are looked after by Asmi",
    "- **Classes** — piano on Saturdays",
  ].join("\n");

  it("says the opening sentence, names what the list covers and points to the screen", () => {
    expect(spokenSummary(long, { language: "en", tail: "The rest is on screen.", more: (count) => `${count} more` })).toBe(
      "Here is what I know about Asmi. Today, Thu 22 Oct, Food, Birthday, Routines, and 1 more. The rest is on screen.",
    );
  });

  it("reads a short reply whole", () => {
    expect(spokenSummary("Added milk to the list. Say undo to take it back.", { tail: "The rest is on screen." })).toBe("Added milk to the list. Say undo to take it back.");
  });

  it("never speaks a word the reply did not have, apart from the tail", () => {
    const said = spokenSummary(long, { language: "en" });
    for (const word of said.replace(/[.,:]/g, "").split(/\s+/).filter((w) => w !== "and")) expect(long).toContain(word);
  });
});
