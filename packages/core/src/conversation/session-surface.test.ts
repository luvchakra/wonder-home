import { describe, expect, it } from "vitest";

import { fakeSupabase } from "../homesend/testing";
import { currentSessionId, openSession, surfaceForChannel } from "./repository";

/**
 * Voice integration phase 5, "Cross-channel continuity": household truth is
 * shared, conversation state is not. A question the app asked is never
 * answered — and a proposal it made never approved — by something said to
 * Alexa, because every pending question and proposal hangs off its session.
 */
describe("a conversation belongs to the surface it happens on", () => {
  const household = "hh-1";
  const member = "m-1";

  it("the app and in-app Gemini share one conversation; Alexa has its own", () => {
    expect(surfaceForChannel("web")).toBe("app");
    expect(surfaceForChannel("mobile")).toBe("app");
    expect(surfaceForChannel("gemini_voice")).toBe("app");
    expect(surfaceForChannel(undefined)).toBe("app");
    expect(surfaceForChannel("alexa")).toBe("alexa");
  });

  it("opening Alexa's session never returns the app's open one, and each surface reuses its own", async () => {
    const { client, tables } = fakeSupabase({ conversation_sessions: [] });
    const app = await openSession(client, { householdId: household, memberId: member, channel: "text" });
    const alexa = await openSession(client, { householdId: household, memberId: member, channel: "voice", surface: "alexa" });
    expect(alexa).not.toBe(app);
    expect(await openSession(client, { householdId: household, memberId: member, channel: "voice", surface: "app" })).toBe(app);
    expect(await openSession(client, { householdId: household, memberId: member, channel: "voice", surface: "alexa" })).toBe(alexa);
    expect(tables.conversation_sessions!.map((row) => row.surface)).toEqual(["app", "alexa"]);
  });

  it("the HomeTalk screen shows the app's conversation, never the speaker's", async () => {
    const { client } = fakeSupabase({ conversation_sessions: [] });
    const alexa = await openSession(client, { householdId: household, memberId: member, channel: "voice", surface: "alexa" });
    expect(await currentSessionId(client, household, member)).toBeNull();
    const app = await openSession(client, { householdId: household, memberId: member, channel: "text" });
    expect(await currentSessionId(client, household, member)).toBe(app);
    expect(await currentSessionId(client, household, member, "alexa")).toBe(alexa);
  });
});
