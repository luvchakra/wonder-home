import { describe, expect, it } from "vitest";

import { reminderMoment } from "./reminder-time";
import { resolveTemporal, splitTrailingWhen } from "./temporal";

/**
 * The live conversation of 24 Sep 2026, 8:34 pm in Kolkata: "remind me to
 * pick some coriander while my way back from office" was asked "when?", its
 * own offered answer "later today" was refused, and "today" was written for
 * 9am — already gone — and fired at once while the reply still said 9am.
 */

const KOLKATA = "Asia/Kolkata";
const EVENING = new Date("2026-09-24T15:04:00Z"); // 8:34 pm IST
const MORNING = new Date("2026-09-24T04:30:00Z"); // 10:00 am IST
const at = (phrase: string, now = EVENING) => resolveTemporal(phrase, { timezone: KOLKATA, now });
const moment = (when: string, time: string | null = null, now = EVENING) => reminderMoment(when, time, { timezone: KOLKATA, now });

describe("moments from now", () => {
  it("\"later today\" — the answer our own question offers — is understood: about an hour on, on the quarter hour", () => {
    expect(at("later today")).toMatchObject({ date: "2026-09-24", precision: "part_of_day", window: { from: "21:45", to: "21:45" }, label: "today (Thu 24 Sep)" });
    expect(at("later")).toMatchObject({ window: { from: "21:45", to: "21:45" } });
    expect(at("later on")).toMatchObject({ window: { from: "21:45", to: "21:45" } });
  });

  it("\"in 2 hours\", \"in half an hour\", \"in 45 minutes\" count from now, into tomorrow when they must", () => {
    expect(at("in 2 hours")).toMatchObject({ date: "2026-09-24", window: { from: "22:34", to: "22:34" } });
    expect(at("in half an hour")).toMatchObject({ window: { from: "21:04", to: "21:04" } });
    expect(at("in 45 minutes")).toMatchObject({ window: { from: "21:19", to: "21:19" } });
    expect(at("in 4 hours")).toMatchObject({ date: "2026-09-25", label: "tomorrow (Fri 25 Sep)", window: { from: "00:34", to: "00:34" } });
  });

  it("\"later this evening\" said at 10 am is this evening, not eleven o'clock", () => {
    expect(at("later this evening", MORNING)).toMatchObject({ date: "2026-09-24", window: { from: "17:00", to: "21:00" } });
    expect(at("later tonight", MORNING)).toMatchObject({ window: { from: "18:00", to: "23:00" }, label: "tonight (Thu 24 Sep)" });
  });

  it("the trip home is this evening; once the evening is over it is soon", () => {
    expect(at("on my way back from office", MORNING)).toMatchObject({ date: "2026-09-24", window: { from: "17:00", to: "21:00" } });
    expect(at("on the way home")).toMatchObject({ window: { from: "17:00", to: "21:00" } });
    expect(at("after work", new Date("2026-09-24T15:45:00Z"))).toMatchObject({ window: { from: "21:30", to: "21:30" } });
  });

  it("vague words that are not a time stay unresolved, so the caller asks", () => {
    expect(at("sometime soon")).toBeNull();
    expect(at("whenever")).toBeNull();
  });
});

describe("a when left inside what to be reminded of", () => {
  it("is split off, so the reminder reads as the thing itself", () => {
    expect(splitTrailingWhen("pick some coriander while my back way back from office")).toEqual({ what: "pick some coriander", when: "on the way home" });
    expect(splitTrailingWhen("pick up coriander on my way home")).toEqual({ what: "pick up coriander", when: "on the way home" });
    expect(splitTrailingWhen("buy milk when I'm coming back home")).toEqual({ what: "buy milk", when: "on the way home" });
    expect(splitTrailingWhen("call the bank after work")).toEqual({ what: "call the bank", when: "on the way home" });
    expect(splitTrailingWhen("call mum later")).toEqual({ what: "call mum", when: "later" });
    expect(splitTrailingWhen("check the oven in 20 minutes")).toEqual({ what: "check the oven", when: "in 20 minutes" });
  });

  it("leaves a reminder with no when in it alone", () => {
    expect(splitTrailingWhen("call the plumber")).toBeNull();
    expect(splitTrailingWhen("water the plants on the balcony")).toBeNull();
  });
});

describe("when a reminder actually goes off", () => {
  it("\"today\" said at 8:35 pm is later today — never 9am, which has gone", () => {
    const today = moment("today");
    expect(today).toMatchObject({ ok: true, day: "today (Thu 24 Sep)", time: "9:45pm" });
    expect(today.ok && today.at.toISOString()).toBe("2026-09-24T16:15:00.000Z");
  });

  it("\"today\" said at 10 am is still later today, and a day ahead means 9am", () => {
    expect(moment("today", null, MORNING)).toMatchObject({ ok: true, time: "11am" });
    expect(moment("tomorrow")).toMatchObject({ ok: true, day: "tomorrow (Fri 25 Sep)", time: "9am" });
  });

  it("a part of the day under way comes shortly, while it still is that part of the day", () => {
    expect(moment("this evening")).toMatchObject({ ok: true, day: "today (Thu 24 Sep)", time: "9pm" });
    expect(moment("on my way back from office")).toMatchObject({ ok: true, time: "9pm" });
  });

  it("a time already gone is a question, never a reminder quietly written for now", () => {
    const passed = moment("today", "9am");
    expect(passed.ok).toBe(false);
    expect(!passed.ok && passed.question).toBe("9am today has already passed. Should I remind you later today, or tomorrow at 9am?");
    const morning = moment("this morning");
    expect(!morning.ok && morning.question).toMatch(/^This morning has already passed\./);
    expect(moment("yesterday").ok).toBe(false);
  });

  it("a moment from now keeps its own time, whatever time was said before it", () => {
    expect(moment("later today", "9am")).toMatchObject({ ok: true, time: "9:45pm" });
  });

  it("a stated time on a future day is kept exactly", () => {
    expect(moment("tomorrow", "6:30pm")).toMatchObject({ ok: true, day: "tomorrow (Fri 25 Sep)", time: "6:30pm" });
  });
});
