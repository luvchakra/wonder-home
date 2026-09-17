import { describe, expect, it } from "vitest";

import { FLAG_DEFINITIONS, flagEnvName, resolveFlags } from "./flags";

describe("feature flags", () => {
  it("falls back to each flag's documented default", () => {
    expect(resolveFlags({})).toEqual({
      voice_conversation: false,
      proactive_agents: false,
      whatsapp_channel: false,
    });
  });

  it("accepts the usual truthy and falsy spellings", () => {
    expect(
      resolveFlags({
        WONDERHOME_FLAG_VOICE_CONVERSATION: "true",
        WONDERHOME_FLAG_PROACTIVE_AGENTS: "1",
        WONDERHOME_FLAG_WHATSAPP_CHANNEL: "OFF",
      }),
    ).toEqual({ voice_conversation: true, proactive_agents: true, whatsapp_channel: false });
  });

  it("treats an unparseable value as a loud configuration error, not a silent false", () => {
    expect(() => resolveFlags({ WONDERHOME_FLAG_VOICE_CONVERSATION: "maybe" })).toThrowError(
      /WONDERHOME_FLAG_VOICE_CONVERSATION/,
    );
  });

  it("derives a predictable environment variable name per flag", () => {
    expect(flagEnvName("whatsapp_channel")).toBe("WONDERHOME_FLAG_WHATSAPP_CHANNEL");
  });

  it("documents every flag it defines", () => {
    for (const [name, definition] of Object.entries(FLAG_DEFINITIONS)) {
      expect(definition.description, `${name} needs a description`).toBeTruthy();
    }
  });
});
