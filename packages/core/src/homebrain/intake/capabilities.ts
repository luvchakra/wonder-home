import { z } from "zod";
import type { HomeSendKind } from "../../homesend/items";

/**
 * What HomeSend can do with something sent in (owner, 2026-11-22: "it should
 * be able to decide what to do with incoming info"). The model decides which
 * of these an item calls for; this registry is the whole of what it may pick
 * from, and each entry says how WonderHome checks and writes it. A capability
 * is a record type WonderHome already keeps, written only through the governed
 * write a person's confirm uses (`writer`): the model never writes.
 *
 * Safety classes, enforced after the model decides (`decision.ts`):
 * - `record`: recorded at once with Undo; the Admin's bar decides confirmed or Checking.
 * - `money`: the same, under "Money and health entries"; a default never confirms it; never paid.
 * - `health`: the same, and who it is for is never filled by a model or a rule (`health-filers.ts` aside).
 * - `action`: paying, ordering, messaging outside the household, booking, cancelling, deleting,
 *   sharing (`conversation/consent.ts`). Never executed from HomeSend; it becomes a proposal that waits for a yes.
 *
 * Design: `docs/design/2026-11-22-homesend-ai-decides.md`.
 */

export const SAFETY_CLASSES = ["record", "money", "health", "action"] as const;
export type SafetyClass = (typeof SAFETY_CLASSES)[number];

const text = (max: number) => z.string().trim().min(1).max(max);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money = z.number().min(0).max(10_000_000);

export type Capability = {
  id: CapabilityId;
  /** In the household's words, for the reply ("added to the calendar"). */
  label: string;
  /** Which module owns the record. */
  owner: string;
  safety: SafetyClass;
  /** The governed write a person's confirm uses, by name; HomeSend executes nothing else. */
  writer: string;
  /** The item kind today's pipeline files it under (no visible change while the decision runs behind it). */
  legacyKind: HomeSendKind;
  /** The fields an operation may carry; anything else is dropped. */
  fields: z.ZodObject<z.ZodRawShape>;
  /** The fields it cannot be created without. */
  required: readonly string[];
  /** Operations it supports. */
  ops: readonly ("create" | "update" | "attach")[];
};

export const CAPABILITY_IDS = [
  "bill",
  "payment",
  "receipt",
  "school_item",
  "exam",
  "exam_portion",
  "activity_item",
  "event",
  "reminder",
  "to_buy",
  "meal",
  "recipe",
  "task",
  "routine",
  "note",
  "health_record",
  "place",
  "contact",
  "action_request",
] as const;
export type CapabilityId = (typeof CAPABILITY_IDS)[number];

const common = { title: text(160), notes: text(2000).optional(), person: text(80).optional() };

export const CAPABILITIES: Readonly<Record<CapabilityId, Capability>> = {
  bill: {
    id: "bill", label: "Bills", owner: "finance", safety: "money", writer: "home-send-writes.createNew(bill)", legacyKind: "bill",
    fields: z.object({ ...common, payee: text(120).optional(), amount: money.optional(), currency: text(8).optional(), dueDate: day.optional(), billKind: text(40).optional() }),
    required: ["title"], ops: ["create", "update"],
  },
  payment: {
    id: "payment", label: "Bills (marked paid)", owner: "finance", safety: "money", writer: "homesend/payment-apply.applyPaymentProof", legacyKind: "receipt",
    fields: z.object({ ...common, payee: text(120).optional(), amount: money.optional(), currency: text(8).optional(), paidOn: day.optional() }),
    required: ["title"], ops: ["create", "attach"],
  },
  receipt: {
    id: "receipt", label: "Receipts", owner: "finance", safety: "money", writer: "home-send-writes.recordReceipt", legacyKind: "receipt",
    fields: z.object({ ...common, merchant: text(120).optional(), amount: money.optional(), currency: text(8).optional(), documentDate: day.optional() }),
    required: ["title"], ops: ["create"],
  },
  school_item: {
    id: "school_item", label: "School", owner: "school", safety: "record", writer: "home-send-writes.createNew(school_item)", legacyKind: "school_item",
    fields: z.object({ ...common, schoolKind: text(40).optional(), subject: text(60).optional(), dueDate: day.optional(), location: text(200).optional() }),
    required: ["title"], ops: ["create", "update"],
  },
  exam: {
    id: "exam", label: "Exams", owner: "school", safety: "record", writer: "homesend/timetable-apply", legacyKind: "school_item",
    fields: z.object({ ...common, subject: text(60).optional(), dueDate: day.optional(), grade: text(40).optional() }),
    required: ["title"], ops: ["create", "update"],
  },
  exam_portion: {
    id: "exam_portion", label: "Exam portions", owner: "school", safety: "record", writer: "homesend/syllabus-apply", legacyKind: "school_item",
    fields: z.object({ ...common, subject: text(60).optional(), portion: text(2000).optional() }),
    required: ["title"], ops: ["attach"],
  },
  activity_item: {
    id: "activity_item", label: "Classes and activities", owner: "school", safety: "record", writer: "home-send-writes.createNew(activity_item)", legacyKind: "activity_item",
    fields: z.object({ ...common, subject: text(60).optional(), activityKind: text(40).optional(), dueDate: day.optional(), location: text(200).optional() }),
    required: ["title"], ops: ["create", "update"],
  },
  event: {
    id: "event", label: "Calendar", owner: "calendar", safety: "record", writer: "home-send-writes.createNew(event)", legacyKind: "event",
    fields: z.object({ ...common, dueDate: day.optional(), dateText: text(120).optional(), location: text(200).optional() }),
    required: ["title"], ops: ["create", "update"],
  },
  reminder: {
    id: "reminder", label: "Reminders", owner: "notifications", safety: "record", writer: "conversation set_reminder", legacyKind: "event",
    fields: z.object({ ...common, dueDate: day.optional(), dateText: text(120).optional() }),
    required: ["title"], ops: ["create"],
  },
  to_buy: {
    id: "to_buy", label: "To Buy", owner: "groceries", safety: "record", writer: "home-send-writes.addGrocery", legacyKind: "grocery_item",
    fields: z.object({ ...common, quantity: z.number().min(0).max(10_000).optional(), unit: text(40).optional(), category: text(40).optional() }),
    required: ["title"], ops: ["create"],
  },
  meal: {
    id: "meal", label: "Meals", owner: "meals", safety: "record", writer: "conversation plan_meal", legacyKind: "unknown",
    fields: z.object({ ...common, dueDate: day.optional() }), required: ["title"], ops: ["create"],
  },
  recipe: {
    id: "recipe", label: "Recipes", owner: "meals", safety: "record", writer: "meals recipe save", legacyKind: "unknown",
    fields: z.object({ ...common }), required: ["title"], ops: ["create"],
  },
  task: {
    id: "task", label: "Tasks", owner: "outcomes", safety: "record", writer: "conversation add_task", legacyKind: "unknown",
    fields: z.object({ ...common, dueDate: day.optional() }), required: ["title"], ops: ["create"],
  },
  routine: {
    id: "routine", label: "Routines", owner: "outcomes", safety: "record", writer: "routines create", legacyKind: "unknown",
    fields: z.object({ ...common, cadence: text(80).optional() }), required: ["title"], ops: ["create"],
  },
  note: {
    id: "note", label: "Household notes", owner: "homesend", safety: "record", writer: "homesend kept_as_note", legacyKind: "unknown",
    fields: z.object({ ...common, kindName: text(60).optional(), facts: z.array(text(240)).max(12).optional() }),
    required: ["title"], ops: ["create"],
  },
  health_record: {
    id: "health_record", label: "Health records", owner: "health", safety: "health", writer: "home-send-writes.createNew(health_document)", legacyKind: "health_document",
    fields: z.object({ ...common, healthRecordType: text(40).optional(), documentDate: day.optional() }),
    required: ["title"], ops: ["create"],
  },
  place: {
    id: "place", label: "Places", owner: "places", safety: "record", writer: "places add", legacyKind: "unknown",
    fields: z.object({ ...common, address: text(300).optional() }), required: ["title"], ops: ["create"],
  },
  contact: {
    id: "contact", label: "Contacts", owner: "people", safety: "record", writer: "contacts add", legacyKind: "unknown",
    fields: z.object({ ...common, phone: text(40).optional(), role: text(80).optional() }), required: ["title"], ops: ["create"],
  },
  action_request: {
    id: "action_request", label: "Something to do (needs your yes)", owner: "conversation", safety: "action", writer: "conversation/consent proposal", legacyKind: "unknown",
    fields: z.object({ ...common, action: z.enum(["pay", "order", "message", "book", "cancel", "delete", "share"]) }),
    required: ["title", "action"], ops: ["create"],
  },
};

export function capability(id: string): Capability | null {
  return (CAPABILITY_IDS as readonly string[]).includes(id) ? CAPABILITIES[id as CapabilityId] : null;
}

/** The registry as the model reads it: one line per capability, no ids or writers. */
export function capabilityLines(): string {
  return CAPABILITY_IDS.map((id) => {
    const cap = CAPABILITIES[id];
    return `- ${id} (${cap.label}; ${cap.ops.join("/")}; ${cap.safety}): ${Object.keys(cap.fields.shape).join(", ")}`;
  }).join("\n");
}
