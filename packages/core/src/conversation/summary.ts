import type { ActionPreview } from "./proposal";

/**
 * Recapping a conversation (item 6 of the live-conversation feature): what
 * was said, and what comes of it.
 *
 * Deterministic, on purpose, the same way `status.ts` composes an answer
 * from the household's own state rather than a model's impression of it —
 * a summary is arithmetic over what was already recorded, not a fresh
 * judgement, so nothing here needs a provider call or a fact to leave the
 * server. Every action already carries the same preview the household saw
 * before approving or executing it; this only restates it with what
 * actually happened since.
 */

export type SummarisedTurn = {
  role: "member" | "assistant" | "system";
  text: string;
  action: { status: "proposed" | "approved" | "rejected" | "executed" | "failed" | "expired"; preview: ActionPreview | null } | null;
};

const STATUS_WORD: Record<NonNullable<SummarisedTurn["action"]>["status"], string> = {
  proposed: "still waiting for your OK",
  approved: "approved",
  executed: "done",
  rejected: "cancelled",
  failed: "did not go through",
  expired: "expired — it was not acted on in time",
};

export function summarizeConversation(turns: readonly SummarisedTurn[]): string {
  const said = turns
    .filter((turn) => turn.role === "member")
    .map((turn) => turn.text.trim())
    .filter(Boolean);

  const actions = turns
    .flatMap((turn) => (turn.action?.preview ? [turn.action] : []))
    .filter((action): action is NonNullable<SummarisedTurn["action"]> => action !== null);

  const parts: string[] = ["**Conversation summary**"];
  if (said.length === 0) {
    parts.push("Nothing was said before this ended.");
  } else {
    parts.push(...said.map((line) => `- ${capitalize(line.replace(/[.?!]+$/, ""))}`));
  }

  parts.push("**What happens next**");
  if (actions.length === 0) {
    parts.push("Nothing was proposed or changed — this was just a chat.");
  } else {
    parts.push(...actions.map((action) => `- ${action.preview!.summary} — ${STATUS_WORD[action.status]}.`));
  }

  return parts.join("\n");
}

function capitalize(value: string): string {
  return value.length > 0 ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}
