import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The owner's rule (2026-11-22): "HomeBrain is supposed to have the
 * intelligence related algorithms, homesend is supposed to have the data
 * transfer related features." HomeBrain holds all understanding, deciding and
 * learning; HomeSend only moves data in and out, and reaches HomeBrain through
 * `homebrain/intake-api.ts`. Checked structurally, so a shortcut added later
 * fails here rather than drifting back.
 */

const SRC = join(__dirname, "..");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return name.endsWith(".ts") && !name.endsWith(".test.ts") && name !== "testing.ts" ? [path] : [];
  });
}

/** Every module a file loads at run time: static and dynamic imports and re-exports, not `import type`. */
function runtimeImports(file: string): string[] {
  const code = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  const found: string[] = [];
  for (const match of code.matchAll(/^\s*(import|export)\s+(type\s+)?[^;]*?from\s+"([^"]+)"/gm)) if (!match[2]) found.push(match[3]!);
  for (const match of code.matchAll(/(?<!typeof\s)\bimport\(\s*"([^"]+)"\s*\)(?!\.)/g)) found.push(match[1]!);
  return found;
}

/** Model clients, embeddings and the model readers: understanding, which HomeSend never does itself. */
const MODEL_CODE = [/(^|\/)ai\/provider-clients$/, /(^|\/)ai\/model-client$/, /(^|\/)ai\/classify-intake$/, /(^|\/)ai\/read-words$/, /(^|\/)ai\/credentials$/, /(^|\/)ai\/model-key$/, /(^|\/)sleep\/embeddings$/, /^@anthropic-ai\//, /^openai/, /^@google\//, /^ai$/, /^@ai-sdk\//];

/** HomeSend's channels and transfer plumbing: HomeBrain never calls them. */
const CHANNEL_CODE = [/(^|\/)whatsapp\//, /(^|\/)email\//, /homesend\/(email-[a-z-]+|share-handoff|channels|addresses|sender-trust|sender-pretrust|trusted-arrival|link-fetch|retry-queue|ingest|rate-limit|malware-scan|security)$/];

describe("HomeBrain holds the intelligence, HomeSend moves the data (owner, 2026-11-22)", () => {
  it("no HomeSend file loads a model client, embeddings or a model reader", () => {
    const offenders = sources(join(SRC, "homesend")).flatMap((file) =>
      runtimeImports(file).filter((spec) => MODEL_CODE.some((rule) => rule.test(spec))).map((spec) => `${relative(SRC, file)} → ${spec}`),
    );
    expect(offenders).toEqual([]);
  });

  it("HomeSend reaches HomeBrain only through homebrain/intake-api", () => {
    const offenders = sources(join(SRC, "homesend")).flatMap((file) => {
      const all = [...readFileSync(file, "utf8").matchAll(/(?:from\s+|import\(\s*)"([^"]*homebrain\/[^"]+)"/g)].map((match) => match[1]!);
      return all.filter((spec) => !/homebrain\/intake-api$/.test(spec)).map((spec) => `${relative(SRC, file)} → ${spec}`);
    });
    expect(offenders).toEqual([]);
  });

  it("no HomeBrain file calls a HomeSend channel", () => {
    const offenders = sources(join(SRC, "homebrain")).flatMap((file) =>
      runtimeImports(file).filter((spec) => CHANNEL_CODE.some((rule) => rule.test(spec))).map((spec) => `${relative(SRC, file)} → ${spec}`),
    );
    expect(offenders).toEqual([]);
  });

  it("the rule bites: a model client import in HomeSend is caught", () => {
    expect(MODEL_CODE.some((rule) => rule.test("../ai/provider-clients"))).toBe(true);
    expect(MODEL_CODE.some((rule) => rule.test("../homebrain/sleep/embeddings"))).toBe(true);
    expect(CHANNEL_CODE.some((rule) => rule.test("../../homesend/email-webhook"))).toBe(true);
    expect(CHANNEL_CODE.some((rule) => rule.test("../../whatsapp/intake"))).toBe(true);
    expect(CHANNEL_CODE.some((rule) => rule.test("../../homesend/items"))).toBe(false);
  });
});
