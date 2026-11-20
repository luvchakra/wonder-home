import { afterEach, describe, expect, it } from "vitest";

import { checkModelKey, keyCheckWords } from "./key-check";
import { forgetRefusedKeys, keyRefusedRecently, noteKeyFailure, refusedResponse } from "./key-alerts";

const ANTHROPIC = "sk-ant-api03-test-key-000000000000000000ABCD";
const GOOGLE = "AIzaSyTestKey000000000000000000000000";

function answering(status: number, body = "{}") {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string> });
    return new Response(body, { status });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

afterEach(() => forgetRefusedKeys());

describe("checking WonderHome's own key when it is saved, and on Test key (2026-11-21)", () => {
  it("says a Google key won't work with Anthropic, without sending it anywhere", async () => {
    const net = answering(200);
    const check = await checkModelKey("anthropic", GOOGLE, net.fetchImpl);
    expect(check).toEqual({ ok: false, reason: "mismatch", provider: "anthropic", looksLike: "google" });
    expect(net.calls).toEqual([]);
    expect(keyCheckWords(check).message).toBe("This looks like a Google key but the provider is set to Anthropic. Set the provider to Google, or paste an Anthropic key.");
  });

  it("says Anthropic refused a refused key, and what to do", async () => {
    const check = await checkModelKey("anthropic", ANTHROPIC, answering(401, '{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}').fetchImpl);
    expect(check).toMatchObject({ ok: false, reason: "refused", kind: "key_rejected" });
    expect(keyCheckWords(check).message).toBe("Anthropic refused this key. Create a new key in Anthropic's console and save it here.");
  });

  it("accepts a working key with the cheapest authenticated call, the key in a header only", async () => {
    const net = answering(200);
    expect(await checkModelKey("anthropic", ANTHROPIC, net.fetchImpl)).toEqual({ ok: true, provider: "anthropic" });
    expect(net.calls[0]!.url).toBe("https://api.anthropic.com/v1/models?limit=1");
    expect(net.calls[0]!.url).not.toContain(ANTHROPIC);
    expect(net.calls[0]!.headers["x-api-key"]).toBe(ANTHROPIC);
  });

  it("an unreachable provider is no verdict on the key", async () => {
    const down = (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    expect(await checkModelKey("anthropic", ANTHROPIC, down)).toEqual({ ok: false, reason: "unreachable", provider: "anthropic" });
  });
});

describe("a refused key fails fast (2026-11-21: one reading's steps each waited on the same refusal)", () => {
  it("is not sent again for a minute after a refusal, and answers as a refusal the SDK never retries", async () => {
    expect(keyRefusedRecently(ANTHROPIC)).toBe(false);
    await noteKeyFailure(ANTHROPIC, "anthropic", "key_rejected", 1_000);
    expect(keyRefusedRecently(ANTHROPIC, 30_000)).toBe(true);
    expect(keyRefusedRecently(ANTHROPIC, 62_000)).toBe(false);
    expect(refusedResponse("anthropic").status).toBe(401);
  });

  it("a quota refusal is not held: a per-minute limit passes", async () => {
    await noteKeyFailure(ANTHROPIC, "anthropic", "quota_exhausted", 1_000);
    expect(keyRefusedRecently(ANTHROPIC, 2_000)).toBe(false);
  });
});
