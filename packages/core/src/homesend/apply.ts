import { ApiError } from "../api/errors";
import type { EvidenceRef, PageReport } from "./document";
import type { DocumentPlan, PlanEntry, PlanFieldChange } from "./plan";

/**
 * Applying a document's change plan, and the exact receipt it leaves
 * (Deep Document Understanding 2.0 §22–27, §42–44).
 *
 * The plan was built by WonderHome and rebuilt on the server from the stored
 * reading — never taken from the browser. A person only chooses which of its
 * changes to include and answers its questions. Each included change goes
 * through its own domain service (the `PlanWriter` a caller supplies), one
 * at a time, and whatever happens to each one is said, record by record:
 *
 *   created · updated · cancelled — written, verified and recorded for undo
 *   unchanged                     — already on record, or a newer record stood
 *   skipped                       — the person left it out
 *   needs_clarification           — a question nobody answered yet
 *   failed                        — the domain refused it; nothing is claimed
 *
 * A partial failure is never reported as success (§43), and a document with
 * nothing new is a successful outcome in its own right (§27).
 */

export type ReceiptAction = "created" | "updated" | "cancelled" | "unchanged" | "skipped" | "needs_clarification" | "failed";

export const RECEIPT_ACTIONS: readonly ReceiptAction[] = ["updated", "cancelled", "created", "unchanged", "skipped", "needs_clarification", "failed"];

export type ReceiptChange = {
  key: string;
  title: string;
  domain: PlanEntry["domain"];
  action: ReceiptAction;
  entityId: string | null;
  /** The `homesend_changes` row undo reverses; null when nothing was written. */
  changeId: string | null;
  fields: PlanFieldChange[];
  evidence: EvidenceRef;
  /** One line: what happened, in the household's words. */
  reason: string;
  /** Why it could not be done, when it could not. Never a stack or a code. */
  error?: string;
};

export type ReceiptStatus = "completed" | "partial" | "failed" | "needs_review" | "no_change";

export type IntakeChangeReceipt = {
  version: 1;
  intakeId: string;
  status: ReceiptStatus;
  appliedAt: string;
  pages: PageReport;
  changes: ReceiptChange[];
  counts: Record<ReceiptAction, number>;
};

export type WriteResult = { entityId: string; previous?: Record<string, unknown> | null };

/** The domain services, as the caller wires them — each throws when its domain refuses. */
export type PlanWriter = {
  create(entry: PlanEntry): Promise<WriteResult>;
  update(entry: PlanEntry): Promise<WriteResult>;
  cancel(entry: PlanEntry): Promise<WriteResult>;
  /** Records the write for undo and provenance; returns the change's id. */
  record(entry: PlanEntry, result: WriteResult, changeType: "created" | "updated" | "cancelled"): Promise<string>;
};

/** What the household is told when a domain refuses — plain, and never an internal detail. */
const REFUSED: Record<PlanEntry["domain"], string> = {
  school_item: "Kids & School did not accept it.",
  bill: "Bills did not accept it.",
  grocery_item: "Groceries did not accept it.",
};

const WRITTEN: Record<"create" | "update" | "cancel", "created" | "updated" | "cancelled"> = { create: "created", update: "updated", cancel: "cancelled" };

function unwrittenReason(entry: PlanEntry, included: boolean): { action: ReceiptAction; reason: string } {
  switch (entry.action) {
    case "no_change":
      return { action: "unchanged", reason: entry.reason };
    case "conflict":
      return { action: "unchanged", reason: `${entry.existing?.title ?? entry.title} was changed after the document was written, so it stays as it is.` };
    case "needs_answer":
      return { action: "needs_clarification", reason: entry.question?.text ?? "Who is it for?" };
    default:
      return included ? { action: "skipped", reason: "Not applied." } : { action: "skipped", reason: "You left this out." };
  }
}

export async function applyDocumentPlan(
  plan: DocumentPlan,
  included: ReadonlySet<string>,
  writer: PlanWriter,
  options: { intakeId: string; now?: Date },
): Promise<IntakeChangeReceipt> {
  const changes: ReceiptChange[] = [];
  for (const entry of plan.entries) {
    const base = { key: entry.key, title: entry.title, domain: entry.domain, evidence: entry.evidence, fields: entry.changes, entityId: entry.existing?.id ?? null, changeId: null };
    const writes = entry.action === "create" || entry.action === "update" || entry.action === "cancel";
    if (!writes || !included.has(entry.key)) {
      changes.push({ ...base, ...unwrittenReason(entry, included.has(entry.key)) });
      continue;
    }
    const kind = entry.action as "create" | "update" | "cancel";
    let result: WriteResult;
    try {
      result = await writer[kind](entry);
    } catch (thrown) {
      changes.push({ ...base, action: "failed", reason: `Could not ${kind === "create" ? "add" : kind} ${entry.title}.`, error: refusal(thrown, entry) });
      continue;
    }
    const action = WRITTEN[kind];
    let changeId: string | null = null;
    let error: string | undefined;
    try {
      changeId = await writer.record(entry, result, action);
    } catch {
      // Written, but not recorded: said plainly, never hidden and never
      // reported as a failure of a write that happened.
      error = "Saved, but it could not be recorded for undo — change it on its own screen if it needs undoing.";
    }
    changes.push({ ...base, action, entityId: result.entityId, changeId, reason: doneReason(entry, action), ...(error ? { error } : {}) });
  }

  const counts = Object.fromEntries(RECEIPT_ACTIONS.map((action) => [action, changes.filter((change) => change.action === action).length])) as Record<ReceiptAction, number>;
  const written = counts.created + counts.updated + counts.cancelled;
  const status: ReceiptStatus =
    counts.failed > 0 ? (written > 0 ? "partial" : "failed") : written > 0 ? "completed" : counts.needs_clarification > 0 ? "needs_review" : "no_change";
  return { version: 1, intakeId: options.intakeId, status, appliedAt: (options.now ?? new Date()).toISOString(), pages: plan.pages, changes, counts };
}

/** A domain's own refusal when it was written for a person (an `ApiError`); otherwise the plain line — never an internal detail. */
function refusal(thrown: unknown, entry: PlanEntry): string {
  if (thrown instanceof ApiError && thrown.code !== "internal" && thrown.message) return thrown.message;
  return REFUSED[entry.domain];
}

function doneReason(entry: PlanEntry, action: "created" | "updated" | "cancelled"): string {
  if (action === "updated") return entry.changes.map((change) => `${change.label}: ${change.before ?? "—"} → ${change.after}`).join(" · ") || "Updated.";
  if (action === "cancelled") return "Cancelled.";
  const when = entry.fields.find((field) => field.field === "date")?.value;
  const who = entry.fields.find((field) => field.field === "person")?.value;
  return [who, when].filter(Boolean).join(" · ") || "Added.";
}

const HEADINGS: Partial<Record<ReceiptAction, string>> = {
  updated: "Updated",
  cancelled: "Cancelled",
  created: "Created",
  unchanged: "Already on record",
  needs_clarification: "Still needs your answer",
  failed: "Could not complete",
};

/**
 * The receipt in words (§24, §32) — what HomeTalk says after a document is
 * applied, built from what actually happened, never from the reading.
 */
export function receiptText(receipt: IntakeChangeReceipt): string {
  if (receipt.status === "no_change") return "Nothing new found. No records changed.";
  const lines: string[] = [receipt.status === "partial" ? "Partly done." : receipt.status === "failed" ? "Nothing could be applied." : "Done."];
  for (const action of RECEIPT_ACTIONS) {
    const heading = HEADINGS[action];
    const matching = receipt.changes.filter((change) => change.action === action);
    if (!heading || matching.length === 0) continue;
    lines.push("", `${heading}:`);
    for (const change of matching) {
      // Who and when, so two rehearsals on different days read as two.
      const detail =
        action === "updated"
          ? ` — ${change.fields.map((field) => `${field.before ?? "—"} → ${field.after}`).join(", ")}`
          : action === "failed" && change.error
            ? ` — ${change.error}`
            : action === "created" && change.reason !== "Added."
              ? ` — ${change.reason}`
              : "";
      lines.push(`• ${change.title}${detail}`);
    }
  }
  if (receipt.status === "completed") lines.push("", "Nothing else was changed.");
  return lines.join("\n");
}

/** "3 changes applied", "2 applied, 1 could not be" — the headline a receipt opens with. */
export function receiptHeadline(receipt: IntakeChangeReceipt): string {
  const written = receipt.counts.created + receipt.counts.updated + receipt.counts.cancelled;
  switch (receipt.status) {
    case "no_change":
      return "Nothing new found";
    case "failed":
      return "Nothing could be applied";
    case "partial":
      return `${written} applied, ${receipt.counts.failed} could not be`;
    case "needs_review":
      return "Waiting on your answer";
    default: {
      const applied = written === 1 ? "1 change applied" : `${written} changes applied`;
      // Done, but not everything: a question left unanswered is said, never folded into "all done".
      return receipt.counts.needs_clarification > 0 ? `${applied}, ${receipt.counts.needs_clarification} waiting on your answer` : applied;
    }
  }
}
