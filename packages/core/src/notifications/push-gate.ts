/**
 * Whether a notification is worth interrupting someone's phone for (story
 * 23-015). The inbox always has it; a push is the exception, so it has to
 * earn the buzz:
 *
 * - **Critical** always goes, quiet hours or not (`selectChannels`), and
 *   never counts against anything — a gas leak is not rationed.
 * - **High** goes, up to a generous daily ceiling.
 * - **Normal** goes only when it is a reminder timed for this person
 *   (`reason: "reminder"` — a bill due, a class to pack for, the cook's
 *   list), within a tighter ceiling. An ordinary "for your information"
 *   stays in the app.
 * - **Low** never interrupts.
 *
 * The person, the moment and the words were already decided upstream: one
 * recipient (`plan.ts`), at the time chosen for them (`policies.ts`,
 * `timing.ts`), in their own language (`message.ts`), and a reminder whose
 * record is settled is resolved before it ever comes due. This only decides
 * whether it also buzzes.
 */
export const PUSH_DAILY_LIMIT = { high: 8, normal: 4 } as const;

export type PushReason = "reminder" | "alert";

export function pushWorthSending(input: {
  priority: "low" | "normal" | "high" | "critical";
  reason: PushReason;
  /** Pushes this person already had in the last 24 hours. */
  sentToday: number;
}): boolean {
  if (input.priority === "critical") return true;
  if (input.priority === "high") return input.sentToday < PUSH_DAILY_LIMIT.high;
  if (input.priority === "normal") return input.reason === "reminder" && input.sentToday < PUSH_DAILY_LIMIT.normal;
  return false;
}
