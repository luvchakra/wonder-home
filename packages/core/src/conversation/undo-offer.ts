import type { HouseholdIntent } from "./intent";

/**
 * What "undo" can take back (`executor.ts` `undoExecuted`), so a HomeTalk
 * reply offers it only where it works. Record first (owner, 2026-11-14):
 * everything HomeTalk records straight away says how to take it back, a bill
 * added from a sentence included (NSR-22, found missing by the live run).
 */
export const UNDOABLE: ReadonlySet<HouseholdIntent["action"]> = new Set(["add_to_list", "set_reminder", "record_absence", "plan_event", "plan_meal", "add_bill"]);
