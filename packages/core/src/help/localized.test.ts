import { describe, expect, it } from "vitest";

import { LANGUAGE_CODES } from "../i18n/locales";
import { translatorFor } from "../i18n/translate";
import { FAQ, GUIDE, guideByGroup, localizedFaq, localizedGuide } from "./guide";
import { answerQuestion, answerQuestionIn, SUGGESTED_QUESTIONS, suggestedQuestions, terms } from "./search";

/**
 * The guide in each person's language (story 22-004). English must come out
 * exactly as it always has; every other language must be the same guide —
 * same sections, anchors and paragraph count — searchable in its own words.
 */
const OTHER_LANGUAGES = LANGUAGE_CODES.filter((code) => code !== "en");

describe("the English guide", () => {
  it("is the same guide whether read directly or through the English translator", async () => {
    const t = await translatorFor("en");
    expect(localizedGuide(t)).toStrictEqual(GUIDE);
    expect(localizedFaq(t)).toStrictEqual(FAQ);
    expect(suggestedQuestions(t)).toEqual(SUGGESTED_QUESTIONS);
    expect(guideByGroup(t)).toStrictEqual(guideByGroup());
    expect(guideByGroup().map((entry) => entry.title)).toEqual(guideByGroup().map((entry) => entry.group));
  });

  it("answers exactly as before when asked through the English translator", async () => {
    const t = await translatorFor("en");
    for (const question of [
      ...SUGGESTED_QUESTIONS,
      ...FAQ.map((entry) => entry.question),
      "can it pay my bills automatically?",
      "what is the airspeed velocity of an unladen swallow",
      "   ",
    ]) {
      expect(answerQuestionIn(question, t, "en"), question).toStrictEqual(answerQuestion(question));
    }
  });
});

describe.each(OTHER_LANGUAGES)("the guide in %s", (language) => {
  it("keeps every section, anchor, group and paragraph, and says each in the language", async () => {
    const t = await translatorFor(language);
    const guide = localizedGuide(t);

    expect(guide.map((section) => section.id)).toEqual(GUIDE.map((section) => section.id));
    guide.forEach((section, index) => {
      const english = GUIDE[index]!;
      expect(section.group, section.id).toBe(english.group);
      expect(section.keywords, section.id).toEqual(english.keywords);
      expect(section.body.length, section.id).toBe(english.body.length);
      expect(section.summary, section.id).not.toBe(english.summary);
      section.body.forEach((paragraph, n) => expect(paragraph, `${section.id} ¶${n + 1}`).not.toBe(english.body[n]));
    });

    const faq = localizedFaq(t);
    expect(faq.map((entry) => [entry.id, entry.section])).toEqual(FAQ.map((entry) => [entry.id, entry.section]));
    for (const entry of faq) expect(entry.question).not.toBe(FAQ.find((english) => english.id === entry.id)!.question);

    const groups = guideByGroup(t);
    expect(groups.map((entry) => entry.group)).toEqual(guideByGroup().map((entry) => entry.group));
    for (const entry of groups) expect(entry.title).not.toBe(entry.group);
  });

  it("never translates a product name away", async () => {
    const guide = localizedGuide(await translatorFor(language));
    const text = (id: string) => {
      const section = guide.find((entry) => entry.id === id)!;
      return [section.title, section.summary, ...section.body].join(" ");
    };
    expect(text("what-wonderhome-is")).toContain("HomeTalk");
    expect(text("what-wonderhome-is")).toContain("HomeSend");
    expect(text("what-wonderhome-is")).toContain("HomeBrain");
    expect(text("voice")).toContain("Gemini Live");
    expect(text("connections")).toContain("WhatsApp");
  });

  it("answers each common question, asked in the language, from its own section", async () => {
    const t = await translatorFor(language);
    for (const entry of localizedFaq(t)) {
      const answer = answerQuestionIn(entry.question, t, language);
      expect(answer.confident, entry.question).toBe(true);
      expect(answer.reply, entry.question).toBe(entry.answer);
      expect(answer.sectionId, entry.question).toBe(entry.section);
    }
  });

  it("answers every suggested question the way English does", async () => {
    const t = await translatorFor(language);
    const localized = suggestedQuestions(t);
    SUGGESTED_QUESTIONS.forEach((english, index) => {
      const expected = answerQuestion(english);
      const answer = answerQuestionIn(localized[index]!, t, language);
      expect(answer.confident, localized[index]).toBe(true);
      expect(answer.sectionId, localized[index]).toBe(expected.sectionId);
    });
  });

  it("finds a section from its own title, and links it with the translated title", async () => {
    const t = await translatorFor(language);
    const guide = localizedGuide(t);
    for (const section of guide) {
      const answer = answerQuestionIn(section.title, t, language);
      expect(answer.confident, section.title).toBe(true);
      expect(answer.sectionTitle, section.title).toBe(guide.find((entry) => entry.id === answer.sectionId)!.title);
    }
  });

  it("says it does not know in the language, rather than guessing", async () => {
    const t = await translatorFor(language);
    const answer = answerQuestionIn("zzqx vvyk", t, language);
    expect(answer.confident).toBe(false);
    expect(answer.reply).toBe(t("help.ask.notFound"));
    expect(answer.sectionTitle).toBe(t("help.guide.what-wonderhome-is.title"));
  });
});

describe("reading a question in another script", () => {
  it("keeps the vowel signs of Devanagari words", () => {
    expect(terms("क्या बिल", "hi")).toEqual(["बिल"]);
    expect(terms("स्वास्थ्य", "hi")).toEqual(["स्वास्थ्य"]);
  });

  it("reads Chinese in overlapping pairs of characters", () => {
    expect(terms("首页安静", "zh")).toEqual(["首页", "页安", "安静"]);
  });

  it("splits a French elision and keeps accented letters", () => {
    expect(terms("l’argent dépensé", "fr")).toEqual(["argent", "dépensé"]);
  });

  it("reads an Arabic word with or without its article as the same word", () => {
    expect(terms("الفواتير", "ar")).toEqual(terms("فواتير", "ar"));
  });

  it("leaves English exactly as it was", () => {
    expect(terms("How do I pay a bill?")).toEqual(["pay", "bill"]);
    expect(terms("How do I pay a bill?", "en")).toEqual(["pay", "bill"]);
  });
});
