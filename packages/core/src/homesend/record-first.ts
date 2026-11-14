/**
 * Record first (the owner, 2026-11-14: "minimum intervention is required to
 * input information in the app, ensure its not stuck in review"; plan
 * "Nothing stuck in review", phase 2, decisions 1, 2 and 5).
 *
 * Writing something down is reversible, so it never waits: it is recorded at
 * once, attributed, audited and undoable, confirmed above the household's bar
 * and Checking below it. Only actions wait for a person: paying, ordering,
 * messaging someone outside the household, booking, cancelling, deleting and
 * sharing. Each of the three decisions below can be switched back by an
 * Admin on Settings → AI Assistant, on its own.
 *
 * Pure, so screens can show the choices; the stored values are read and saved
 * in `household/record-first-repository.ts`.
 */

/**
 * Decision 1: what an area set to "Wait for Approval" holds.
 * - `actions` (default): only actions wait; recording in that area is
 *   automatic, confirmed above the bar and Checking below it.
 * - `everything`: the 3 Nov behaviour, recording waits for approval too.
 */
export const APPROVAL_SCOPES = ["actions", "everything"] as const;
export type ApprovalScope = (typeof APPROVAL_SCOPES)[number];
export const DEFAULT_APPROVAL_SCOPE: ApprovalScope = "actions";

/**
 * Decision 2: bills, receipts and health documents. Replaces the two
 * "Add money / health entries directly" switches.
 * - `checking` (default): recorded as Checking whatever the score, so a
 *   person confirms with one tap; a bill's reminders say "check before paying".
 * - `confirmed`: recorded confirmed above the bar, Checking below it (the old
 *   switch on).
 * - `review`: waits for a person in HomeSend (the 3 Nov behaviour).
 * Paying never happens, in any of them.
 */
export const MONEY_HEALTH_MODES = ["checking", "confirmed", "review"] as const;
export type MoneyHealthMode = (typeof MONEY_HEALTH_MODES)[number];
export const DEFAULT_MONEY_HEALTH_MODE: MoneyHealthMode = "checking";

/**
 * Decision 5: email from outside the household.
 * - `ask_once` (default): the first item from a sender nobody has approved is
 *   held and the household is asked "Trust this sender?" once. A trusted
 *   sender's items flow like a member's from then on.
 * - `review`: the 3 Nov behaviour: only senders an Admin added are read, and
 *   their items wait for a person.
 */
export const OUTSIDE_SENDER_MODES = ["ask_once", "review"] as const;
export type OutsideSenderMode = (typeof OUTSIDE_SENDER_MODES)[number];
export const DEFAULT_OUTSIDE_SENDER_MODE: OutsideSenderMode = "ask_once";

export type RecordFirstSettings = {
  approvalScope: ApprovalScope;
  moneyHealth: MoneyHealthMode;
  outsideSenders: OutsideSenderMode;
};

export const DEFAULT_RECORD_FIRST: RecordFirstSettings = {
  approvalScope: DEFAULT_APPROVAL_SCOPE,
  moneyHealth: DEFAULT_MONEY_HEALTH_MODE,
  outsideSenders: DEFAULT_OUTSIDE_SENDER_MODE,
};

/**
 * The careful answer when the settings can't be read: everything waits, as
 * before 14 Nov. A read failure never lets more through than a stored choice.
 */
export const CAREFUL_RECORD_FIRST: RecordFirstSettings = { approvalScope: "everything", moneyHealth: "review", outsideSenders: "review" };

function oneOf<T extends string>(values: readonly T[], value: unknown): T | null {
  return typeof value === "string" && (values as readonly string[]).includes(value) ? (value as T) : null;
}

export function asApprovalScope(value: unknown): ApprovalScope {
  return oneOf(APPROVAL_SCOPES, value) ?? DEFAULT_APPROVAL_SCOPE;
}
export function asMoneyHealthMode(value: unknown): MoneyHealthMode {
  return oneOf(MONEY_HEALTH_MODES, value) ?? DEFAULT_MONEY_HEALTH_MODE;
}
export function asOutsideSenderMode(value: unknown): OutsideSenderMode {
  return oneOf(OUTSIDE_SENDER_MODES, value) ?? DEFAULT_OUTSIDE_SENDER_MODE;
}

/**
 * Each area's mode before anyone picks the new setting, read from the two old
 * switches: a switch on is "confirmed" (what it did); off is the new default,
 * "checking" (decision 2 replaces "off means wait").
 */
export function moneyHealthFromLegacy(on: boolean): MoneyHealthMode {
  return on ? "confirmed" : DEFAULT_MONEY_HEALTH_MODE;
}
