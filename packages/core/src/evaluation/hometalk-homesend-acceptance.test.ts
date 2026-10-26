import { describe, expect, it } from "vitest";

import { decideForRequest } from "../conversation/consent";
import { converse } from "../conversation/engine";
import { canExecute } from "../conversation/executor";
import { groundIntent } from "../conversation/grounding";
import { NO_REFERENCES } from "../conversation/references";
import { answerClarification } from "../conversation/clarify";
import { decideConfirmation, type ConfirmationInput } from "../homesend/confirmation";
import { AUTO_ADD_PERCENTS, sureClause, sureWhy, type SureWhy } from "../homesend/auto-add";
import { FROM_A_FILE } from "../homesend/verify";
import type { AutonomyMode } from "../household/autonomy";
import { handedBackText, secondAsk } from "../hometalk/intake-questions";
import { en } from "../i18n/messages/en";
import { loadCatalog, translatorFor } from "../i18n/translate";
import { LANGUAGE_CODES } from "../i18n/locales";
import { groceryListNames, isForHomeTalk, namesTheSameThing } from "../whatsapp/hometalk";
import { acknowledgementFor, addedReply } from "../whatsapp/intake";

/**
 * Acceptance tests for the HomeTalk/HomeSend design (`docs/hometalk-homesend-design.md`)
 * and stories 14-042 to 14-049, the owner 2026-10-26: "add extensive test cases …
 * ensure expected results are already written … ensure general approval settings are
 * included … try few different combination of approval settings".
 *
 * Every case has an id (AT-…) and its expected result written out here, decided from
 * the design, not from what the code does. The summary report is
 * `docs/testing/2026-10-26-hometalk-homesend-acceptance.md`.
 *
 * The household's general approval settings, all exercised below:
 * - each responsibility's autonomy: "Wait for Approval" (prepare) or "Pre Approved" (execute);
 * - the Admin's bar for HomeSend adding on its own: more than 60, 70, 80, 85, 90, 95, 97 or 99%;
 * - "Ask before acting on what I say" (HomeTalk), off or on.
 */

type Reading = "R97" | "R96" | "R95" | "R90" | "R70" | "R40";

/** What HomeSend read, and how sure: the four scores of design §4.3, plus the 95% boundary. */
const READINGS: Record<Reading, NonNullable<ConfirmationInput["understanding"]>> = {
  R97: { readable: true, confidence: "high", score: 0.97, check: { verified: true, unverified: [] }, safety: { signals: [], instructionsIgnored: false } },
  R96: { readable: true, confidence: "high", score: 0.96, check: { verified: true, unverified: [] }, safety: { signals: [], instructionsIgnored: false } },
  R95: { readable: true, confidence: "high", score: 0.95, check: { verified: false, unverified: ["the due date"] }, safety: { signals: [], instructionsIgnored: false } },
  R90: { readable: true, confidence: "high", score: 0.9, check: { verified: false, unverified: ["the due date"] }, safety: { signals: [], instructionsIgnored: false } },
  R70: { readable: true, confidence: "medium", score: 0.7, check: { verified: false, unverified: [] }, safety: { signals: [], instructionsIgnored: false } },
  R40: { readable: true, confidence: "low", score: 0.4, check: { verified: false, unverified: [] }, safety: { signals: [], instructionsIgnored: false } },
};

const GROCERY = { kind: "grocery_item" as const, extracted: { title: "Mustard oil", quantity: 2, unit: "l", needs: [], confidence: "high" as const }, subject: null };
const SCHOOL = { kind: "school_item" as const, extracted: { title: "Maths worksheet", dueDate: "2026-10-30", people: ["Asmi"], needs: [], confidence: "high" as const }, subject: { question: null, selected: { memberId: "kid-asmi" } } };

function decide(base: typeof GROCERY | typeof SCHOOL, autonomy: AutonomyMode, bar: number, reading: Reading, over: Partial<ConfirmationInput> = {}) {
  return decideConfirmation({
    kind: base.kind,
    extracted: base.extracted as ConfirmationInput["extracted"],
    understanding: READINGS[reading],
    reconciliation: null,
    subject: base.subject as ConfirmationInput["subject"],
    memberInitiated: true,
    autonomy,
    autoAddPercent: bar,
    ...over,
  });
}

/**
 * AT-A: the approval matrix. Autonomy × the Admin's bar × how sure, for both kinds HomeSend may
 * ever add on its own. Expected, from design §1.4 and §4.7: added on its own only when Pre Approved
 * AND the score is strictly above the bar; a low reading is always asked; everything else waits.
 */
const APPROVAL_MATRIX: [id: string, autonomy: AutonomyMode, bar: number, reading: Reading, expected: "auto_apply" | "prepare" | "ask"][] = [
  ["AT-A01", "execute", 60, "R97", "auto_apply"],
  ["AT-A02", "execute", 60, "R90", "auto_apply"],
  ["AT-A03", "execute", 60, "R70", "auto_apply"],
  ["AT-A04", "execute", 60, "R40", "ask"],
  ["AT-A05", "execute", 80, "R97", "auto_apply"],
  ["AT-A06", "execute", 80, "R90", "auto_apply"],
  ["AT-A07", "execute", 80, "R70", "prepare"],
  ["AT-A08", "execute", 80, "R40", "ask"],
  ["AT-A09", "execute", 95, "R97", "auto_apply"],
  ["AT-A10", "execute", 95, "R96", "auto_apply"],
  ["AT-A11", "execute", 95, "R95", "prepare"],
  ["AT-A12", "execute", 95, "R90", "prepare"],
  ["AT-A13", "execute", 95, "R70", "prepare"],
  ["AT-A14", "execute", 95, "R40", "ask"],
  ["AT-A15", "execute", 99, "R97", "prepare"],
  ["AT-A16", "execute", 99, "R90", "prepare"],
  ["AT-A17", "execute", 99, "R70", "prepare"],
  ["AT-A18", "execute", 99, "R40", "ask"],
  ["AT-A19", "prepare", 60, "R97", "prepare"],
  ["AT-A20", "prepare", 60, "R90", "prepare"],
  ["AT-A21", "prepare", 60, "R70", "prepare"],
  ["AT-A22", "prepare", 60, "R40", "ask"],
  ["AT-A23", "prepare", 80, "R97", "prepare"],
  ["AT-A24", "prepare", 80, "R90", "prepare"],
  ["AT-A25", "prepare", 95, "R97", "prepare"],
  ["AT-A26", "prepare", 95, "R96", "prepare"],
  ["AT-A27", "prepare", 95, "R70", "prepare"],
  ["AT-A28", "prepare", 95, "R40", "ask"],
  ["AT-A29", "prepare", 99, "R97", "prepare"],
  ["AT-A30", "prepare", 99, "R40", "ask"],
  ["AT-A31", "execute", 90, "R90", "prepare"],
  ["AT-A32", "execute", 85, "R90", "auto_apply"],
  ["AT-A33", "execute", 70, "R70", "prepare"],
  ["AT-A34", "execute", 97, "R97", "prepare"],
];

describe("AT-A: the approval matrix — autonomy × bar × how sure (design §1.4, §4.7)", () => {
  for (const [id, autonomy, bar, reading, expected] of APPROVAL_MATRIX) {
    for (const base of [GROCERY, SCHOOL]) {
      it(`${id} ${base.kind}: ${autonomy === "execute" ? "Pre Approved" : "Wait for Approval"}, bar ${bar}%, ${reading} → ${expected}`, () => {
        expect(decide(base, autonomy, bar, reading).mode).toBe(expected);
      });
    }
  }

  it("AT-A35 the reason says which setting held it", () => {
    expect(decide(GROCERY, "prepare", 95, "R97").reason).toBe("Your household has groceries set to “Wait for Approval”, so WonderHome asks first.");
    expect(decide(GROCERY, "execute", 99, "R97").reason).toMatch(/more than 99% sure/);
    expect(decide(GROCERY, "execute", 95, "R97").reason).toMatch(/lets WonderHome handle groceries on its own/);
  });

  it("AT-A36 every bar an Admin can pick is honoured strictly (score just above adds, equal waits)", () => {
    for (const bar of AUTO_ADD_PERCENTS) {
      const above = { ...READINGS.R97, score: (bar + 0.5) / 100 };
      const equal = { ...READINGS.R97, score: bar / 100 };
      expect(decide(GROCERY, "execute", bar, "R97", { understanding: above }).mode, `bar ${bar} above`).toBe("auto_apply");
      expect(decide(GROCERY, "execute", bar, "R97", { understanding: equal }).mode, `bar ${bar} equal`).toBe("prepare");
    }
  });

  it("AT-A37 no bar given means 95%", () => {
    expect(decide(GROCERY, "execute", 95, "R96", { autoAddPercent: undefined }).mode).toBe("auto_apply");
    expect(decide(GROCERY, "execute", 95, "R95", { autoAddPercent: undefined }).mode).toBe("prepare");
  });
});

/**
 * AT-B: what always waits, under the most permissive settings a household can choose
 * (Pre Approved, bar 60%, a 97% reading). Expected from design §1.5 and §4.7.
 */
describe("AT-B: always waits, whatever the settings (design §1.5)", () => {
  const permissive = (over: Partial<ConfirmationInput>) => decideConfirmation({
    kind: "grocery_item", extracted: GROCERY.extracted as ConfirmationInput["extracted"], understanding: READINGS.R97, reconciliation: null, subject: null, memberInitiated: true, autonomy: "execute", autoAddPercent: 60, ...over,
  });
  const cases: [id: string, what: string, over: Partial<ConfirmationInput>, expected: string, stillNeeded?: string[]][] = [
    ["AT-B01", "a bill", { kind: "bill", extracted: { title: "Electricity", payee: "BESCOM", amount: 2140, dueDate: "2026-11-05", needs: [], confidence: "high" } as never }, "govern"],
    ["AT-B02", "a bill missing its amount", { kind: "bill", extracted: { title: "Electricity", payee: "BESCOM", amount: null, dueDate: "2026-11-05", needs: [], confidence: "high" } as never }, "govern", ["amount"]],
    ["AT-B03", "a health document", { kind: "health_document", extracted: { title: "Blood test", healthRecordType: "lab_report", subjectMemberName: "Kunal", needs: [], confidence: "high" } as never }, "govern"],
    ["AT-B04", "a receipt", { kind: "receipt", extracted: { title: "DMart", merchant: "DMart", documentDate: "2026-10-25", needs: [], confidence: "high" } as never }, "govern"],
    ["AT-B05", "a photo or file (can't be checked word by word)", { understanding: { ...READINGS.R97, check: { verified: false, unverified: [FROM_A_FILE] } } }, "prepare"],
    ["AT-B06", "a likely duplicate", { reconciliation: { message: "Already on the list.", proposal: "duplicate" } as never }, "prepare"],
    ["AT-B07", "content with instructions aimed at WonderHome", { understanding: { ...READINGS.R97, safety: { signals: ["instruction"], instructionsIgnored: true } as never } }, "prepare"],
    ["AT-B08", "several needs in one message", { extracted: { ...GROCERY.extracted, needs: [{ title: "Eggs" }] } as never }, "prepare"],
    ["AT-B09", "not sent by a member (an email)", { memberInitiated: false }, "prepare"],
    ["AT-B10", "an event (never added on its own)", { kind: "event", extracted: { title: "Diwali dinner", dueDate: "2026-11-07", needs: [], confidence: "high" } as never }, "prepare"],
    ["AT-B11", "a class outside school", { kind: "activity_item", extracted: { title: "Karate grading", subject: "Karate", subjectMemberName: "Asmi", needs: [], confidence: "high" } as never, subject: { question: null, selected: { memberId: "kid-asmi" } } as never }, "prepare"],
    ["AT-B12", "something unreadable", { understanding: { ...READINGS.R97, readable: false } }, "ask"],
    ["AT-B13", "an unknown kind", { kind: "unknown" }, "ask"],
    ["AT-B14", "school work that doesn't say who it's for", { kind: "school_item", extracted: SCHOOL.extracted as never, subject: { question: "Who is it for — Asmi or Manan?", selected: null } as never }, "ask"],
    ["AT-B15", "school work missing its due date", { kind: "school_item", extracted: { ...SCHOOL.extracted, dueDate: null } as never, subject: SCHOOL.subject as never }, "ask", ["due date"]],
    ["AT-B16", "a grocery with no name", { extracted: { ...GROCERY.extracted, title: "" } as never }, "ask"],
  ];
  for (const [id, what, over, expected, stillNeeded] of cases) {
    it(`${id} ${what} → ${expected}`, () => {
      const decision = permissive(over);
      expect(decision.mode).toBe(expected);
      if (stillNeeded) expect(decision.stillNeeded).toEqual(stillNeeded);
      // Nothing that always waits is ever applied on its own.
      expect(decision.mode).not.toBe("auto_apply");
    });
  }

  it("AT-B17 a required detail missing is reported, never worded as a question by HomeSend", () => {
    const decision = permissive({ kind: "school_item", extracted: { ...SCHOOL.extracted, dueDate: null } as never, subject: SCHOOL.subject as never });
    expect(decision.question).toBeNull();
  });
});

/**
 * AT-C: HomeTalk's general setting "Ask before acting on what I say", with autonomy, for each kind
 * of request (design §2; HomeBrain 4.0 §3.9). Expected: an adult's everyday request is done at once
 * unless "Ask before acting" is on; someone else's plans are confirmed; paying never acts on a yes
 * alone; a child's request follows the responsibility's autonomy.
 */
describe("AT-C: HomeTalk requests × \"Ask before acting\" × autonomy", () => {
  const LIST = { outcomeKey: "groceries.stocked", kind: "schedule" as const, reversible: true };
  const PAY = { outcomeKey: "bills.paid", kind: "payment" as const, reversible: false };
  const cases: [id: string, who: string, tier: "act" | "confirm" | "step_up" | null, action: typeof LIST | typeof PAY, autonomy: AutonomyMode, askFirst: boolean, expected: "execute" | "needs_approval"][] = [
    ["AT-C01", "adult adds to the list", "act", LIST, "prepare", false, "execute"],
    ["AT-C02", "adult adds to the list", "act", LIST, "execute", false, "execute"],
    ["AT-C03", "adult adds to the list, Ask before acting on", "act", LIST, "prepare", true, "needs_approval"],
    ["AT-C04", "adult adds to the list, Ask before acting on", "act", LIST, "execute", true, "needs_approval"],
    ["AT-C05", "adult changes someone else's plans", "confirm", LIST, "execute", false, "needs_approval"],
    ["AT-C06", "adult changes someone else's plans", "confirm", LIST, "prepare", true, "needs_approval"],
    ["AT-C07", "adult asks to pay", "step_up", PAY, "execute", false, "needs_approval"],
    ["AT-C08", "adult asks to pay", "step_up", PAY, "prepare", true, "needs_approval"],
    ["AT-C09", "child asks, Pre Approved", null, LIST, "execute", false, "execute"],
    ["AT-C10", "child asks, Wait for Approval", null, LIST, "prepare", false, "needs_approval"],
    ["AT-C11", "child asks, Pre Approved, Ask before acting on", null, LIST, "execute", true, "execute"],
  ];
  for (const [id, who, tier, action, autonomy, askFirst, expected] of cases) {
    it(`${id} ${who}, ${autonomy === "execute" ? "Pre Approved" : "Wait for Approval"}, Ask before acting ${askFirst ? "on" : "off"} → ${expected}`, () => {
      expect(decideForRequest({ tier, mode: autonomy, action, confirmRequested: askFirst }).outcome).toBe(expected);
    });
  }
});

/** AT-D: WhatsApp routing (design §3.1), message by message, with where each must go. */
describe("AT-D: WhatsApp routing — HomeTalk or HomeSend (design §3.1)", () => {
  const cases: [id: string, message: string, expected: "HomeTalk" | "HomeSend" | "list"][] = [
    ["AT-D01", "what's for dinner?", "HomeTalk"],
    ["AT-D02", "What are upcoming events", "HomeTalk"],
    ["AT-D03", "add milk to the list", "HomeTalk"],
    ["AT-D04", "remind me to call the plumber at 5", "HomeTalk"],
    ["AT-D05", "remember Asmi likes paneer", "HomeTalk"],
    ["AT-D06", "undo", "HomeTalk"],
    ["AT-D07", "take it back", "HomeTalk"],
    ["AT-D08", "yes", "HomeTalk"],
    ["AT-D09", "ok", "HomeTalk"],
    ["AT-D10", "milk, eggs and bread", "list"],
    ["AT-D11", "Milk & curd", "list"],
    ["AT-D12", "Tomorrow is Sports Day. Bring a water bottle, cap and sports shoes.", "HomeSend"],
    ["AT-D13", "Dear parents,\nexam time is 9.30 morning", "HomeSend"],
    ["AT-D14", "https://school.example/circular.pdf", "HomeSend"],
    ["AT-D15", "2 litres mustard oil", "HomeSend"],
    ["AT-D16", "Asmi Karate Sunday", "HomeSend"],
  ];
  for (const [id, message, expected] of cases) {
    it(`${id} "${message.replace(/\n/g, " ")}" → ${expected}`, () => {
      const route = isForHomeTalk(message) ? "HomeTalk" : groceryListNames(message) ? "list" : "HomeSend";
      expect(route).toBe(expected);
    });
  }

  it("AT-D17 a list goes to HomeTalk only when every name is an everyday grocery, by whole words", () => {
    expect(namesTheSameThing("milk", "Milk")).toBe(true);
    expect(namesTheSameThing("eggs", "Eggs, White")).toBe(true);
    expect(namesTheSameThing("bread", "Bread, Brown")).toBe(true);
    expect(namesTheSameThing("asmi", "Rice, Jasmine")).toBe(false);
    expect(namesTheSameThing("manan", "Mango")).toBe(false);
  });
});

/** AT-E: HomeTalk's questions about an item end well (design §4.6, §5; 14-044). */
describe("AT-E: second asks and the closing line", () => {
  const pending = (field: string, kind: string, extra: Record<string, unknown> = {}) => ({ action: "complete_homesend_item" as const, target: { kind: "unspecified" as const }, parameters: { itemId: "i1", kind, field, asked: [field], ...extra }, question: "q", utterance: "", asked: 1 });
  const ctx = { actorMemberId: "adult-kunal", channel: "text" as const };

  const fields: [id: string, field: Parameters<typeof secondAsk>[0], expectedFirstLine: string, mustList: string[]][] = [
    ["AT-E01", "quantity", "Sorry, I couldn't make that out. Could you say it one of these ways?", ['- "2 litres" or "500 g"']],
    ["AT-E02", "dueDate", "Sorry, I couldn't make that out. Could you say it one of these ways?", ['- "tomorrow" or "next Friday"']],
    ["AT-E03", "date", "Sorry, I couldn't make that out. Could you say it one of these ways?", ['- a date, like "7 Nov"']],
    ["AT-E04", "time", "Sorry, I couldn't make that out. Could you say it one of these ways?", ['- "8 pm" or "9:30 am"']],
    ["AT-E05", "amount", "Sorry, I couldn't make that out. Could you say it one of these ways?", ['- a number, like "1500"']],
    ["AT-E06", "recordType", "Sorry, I couldn't make that out. Could you say it one of these ways?", ["- a prescription", "- a lab report"]],
    ["AT-E07", "where", "Sorry, I couldn't make that out. Where is it? A few words is enough.", []],
    ["AT-E08", "payee", "Sorry, I couldn't make that out. Who is the bill from? A few words is enough.", []],
  ];
  for (const [id, field, firstLine, mustList] of fields) {
    it(`${id} ${field}: polite, listed, offers skip, never the same question`, () => {
      const said = secondAsk(field, []);
      const lines = said.split("\n");
      expect(lines[0]).toBe(firstLine);
      for (const line of mustList) expect(lines).toContain(line);
      expect(lines.at(-1)).toBe('Or say "skip" and I\'ll leave it for you in HomeSend.');
    });
  }

  it("AT-E09 who it's for: the household's names as a list", () => {
    expect(secondAsk("child", [{ displayName: "Asmi Chakraborty" }, { displayName: "Manan" }])).toBe(
      ["Sorry, I couldn't tell who from that. Could you pick one?", "- Asmi", "- Manan", 'Or say "skip" and I\'ll leave it for you in HomeSend.'].join("\n"),
    );
  });

  it("AT-E10 a short reply that isn't a new request is an attempt at the answer", () => {
    expect(answerClarification(pending("quantity", "grocery_item"), "lots", ctx)?.action).toBe("complete_homesend_item");
    expect(answerClarification(pending("dueDate", "school_item"), "whenever", ctx)?.action).toBe("complete_homesend_item");
  });

  it("AT-E11 a new request is never swallowed as an answer, even on a retried question", () => {
    expect(answerClarification(pending("quantity", "grocery_item", { retried: true }), "add eggs to the list", ctx)).toBeNull();
    expect(answerClarification(pending("date", "event", { retried: true }), "what's on tomorrow?", ctx)).toBeNull();
  });

  it("AT-E12 the closing line names what is left, and never an amount", () => {
    expect(handedBackText("Got it, thanks.", { added: null, stillNeeded: ["who it's from", "due date"] })).toBe("Got it, thanks. It's waiting in HomeSend — the who it's from and due date can be filled in there.");
    expect(handedBackText("Got it, thanks.", { added: null, stillNeeded: [] })).toBe("Got it, thanks. It's waiting in HomeSend for you to check.");
  });
});

/** AT-F: how sure, and why, on every "added on its own" message (design §7; 14-043). */
describe("AT-F: \"N% sure — why\"", () => {
  const whys: [id: string, understanding: Parameters<typeof sureWhy>[0], expected: SureWhy | null, words: string][] = [
    ["AT-F01", { check: { verified: true, unverified: [] }, confidence: "high" }, "verified", "every detail is in what you sent"],
    ["AT-F02", { check: { verified: false, unverified: [FROM_A_FILE] }, confidence: "high" }, "file", "read from a photo or file"],
    ["AT-F03", { check: { verified: false, unverified: ["the due date"] }, confidence: "high" }, "missing", "some details aren't in what you sent"],
    ["AT-F04", { check: null, confidence: "medium" }, "unsure", "the AI wasn't sure"],
  ];
  for (const [id, understanding, expected, words] of whys) {
    it(`${id} ${expected} → "${words}"`, () => {
      expect(sureWhy(understanding)).toBe(expected);
      expect(sureClause({ percent: 90, why: expected })).toBe(` (90% sure — ${words})`);
    });
  }

  it("AT-F05 no score, no claim", () => {
    expect(sureClause({ percent: null, why: "verified" })).toBe("");
    expect(addedReply({ title: "Milk", where: "Groceries" })).toBe("Added *Milk* to Groceries — your household lets WonderHome add these on its own. You can undo it in HomeSend.");
  });

  it("AT-F06 the WhatsApp reply carries the % and the reason, and says where to undo", () => {
    expect(addedReply({ title: "Maths worksheet", where: "Kids & School", percent: 97, why: "verified" }, "Asmi")).toBe(
      "Added *Maths worksheet* for Asmi to Kids & School (97% sure — every detail is in what you sent) — your household lets WonderHome add these on its own. You can undo it in HomeSend.",
    );
  });

  it("AT-F07 HomeTalk's hand-back carries the same", () => {
    expect(handedBackText("Got it, thanks.", { added: { title: "Coconut oil", where: "Groceries", percent: 96, why: "verified" }, stillNeeded: [] })).toBe(
      "Got it, thanks. Added **Coconut oil** to Groceries (96% sure — every detail is in what you sent) — your household lets WonderHome add these on its own. You can undo it in HomeSend.",
    );
  });
});

/** AT-G: WonderHome's WhatsApp words in every language (design §10; 14-047). */
describe("AT-G: WhatsApp words in all eight languages", () => {
  const keys = Object.keys(en).filter((key) => key.startsWith("whatsapp."));
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

  it("AT-G01 the area has every message it needs", () => {
    expect(keys.length).toBeGreaterThanOrEqual(40);
  });

  for (const language of LANGUAGE_CODES) {
    it(`AT-G02-${language} every key is translated with the same placeholders`, async () => {
      const catalog = (await loadCatalog(language)) as Record<string, string>;
      for (const key of keys) {
        const english = (en as Record<string, string>)[key]!;
        const said = catalog[key] ?? "";
        expect(said, key).not.toBe("");
        if (language !== "en") expect(said, `${language} ${key} is untranslated`).not.toBe(english);
        expect(placeholders(said), `${language} ${key}`).toEqual(placeholders(english));
      }
    });

    it(`AT-G03-${language} an acknowledgement and an "added" reply leave no braces and echo no amount`, async () => {
      const t = await translatorFor(language);
      const outcome = { duplicate: false, state: "needs_review", itemId: "i", notice: "", item: { classifiedKind: "bill", extracted: { title: "Electricity", amount: 2140 } } } as never;
      const ack = acknowledgementFor(outcome, { t }).text;
      const added = addedReply({ title: "Milk", where: "Groceries", percent: 97, why: "verified" }, undefined, t);
      for (const said of [ack, added]) {
        expect(said).not.toMatch(/[{}]/);
        expect(said).not.toMatch(/2,?140/);
      }
      expect(added).toContain("97");
    });
  }
});

/**
 * AT-I: whole HomeTalk turns (the conversation engine with grounding), under the general settings.
 * Expected: "Add 2 litres of milk" is done at once with an Undo unless "Ask before acting" is on;
 * "Pay the electricity bill" is never done in the conversation; a child's add follows autonomy.
 */
describe("AT-I: HomeTalk turns end to end under the general settings", () => {
  const now = new Date("2026-10-26T10:00:00Z");
  const turn = (utterance: string, settings: { autonomy: AutonomyMode; askFirst: boolean; memberType?: "adult" | "child" }) =>
    converse({
      utterance,
      channel: "text",
      actor: { memberId: "m-kunal", roles: settings.memberType === "child" ? ["child"] : ["head"], memberType: settings.memberType ?? "adult" },
      pending: null,
      clarifying: null,
      autonomyFor: () => settings.autonomy,
      entitledFor: () => true,
      executable: canExecute,
      sessionId: "s-1",
      confirmRequestedChanges: settings.askFirst,
      now,
      ground: (intent) => groundIntent(intent, { people: [], viewerMemberId: "m-kunal", timezone: "Asia/Kolkata", now, references: async () => NO_REFERENCES, groceries: async () => [] }),
    });
  const cases: [id: string, utterance: string, settings: Parameters<typeof turn>[1], executed: boolean][] = [
    ["AT-I01", "Add 2 litres of milk to the list", { autonomy: "prepare", askFirst: false }, true],
    ["AT-I02", "Add 2 litres of milk to the list", { autonomy: "execute", askFirst: false }, true],
    ["AT-I03", "Add 2 litres of milk to the list", { autonomy: "prepare", askFirst: true }, false],
    ["AT-I04", "Add 2 litres of milk to the list", { autonomy: "execute", askFirst: true }, false],
    ["AT-I05", "Pay the electricity bill", { autonomy: "execute", askFirst: false }, false],
    ["AT-I06", "Pay the electricity bill", { autonomy: "prepare", askFirst: true }, false],
  ];
  for (const [id, utterance, settings, executed] of cases) {
    it(`${id} "${utterance}", ${settings.autonomy === "execute" ? "Pre Approved" : "Wait for Approval"}, Ask before acting ${settings.askFirst ? "on" : "off"} → ${executed ? "done at once" : "not done in the conversation"}`, async () => {
      const result = await turn(utterance, settings);
      expect(result.kind).toBe("reply");
      const kind = result.kind === "reply" ? result.proposal.kind : null;
      if (executed) expect(kind).toBe("executed");
      else expect(kind).toBe("needs_approval");
    });
  }
});
