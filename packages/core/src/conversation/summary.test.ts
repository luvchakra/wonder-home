import { describe, expect, it } from "vitest";

import { summarizeConversation, type SummarisedTurn } from "./summary";

const preview = (summary: string) => ({ summary, changes: [], because: "", reversible: true });

describe("summarizing a conversation", () => {
  it("lists what the member said and says plainly when nothing came of it", () => {
    const turns: SummarisedTurn[] = [
      { role: "member", text: "what's going on in my home", action: null },
      { role: "assistant", text: "All quiet.", action: null },
      { role: "member", text: "add milk to the list.", action: { status: "executed", preview: preview("Add milk to the groceries") } },
    ];

    const text = summarizeConversation(turns);
    expect(text).toContain("**Conversation summary**");
    expect(text).toContain("- What's going on in my home");
    expect(text).toContain("- Add milk to the list");
    expect(text).toContain("**What happens next**");
    expect(text).toContain("- Add milk to the groceries — done.");
  });

  it("names every action's real outcome, not just the ones that went through", () => {
    const turns: SummarisedTurn[] = [
      { role: "member", text: "pay the electricity bill", action: { status: "proposed", preview: preview("Pay the electricity bill") } },
      { role: "member", text: "move karate to friday", action: { status: "rejected", preview: preview("Move karate to Friday") } },
    ];

    const text = summarizeConversation(turns);
    expect(text).toContain("- Pay the electricity bill — still waiting for your OK.");
    expect(text).toContain("- Move karate to Friday — cancelled.");
  });

  it("says so honestly when nothing was said or proposed", () => {
    expect(summarizeConversation([])).toBe(
      "**Conversation summary**\nNothing was said before this ended.\n**What happens next**\nNothing was proposed or changed — this was just a chat.",
    );
  });
});
