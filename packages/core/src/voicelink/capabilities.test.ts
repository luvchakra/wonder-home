import { describe, expect, it } from "vitest";

import { INTENT_ACTIONS } from "../conversation/intent";
import { CAPABILITY_CHANNELS, capabilityForAction, channelSummary, VOICE_CAPABILITIES } from "./capabilities";
import { GEMINI_LIVE_TOOL_NAMES, inAppVoiceScopes } from "./gemini-live";
import { DEFAULT_VOICE_SCOPES, SENSITIVE_VOICE_SCOPES, VOICE_SCOPES, voiceAllowsAction } from "./scopes";

/**
 * The capability matrix (voice phase 5) is policy written down; these tests
 * hold every cell of it to the gates that actually decide — so the matrix
 * can never say a channel may do something it cannot, or leave out
 * something it can.
 */

const ALL_SCOPES = [...VOICE_SCOPES];
const ALL_CLASSES = ["general", "child", "health", "financial", "location", "private_message"] as const;

describe("every HomeTalk action is placed in the matrix on purpose", () => {
  it("each action belongs to exactly one capability", () => {
    for (const action of INTENT_ACTIONS) {
      const owners = VOICE_CAPABILITIES.filter((capability) => capability.actions.includes(action));
      expect(owners.map((owner) => owner.id), action).toHaveLength(1);
    }
    expect(capabilityForAction("make_payment")?.id).toBe("payments");
  });

  it("capability ids are unique and every channel has a policy", () => {
    expect(new Set(VOICE_CAPABILITIES.map((capability) => capability.id)).size).toBe(VOICE_CAPABILITIES.length);
    for (const capability of VOICE_CAPABILITIES) for (const channel of CAPABILITY_CHANNELS) expect(capability.policy[channel], `${capability.id}/${channel}`).toBeTruthy();
  });
});

describe("what the matrix promises a voice channel, the voice gate allows — and nothing more", () => {
  it("an app-only capability is refused over any voice link, whatever scopes it holds", () => {
    for (const capability of VOICE_CAPABILITIES) {
      for (const channel of ["gemini_voice", "alexa"] as const) {
        if (capability.policy[channel] !== "app_only") continue;
        for (const action of capability.actions) expect(voiceAllowsAction(action, ALL_SCOPES), `${capability.id}/${channel}/${action}`).toBe(false);
        expect(capability.note, `${capability.id} says where it can be done`).toMatch(/app/);
      }
    }
  });

  it("an available capability is allowed with its scope, and refused without it", () => {
    for (const capability of VOICE_CAPABILITIES) {
      if (capability.policy.alexa === "app_only") continue;
      for (const action of capability.actions) {
        expect(voiceAllowsAction(action, ALL_SCOPES), `${capability.id}/${action}`).toBe(true);
        if (capability.scope && action !== "ask_status" && action !== "greet" && action !== "unknown") {
          expect(voiceAllowsAction(action, ALL_SCOPES.filter((scope) => scope !== capability.scope)), `${capability.id}/${action} without ${capability.scope}`).toBe(false);
        }
      }
    }
  });

  it("paying and ordering always wait for approval in the app, and are never done by voice", () => {
    for (const id of ["payments", "orders"]) {
      const capability = VOICE_CAPABILITIES.find((entry) => entry.id === id)!;
      expect(capability.policy).toEqual({ app: "approval", gemini_voice: "app_only", alexa: "app_only" });
    }
  });
});

describe("Alexa: everyday things by default, sensitive things only when the member turned them on", () => {
  it("'yes' for Alexa is a default scope; 'opt_in' is a sensitive scope that starts off", () => {
    for (const capability of VOICE_CAPABILITIES) {
      if (!capability.scope) continue;
      if (capability.policy.alexa === "yes") expect(DEFAULT_VOICE_SCOPES, capability.id).toContain(capability.scope);
      if (capability.policy.alexa === "opt_in") {
        expect(SENSITIVE_VOICE_SCOPES, capability.id).toContain(capability.scope);
        expect(DEFAULT_VOICE_SCOPES, capability.id).not.toContain(capability.scope);
      }
    }
  });
});

describe("Gemini Voice: every tool is placed, and consent decides the sensitive ones", () => {
  it("the matrix names every Gemini tool exactly once, and no tool it does not have", () => {
    const named = VOICE_CAPABILITIES.flatMap((capability) => capability.geminiTools);
    expect([...named].sort()).toEqual([...GEMINI_LIVE_TOOL_NAMES].sort());
  });

  it("an app-only capability has no Gemini tool", () => {
    for (const capability of VOICE_CAPABILITIES) if (capability.policy.gemini_voice === "app_only") expect(capability.geminiTools, capability.id).toEqual([]);
  });

  it("'consent' means the scope is open only when the household lets that class reach a model provider", () => {
    for (const capability of VOICE_CAPABILITIES) {
      if (capability.policy.gemini_voice !== "consent") continue;
      expect(capability.contentClass, capability.id).toBeTruthy();
      expect(inAppVoiceScopes(["general"]), capability.id).not.toContain(capability.scope);
      expect(inAppVoiceScopes(["general", capability.contentClass!]), capability.id).toContain(capability.scope);
    }
  });

  it("'yes' means the scope is open under the default agreement", () => {
    for (const capability of VOICE_CAPABILITIES) {
      if (capability.policy.gemini_voice !== "yes" || !capability.scope) continue;
      expect(inAppVoiceScopes(["general"]), capability.id).toContain(capability.scope);
    }
    expect(inAppVoiceScopes([...ALL_CLASSES])).toEqual(ALL_SCOPES);
  });
});

describe("the matrix as a household reads it", () => {
  it("the app can do everything; voice channels send the sensitive changes to the app", () => {
    expect(channelSummary("app").appOnly).toEqual([]);
    const gemini = channelSummary("gemini_voice");
    expect(gemini.appOnly.map((capability) => capability.id)).toEqual(expect.arrayContaining(["payments", "orders", "household_admin"]));
    expect(gemini.available.map((capability) => capability.id)).toEqual(expect.arrayContaining(["household_questions", "groceries_write", "reminders"]));
    expect(channelSummary("alexa").conditional.map((capability) => capability.id)).toEqual(expect.arrayContaining(["school", "health", "financial_status"]));
  });
});
