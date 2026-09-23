import { describe, expect, it } from "vitest";

import { describeKeySource, platformKey, resolveModelKey } from "./model-key";

describe("which key answers for a household", () => {
  const theirs = { provider: "anthropic" as const, key: "household-key-for-tests-only" };
  const ours = { provider: "anthropic" as const, key: "platform-key-for-tests-only" };

  it("uses WonderHome's own key when the household has not set one", () => {
    expect(resolveModelKey(null, ours)).toEqual({
      source: "platform",
      provider: "anthropic",
      key: ours.key,
    });
  });

  it("prefers the household's own key over the platform's", () => {
    expect(resolveModelKey(theirs, ours)).toMatchObject({ source: "household", key: theirs.key });
  });

  it("falls back to the platform key when the household's is blank rather than absent", () => {
    expect(resolveModelKey({ provider: "anthropic", key: "   " }, ours)).toMatchObject({
      source: "platform",
    });
  });

  it("reports none when neither exists, rather than inventing a provider", () => {
    expect(resolveModelKey(null, null)).toEqual({ source: "none", provider: null, key: null });
  });

  it("lets a household use a different provider from the platform's", () => {
    expect(resolveModelKey({ provider: "google", key: "goog-0123456789012345" }, ours)).toMatchObject({
      source: "household",
      provider: "google",
    });
  });
});

describe("the platform's own key", () => {
  it("is absent when the environment does not set one", () => {
    expect(platformKey({})).toBeNull();
    expect(platformKey({ WONDERHOME_AI_KEY: "   " })).toBeNull();
  });

  it("defaults to Anthropic, which CLAUDE.md names as the primary provider", () => {
    expect(platformKey({ WONDERHOME_AI_KEY: "platform-key-for-tests-only" })).toEqual({
      provider: "anthropic",
      key: "platform-key-for-tests-only",
    });
  });

  it("accepts a configured alternative and ignores one it does not support", () => {
    expect(
      platformKey({ WONDERHOME_AI_KEY: "k-0123456789012345678", WONDERHOME_AI_PROVIDER: "google" }),
    ).toMatchObject({ provider: "google" });

    expect(
      platformKey({ WONDERHOME_AI_KEY: "k-0123456789012345678", WONDERHOME_AI_PROVIDER: "wishful" }),
    ).toMatchObject({ provider: "anthropic" });
  });

  it("reads the names an operator actually writes, so a Gemini key is never sent to Anthropic", () => {
    const key = "k-0123456789012345678";
    expect(platformKey({ WONDERHOME_AI_KEY: key, WONDERHOME_AI_PROVIDER: "gemini" })).toMatchObject({ provider: "google" });
    expect(platformKey({ WONDERHOME_AI_KEY: key, WONDERHOME_AI_PROVIDER: " Gemini " })).toMatchObject({ provider: "google" });
    expect(platformKey({ WONDERHOME_AI_KEY: key, WONDERHOME_AI_PROVIDER: "Claude" })).toMatchObject({ provider: "anthropic" });
    expect(platformKey({ WONDERHOME_AI_KEY: key, WONDERHOME_AI_PROVIDER: "chatgpt" })).toMatchObject({ provider: "openai" });
  });

  it("falls back to the provider the key's own prefix names, before assuming Anthropic", () => {
    expect(platformKey({ WONDERHOME_AI_KEY: "AIza-test-key-not-real" })).toMatchObject({ provider: "google" });
    expect(platformKey({ WONDERHOME_AI_KEY: "AIza-test-key-not-real", WONDERHOME_AI_PROVIDER: "wishful" })).toMatchObject({ provider: "google" });
    expect(platformKey({ WONDERHOME_AI_KEY: "sk-ant-test-not-real" })).toMatchObject({ provider: "anthropic" });
    expect(platformKey({ WONDERHOME_AI_KEY: "sk-test-not-real" })).toMatchObject({ provider: "openai" });
    // A name the operator did write, and we do recognise, still wins.
    expect(platformKey({ WONDERHOME_AI_KEY: "AIza-test-key-not-real", WONDERHOME_AI_PROVIDER: "anthropic" })).toMatchObject({ provider: "anthropic" });
  });
});

describe("what a household is told about it", () => {
  it("never describes the absent case as broken", () => {
    const none = describeKeySource("none");

    expect(none.detail).toContain("still works");
    expect(none.title).not.toMatch(/error|fail/i);
  });

  it("says whose bill a household key is on", () => {
    expect(describeKeySource("household").detail).toContain("your provider account");
  });

  it("says the platform key is included, and does not claim training data rights", () => {
    expect(describeKeySource("platform").detail).toContain("never used to train");
  });
});
