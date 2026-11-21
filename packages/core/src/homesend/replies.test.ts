import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { en } from "../i18n/messages/en";
import { translator } from "../i18n/translate";
import { timetableReply } from "./timetable-words";

/**
 * Replies people can understand (2026-11-21, the owner: "replies being
 * recieved are confusing"). Since 2026-11-14 nothing waits, so no reply says
 * it does; "couldn't tell what it's about" is never said for content a model
 * didn't read.
 */
const OLD = [/waiting in HomeSend for you to check/i, /couldn't tell what it's about/i];

describe("replies to something sent in", () => {
  it("no reply class, in any language's English source or in code, says the old sentences", () => {
    for (const [key, value] of Object.entries(en)) for (const old of OLD) expect(`${key}: ${String(value)}`).not.toMatch(old);
    const root = join(__dirname, "..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (name !== "i18n") walk(path);
        } else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name)) {
          const code = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
          if (OLD.some((old) => old.test(code))) offenders.push(path);
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });

  it("the timetable reply says what it was, what was done for whom, the one question, and where to see it, in that order", () => {
    const t = translator("en", en);
    const reply = timetableReply(
      { title: "Mid-Term Unit Test 2", examType: "Mid-term", checking: true, children: [{ memberId: "m-asmi", name: "Asmi", column: "Std. IV", count: 8, from: "2026-12-03", to: "2026-12-14", examId: "e1" }], asked: [{ memberId: "m-kabir", name: "Kabir" }] },
      t,
      { origin: "https://home.example" },
    );
    expect(reply).toBe(
      [
        "📚 Exam timetable: *Mid-Term Unit Test 2*.",
        "I added 8 exam days for Asmi (Std. IV).",
        "They're marked Checking because I read them from a photo or file.",
        "One question: which class is Kabir in? The answer picks the right column.",
        "See or undo: https://home.example/school?child=m-asmi#exams",
      ].join("\n"),
    );
    // On WhatsApp no date is echoed (docs/external-providers.md); in the app the days are said.
    expect(reply).not.toMatch(/Dec|2026/);
  });
});
