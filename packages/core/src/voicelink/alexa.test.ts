import { createSign, X509Certificate } from "node:crypto";

import { describe, expect, it } from "vitest";

import { looksLikeStatusQuestion } from "../conversation/rules";
import {
  ALEXA_ANSWER_INTENT,
  ALEXA_ANSWER_TYPE,
  ALEXA_CARRIERS,
  ALEXA_STATUS_INTENT,
  ALEXA_STATUS_QUESTION,
  alexaInteractionModel,
  alexaResponseFor,
  alexaSkillId,
  alexaTurn,
  certChainUrlAllowed,
  checkAlexaCertificate,
  linkAccountResponse,
  readAlexaEnvelope,
  signatureMatches,
  splitPemChain,
  timestampFresh,
  withCarrier,
} from "./alexa";
import { TEST_ALEXA_LEAF_KEY, TEST_ALEXA_LEAF_PEM, TEST_OTHER_LEAF_KEY, TEST_OTHER_LEAF_PEM, TEST_ROOT_PEM } from "./alexa.fixtures";

/**
 * Voice integration phase 4: Alexa as a HomeTalk channel
 * (`design/voice-integration/04-alexa-hometalk-skill.md`, §Tests → Security).
 */

const NOW = new Date("2026-09-23T10:00:00Z");
/** The fixture certificates were issued on 23 Sep 2026 and last a century; any date well inside that works. */
const CERT_NOW = new Date("2030-01-01T00:00:00Z");
const ROOT = new X509Certificate(TEST_ROOT_PEM);
const SKILL = "amzn1.ask.skill.11111111-2222-4333-8444-555555555555";

function body(over: Record<string, unknown> = {}, request: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: "1.0",
    session: { sessionId: "amzn1.echo-api.session.1", application: { applicationId: SKILL } },
    context: { System: { application: { applicationId: SKILL }, user: { userId: "amzn1.ask.account.X", accessToken: "wha_token" } } },
    request: {
      type: "IntentRequest",
      requestId: "amzn1.echo-api.request.1",
      timestamp: "2026-09-23T09:59:30Z",
      locale: "en-IN",
      intent: { name: "WonderHomeQueryIntent", slots: { utterance: { name: "utterance", value: "what's for dinner" } } },
      ...request,
    },
    ...over,
  });
}

function sign(raw: string, key = TEST_ALEXA_LEAF_KEY): string {
  const signer = createSign("RSA-SHA256");
  signer.update(raw, "utf8");
  return signer.sign(key, "base64");
}

describe("only Alexa's own certificate URL is fetched", () => {
  it("accepts the documented forms", () => {
    expect(certChainUrlAllowed("https://s3.amazonaws.com/echo.api/echo-api-cert.pem")).toBe(true);
    expect(certChainUrlAllowed("https://s3.amazonaws.com:443/echo.api/echo-api-cert.pem")).toBe(true);
    expect(certChainUrlAllowed("HTTPS://S3.AMAZONAWS.COM/echo.api/echo-api-cert.pem")).toBe(true);
  });

  it("refuses every documented bad form", () => {
    for (const url of [
      "http://s3.amazonaws.com/echo.api/echo-api-cert.pem",
      "https://notamazon.com/echo.api/echo-api-cert.pem",
      "https://s3.amazonaws.com/EcHo.aPi/echo-api-cert.pem",
      "https://s3.amazonaws.com/invalid.path/echo-api-cert.pem",
      "https://s3.amazonaws.com:563/echo.api/echo-api-cert.pem",
      "https://s3.amazonaws.com/echo.api/../evil/cert.pem",
      null,
      "not a url",
    ]) {
      expect(certChainUrlAllowed(url), String(url)).toBe(false);
    }
  });
});

describe("the signing certificate must be Alexa's, in date, and trusted", () => {
  it("accepts a chain to a trusted root that names echo-api.amazon.com", () => {
    const check = checkAlexaCertificate(splitPemChain(`${TEST_ALEXA_LEAF_PEM}\n${TEST_ROOT_PEM}`), CERT_NOW, [ROOT]);
    expect(check.ok).toBe(true);
  });

  it("refuses a certificate for another domain, even from the same root", () => {
    expect(checkAlexaCertificate(splitPemChain(`${TEST_OTHER_LEAF_PEM}\n${TEST_ROOT_PEM}`), CERT_NOW, [ROOT])).toEqual({ ok: false, reason: "wrong_domain" });
  });

  it("refuses a chain that ends at no root it trusts — the real roots do not know this test CA", () => {
    expect(checkAlexaCertificate(splitPemChain(`${TEST_ALEXA_LEAF_PEM}\n${TEST_ROOT_PEM}`), CERT_NOW)).toEqual({ ok: false, reason: "untrusted_chain" });
  });

  it("refuses a certificate outside its validity window, and an empty chain", () => {
    expect(checkAlexaCertificate(splitPemChain(TEST_ALEXA_LEAF_PEM), new Date("1999-01-01T00:00:00Z"), [ROOT])).toEqual({ ok: false, reason: "expired" });
    expect(checkAlexaCertificate([], CERT_NOW, [ROOT])).toEqual({ ok: false, reason: "empty" });
  });
});

describe("the signature covers the exact body", () => {
  const leaf = new X509Certificate(TEST_ALEXA_LEAF_PEM);

  it("a body signed by the certificate's key verifies", () => {
    const raw = body();
    expect(signatureMatches(leaf, sign(raw), raw)).toBe(true);
  });

  it("one changed character, another key, or no signature at all does not", () => {
    const raw = body();
    expect(signatureMatches(leaf, sign(raw), raw.replace("dinner", "dinnee"))).toBe(false);
    expect(signatureMatches(leaf, sign(raw, TEST_OTHER_LEAF_KEY), raw)).toBe(false);
    expect(signatureMatches(leaf, null, raw)).toBe(false);
    expect(signatureMatches(leaf, "not base64 !!", raw)).toBe(false);
  });

  it("a request older or newer than 150 seconds is a replay", () => {
    expect(timestampFresh("2026-09-23T09:57:31Z", NOW)).toBe(true);
    expect(timestampFresh("2026-09-23T09:57:29Z", NOW)).toBe(false);
    expect(timestampFresh("2026-09-23T10:02:31Z", NOW)).toBe(false);
    expect(timestampFresh(null, NOW)).toBe(false);
  });

  it("the skill is inert until its id is configured, and only a well-formed id counts", () => {
    expect(alexaSkillId({})).toBeNull();
    expect(alexaSkillId({ ALEXA_SKILL_ID: "someone-elses-skill" })).toBeNull();
    expect(alexaSkillId({ ALEXA_SKILL_ID: SKILL })).toBe(SKILL);
  });
});

describe("what Alexa asked, in HomeTalk's terms", () => {
  it("reads the utterance, the skill id and the WonderHome token — never Amazon's account id as identity", () => {
    const envelope = readAlexaEnvelope(body())!;
    expect(envelope).toMatchObject({ requestId: "amzn1.echo-api.request.1", intent: "WonderHomeQueryIntent", utterance: "what's for dinner", applicationId: SKILL, accessToken: "wha_token" });
    expect(JSON.stringify(envelope)).not.toContain("amzn1.ask.account");
  });

  it("malformed JSON or a request with no id is not a request", () => {
    expect(readAlexaEnvelope("{not json")).toBeNull();
    expect(readAlexaEnvelope(JSON.stringify({ request: { type: "IntentRequest" } }))).toBeNull();
  });

  it("launch, help, stop and cancel are answered here; everything else goes to HomeTalk", () => {
    expect(alexaTurn(readAlexaEnvelope(body({}, { type: "LaunchRequest", intent: undefined }))!)).toMatchObject({ kind: "local", endSession: false });
    expect(alexaTurn(readAlexaEnvelope(body({}, { intent: { name: "AMAZON.HelpIntent" } }))!)).toMatchObject({ kind: "local", endSession: false });
    expect(alexaTurn(readAlexaEnvelope(body({}, { intent: { name: "AMAZON.StopIntent" } }))!)).toMatchObject({ kind: "local", endSession: true });
    expect(alexaTurn(readAlexaEnvelope(body({}, { intent: { name: "AMAZON.CancelIntent" } }))!)).toMatchObject({ kind: "local", endSession: true });
    expect(alexaTurn(readAlexaEnvelope(body({}, { type: "SessionEndedRequest", intent: undefined }))!)).toEqual({ kind: "local", speech: null, endSession: true });
    expect(alexaTurn(readAlexaEnvelope(body())!)).toEqual({ kind: "hometalk", text: "what's for dinner" });
  });

  it("a spoken yes or no is HomeTalk's short reply, so a waiting proposal is approved there, under its own rules", () => {
    expect(alexaTurn(readAlexaEnvelope(body({}, { intent: { name: "AMAZON.YesIntent" } }))!)).toEqual({ kind: "hometalk", text: "yes" });
    expect(alexaTurn(readAlexaEnvelope(body({}, { intent: { name: "AMAZON.NoIntent" } }))!)).toEqual({ kind: "hometalk", text: "no" });
  });
});

describe("Alexa says what HomeTalk decided — and nothing it did not", () => {
  it("a question or a proposal keeps the session open for the answer", () => {
    const asking = alexaResponseFor({ requestId: "r", status: "clarification_required", speech: "Do you mean Asmi or Manan?", displayText: "" });
    expect(asking.response).toMatchObject({ shouldEndSession: false, outputSpeech: { text: "Do you mean Asmi or Manan?" } });
    const approval = alexaResponseFor({ requestId: "r", status: "approval_required", speech: "The electricity bill is ready to pay. Shall I go ahead?", displayText: "" });
    expect(approval.response.shouldEndSession).toBe(false);
    expect(approval.response.reprompt?.outputSpeech.text).toMatch(/yes or no/);
  });

  it("a failure says nothing changed, and never done", () => {
    const failed = alexaResponseFor({ requestId: "r", status: "failed", speech: "", displayText: "" });
    expect(failed.response.outputSpeech?.text).toBe("I couldn't do that right now. Nothing was changed.");
    expect(failed.response.shouldEndSession).toBe(true);
  });

  it("no markup reaches the speaker, and a long answer is cut at a word", () => {
    const long = alexaResponseFor({ requestId: "r", status: "answered", speech: `<speak>${"word ".repeat(300)}</speak>`, displayText: "" });
    expect(long.response.outputSpeech?.text).not.toMatch(/[<>]/);
    expect(long.response.outputSpeech!.text.length).toBeLessThanOrEqual(600);
  });

  it("an unlinked speaker gets Alexa's account-linking card and nothing about any home", () => {
    const response = linkAccountResponse();
    expect(response.response.card).toEqual({ type: "LinkAccount" });
    expect(response.response.shouldEndSession).toBe(true);
  });
});

describe("the skill's interaction model is the code's", () => {
  it("every committed locale model is exactly what alexaInteractionModel() generates", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dir = join(__dirname, "../../../../integrations/alexa/skill-package/interactionModels/custom");
    const files = readdirSync(dir).filter((file) => file.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(JSON.parse(readFileSync(join(dir, file), "utf8")), file).toEqual(alexaInteractionModel());
  });

  it("puts back the carrier word Alexa's free-text slot drops, exactly as spoken", () => {
    expect(withCarrier("WonderHomeWhatsIntent", "for dinner")).toBe("what's for dinner");
    expect(withCarrier("WonderHomeMyIntent", "BP was 128 over 82")).toBe("my BP was 128 over 82");
    expect(withCarrier("WonderHomeRemindMeIntent", "to buy milk tomorrow")).toBe("remind me to buy milk tomorrow");
    expect(withCarrier("WonderHomeQueryIntent", "what's happening tomorrow")).toBe("what's happening tomorrow");
    expect(alexaTurn(readAlexaEnvelope(body({}, { intent: { name: "WonderHomeAddIntent", slots: { utterance: { value: "milk to the grocery list" } } } }))!)).toEqual({ kind: "hometalk", text: "add milk to the grocery list" });
  });

  it("every carrier intent name is unique and Alexa-legal", () => {
    const names = Object.keys(ALEXA_CARRIERS);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[A-Za-z_]+$/);
  });
});

describe("the spec's three kinds of request, and a bare answer in between", () => {
  const intentOf = (name: string, slots: Record<string, unknown> = {}) => alexaTurn(readAlexaEnvelope(body({}, { intent: { name, slots } }))!);

  it("a status request asks HomeTalk the status question its own rules already answer", () => {
    expect(intentOf(ALEXA_STATUS_INTENT)).toEqual({ kind: "hometalk", text: ALEXA_STATUS_QUESTION });
    expect(looksLikeStatusQuestion(ALEXA_STATUS_QUESTION)).toBe(true);
  });

  it("an action is words for HomeTalk, whatever verb starts it — never a write of its own", () => {
    expect(intentOf("WonderHomeCreateIntent", { utterance: { value: "a reminder for the school meeting" } })).toEqual({ kind: "hometalk", text: "create a reminder for the school meeting" });
    expect(intentOf("WonderHomeCompleteIntent", { utterance: { value: "the laundry" } })).toEqual({ kind: "hometalk", text: "complete the laundry" });
    expect(intentOf("WonderHomeGiveMeIntent", { utterance: { value: "today's plan" } })).toEqual({ kind: "hometalk", text: "give me today's plan" });
  });

  it("a bare answer to WonderHome's own question reaches HomeTalk as said: \"What would you like to add?\" — \"Milk.\"", () => {
    expect(intentOf(ALEXA_ANSWER_INTENT, { answer: { name: "answer", value: "milk" } })).toEqual({ kind: "hometalk", text: "milk" });
    expect(intentOf(ALEXA_ANSWER_INTENT, { answer: { name: "answer", value: "the second one" } })).toEqual({ kind: "hometalk", text: "the second one" });
    // An answer Alexa heard nothing for is asked again, not guessed.
    expect(intentOf(ALEXA_ANSWER_INTENT, { answer: { name: "answer" } })).toMatchObject({ kind: "local", endSession: false });
  });

  it("the model carries both, and no sample belongs to two intents", () => {
    const model = alexaInteractionModel() as {
      interactionModel: { languageModel: { intents: { name: string; samples: string[]; slots?: { type: string }[] }[]; types: { name: string; values: unknown[] }[] } };
    };
    const { intents, types } = model.interactionModel.languageModel;
    expect(intents.find((intent) => intent.name === ALEXA_STATUS_INTENT)?.samples).toContain("for today's summary");
    const answer = intents.find((intent) => intent.name === ALEXA_ANSWER_INTENT);
    expect(answer?.samples).toContain("{answer}");
    expect(answer?.slots?.[0]?.type).toBe(ALEXA_ANSWER_TYPE);
    expect(types.find((type) => type.name === ALEXA_ANSWER_TYPE)?.values.length).toBeGreaterThan(20);
    const samples = intents.flatMap((intent) => intent.samples.map((sample) => sample.toLowerCase()));
    expect(new Set(samples).size).toBe(samples.length);
  });
});
