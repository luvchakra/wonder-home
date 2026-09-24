import { describe, expect, it } from "vitest";

import { checkTranslation, englishNoticeKey, EVERY_SENSITIVE_CLASS, localizeReply, mayTranslate, protectForTranslation, replyClassesFor, type ReplyTranslator } from "./reply-language";

/** A translator that swaps the words it knows and keeps every token where it was. */
function fakeHindi(map: Record<string, string>): ReplyTranslator {
  return async ({ text }) => Object.entries(map).reduce((out, [from, to]) => out.split(from).join(to), text);
}

describe("protectForTranslation", () => {
  it("takes out names, bold values, dates, times and amounts, and nothing else", () => {
    const protectedText = protectForTranslation("I will remind you on Fri 25 Sep at 9:45pm to **buy coriander**. Asmi Sharma owes ₹2,430.", ["Asmi Sharma", "Asmi"]);
    expect(protectedText.text).toBe("I will remind you on ⟦1⟧ at ⟦2⟧ to ⟦3⟧. ⟦4⟧ owes ⟦5⟧.");
    expect(protectedText.spans).toEqual(["Fri 25 Sep", "9:45pm", "**buy coriander**", "Asmi Sharma", "₹2,430"]);
  });

  it("keeps a link's words to translate and takes out where it goes", () => {
    const protectedText = protectForTranslation("[Open the bills](/bills) to see them.", []);
    expect(protectedText.text).toBe("[Open the bills⟦1⟧ to see them.");
    expect(protectedText.spans).toEqual(["](/bills)"]);
  });

  it("never hands the brand names to a translator", () => {
    expect(protectForTranslation("HomeTalk saved it to HomeSend.", []).text).toBe("⟦1⟧ saved it to ⟦2⟧.");
  });

  it("matches a name only as a whole word", () => {
    // "Ria" inside "Victoria" is not Ria.
    expect(protectForTranslation("Victoria is coming.", ["Ria"]).text).toBe("Victoria is coming.");
  });

  it("leaves a number inside a bold value alone rather than tokenising it twice", () => {
    const protectedText = protectForTranslation("Added **2 kg rice**.", []);
    expect(protectedText.text).toBe("Added ⟦1⟧.");
  });
});

describe("checkTranslation", () => {
  const source = protectForTranslation("I will remind you on Fri 25 Sep at 9am to **buy coriander**.", []);

  it("puts every protected span back exactly as it was", () => {
    const checked = checkTranslation(source, "मैं आपको ⟦1⟧ को ⟦2⟧ बजे ⟦3⟧ की याद दिलाऊँगा।");
    expect(checked).toEqual({ ok: true, text: "मैं आपको Fri 25 Sep को 9am बजे **buy coriander** की याद दिलाऊँगा।" });
  });

  it("refuses a translation that dropped a token", () => {
    expect(checkTranslation(source, "मैं आपको ⟦2⟧ को ⟦1⟧ की याद दिलाऊँगा।")).toEqual({ ok: false, reason: "missing_token" });
  });

  it("refuses a translation that repeated or invented a token", () => {
    expect(checkTranslation(source, "⟦1⟧ ⟦1⟧ ⟦2⟧ ⟦3⟧")).toEqual({ ok: false, reason: "extra_token" });
    expect(checkTranslation(source, "⟦1⟧ ⟦2⟧ ⟦3⟧ ⟦4⟧")).toEqual({ ok: false, reason: "extra_token" });
  });

  it("refuses a digit the English never had, in any script", () => {
    expect(checkTranslation(source, "मैं आपको ⟦2⟧ को ⟦3⟧ बजे ⟦1⟧ की याद दिलाऊँगा, 10 बजे भी।")).toEqual({ ok: false, reason: "invented_digit" });
    // Devanagari digits are digits too.
    expect(checkTranslation(source, "मैं आपको ⟦2⟧ को ⟦3⟧ बजे ⟦1⟧ की याद दिलाऊँगा, १० बजे भी।")).toEqual({ ok: false, reason: "invented_digit" });
  });

  it("refuses a new link, bold value or address", () => {
    expect(checkTranslation(source, "⟦2⟧ ⟦3⟧ ⟦1⟧ **ज़रूरी**")).toEqual({ ok: false, reason: "invented_markup" });
    expect(checkTranslation(source, "⟦2⟧ ⟦3⟧ ⟦1⟧ https://example.com")).toEqual({ ok: false, reason: "invented_markup" });
  });

  it("refuses an empty or implausibly short answer", () => {
    expect(checkTranslation(source, "   ")).toEqual({ ok: false, reason: "empty" });
    const long = protectForTranslation("Nothing on the list needs you today, and every reminder you set is waiting for its time.", []);
    expect(checkTranslation(long, "ठीक")).toEqual({ ok: false, reason: "implausible_length" });
  });
});

describe("localizeReply", () => {
  const reply = "Added **coriander** to the list, Asmi.";

  it("returns English untouched and asks no model", async () => {
    let asked = false;
    const result = await localizeReply(reply, { language: "en", names: ["Asmi"], translate: async () => ((asked = true), "x") });
    expect(result).toEqual({ text: reply, localized: false });
    expect(asked).toBe(false);
  });

  it("shows the checked translation, with the household's own words put back", async () => {
    const result = await localizeReply(reply, {
      language: "Hindi",
      names: ["Asmi"],
      translate: fakeHindi({ "Added ⟦1⟧ to the list, ⟦2⟧.": "⟦2⟧, ⟦1⟧ सूची में जोड़ दिया।" }),
    });
    expect(result).toEqual({ text: "Asmi, **coriander** सूची में जोड़ दिया।", localized: true });
  });

  it("never sends a name, an item or a number to the translator", async () => {
    let sent = "";
    await localizeReply("Asmi paid ₹540 for **milk** on 3 Oct.", { language: "Hindi", names: ["Asmi"], translate: async ({ text }) => ((sent = text), null) });
    expect(sent).not.toMatch(/Asmi|540|milk|Oct/);
  });

  it("falls back to the validated English when there is no model, it fails, or the check fails", async () => {
    expect(await localizeReply(reply, { language: "Hindi", names: [], translate: null })).toEqual({ text: reply, localized: false, fallback: "no_model" });
    expect(await localizeReply(reply, { language: "Hindi", names: [], translate: async () => null })).toEqual({ text: reply, localized: false, fallback: "model_failed" });
    expect(
      await localizeReply(reply, {
        language: "Hindi",
        names: [],
        translate: async () => {
          throw new Error("timeout");
        },
      }),
    ).toEqual({ text: reply, localized: false, fallback: "model_failed" });
    expect(await localizeReply(reply, { language: "Hindi", names: [], translate: async () => "सूची में जोड़ दिया।" })).toEqual({ text: reply, localized: false, fallback: "missing_token" });
  });
});

describe("mayTranslate", () => {
  const policy = { allowProviderContent: true, allowedClasses: ["general", "financial"] as const };

  it("allows a reply only when every class it carries may leave", () => {
    expect(mayTranslate({ ...policy, allowedClasses: [...policy.allowedClasses] }, ["general"])).toBe(true);
    expect(mayTranslate({ ...policy, allowedClasses: [...policy.allowedClasses] }, ["general", "financial"])).toBe(true);
    expect(mayTranslate({ ...policy, allowedClasses: [...policy.allowedClasses] }, ["general", "child"])).toBe(false);
  });

  it("never translates when nothing may leave, or a credential is involved", () => {
    expect(mayTranslate({ allowProviderContent: false, allowedClasses: ["general"] }, ["general"])).toBe(false);
    expect(mayTranslate({ allowProviderContent: true, allowedClasses: ["general", "credential"] }, ["credential"])).toBe(false);
  });
});

describe("replyClassesFor", () => {
  it("says what a reply about each kind of action carries, and assumes the worst of one it does not know", () => {
    expect(replyClassesFor("add_to_list")).toEqual([]);
    expect(replyClassesFor("log_vital")).toEqual(["health"]);
    expect(replyClassesFor("make_payment")).toEqual(["financial"]);
    expect(replyClassesFor("complete_school_item")).toEqual(["child"]);
    expect(replyClassesFor("something_new")).toEqual(EVERY_SENSITIVE_CLASS);
  });
});

describe("englishNoticeKey", () => {
  it("says the true reason a reply is in English", () => {
    expect(englishNoticeKey("not_permitted")).toBe("hometalk.english.notPermitted");
    expect(englishNoticeKey("no_model")).toBe("hometalk.english.noModel");
    expect(englishNoticeKey("model_failed")).toBe("hometalk.english.noModel");
    expect(englishNoticeKey("missing_token")).toBe("hometalk.english.unchecked");
  });
});
