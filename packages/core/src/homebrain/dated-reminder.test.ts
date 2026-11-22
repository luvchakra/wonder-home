import { describe, expect, it } from "vitest";
import { datedThingInReminder, datedThingSentence, titleOf } from "./dated-reminder";

const NAMES = ["Asmi Chakraborty", "Manan", "Kunal Chakraborty"];
const read = (what: string, when: string | null, utterance = `remind me about ${what}`) => datedThingInReminder({ what, when, utterance }, NAMES);

describe("a reminder that names a dated thing (the owner, 2026-11-22)", () => {
  it("reads the exam in \"add a reminder for asmis music exam on 24th\"", () => {
    expect(read("asmis music exam", "24th", "add a reminder for asmis music exam on 24th")).toEqual({ title: "Asmi's music exam" });
  });

  it("reads a PTM, a match, a recital and a Hinglish exam", () => {
    expect(read("Asmi's PTM", "tomorrow")?.title).toBe("Asmi's PTM");
    expect(read("Manan's football match", "saturday")?.title).toBe("Manan's football match");
    expect(read("asmi ka music exam", "kal", "reminder kal Asmi ka music exam")?.title).toBe("Asmi's music exam");
    expect(read("the dance recital on 2 Oct", "2 Oct")?.title).toBe("Dance recital");
  });

  it("leaves a reminder to do something as a reminder", () => {
    expect(read("call mum", "today", "remind me to call mum at 6")).toBeNull();
    expect(read("pack Asmi's bag for the exam", "tomorrow")).toBeNull();
    expect(read("book the PTM slot", "tomorrow")).toBeNull();
  });

  it("never reads health or money here (Health and Bills keep their own rules)", () => {
    expect(read("Asmi's dentist appointment", "tomorrow")).toBeNull();
    expect(read("electricity bill payment", "25th")).toBeNull();
    expect(read("school fees", "friday")).toBeNull();
  });

  it("needs a day", () => {
    expect(read("Asmi's music exam", null)).toBeNull();
  });

  it("says it the way the household tells HomeTalk about a dated thing", () => {
    expect(datedThingSentence({ title: "Asmi's music exam" }, "Tuesday 24 November 2026", null)).toBe("Asmi's music exam is on Tuesday 24 November 2026");
    expect(datedThingSentence({ title: "Asmi's PTM" }, "Monday 23 November 2026", "11am")).toBe("Asmi's PTM is on Monday 23 November 2026 at 11am");
  });

  it("keeps the thing's own words", () => {
    expect(titleOf("my annual day practice for the play", NAMES)).toBe("Annual day practice for the play");
    expect(titleOf("manan's swimming class at 5pm on friday", NAMES)).toBe("Manan's swimming class");
  });
});
