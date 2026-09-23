import type { HomeSendItem } from "../homesend/items";

/**
 * Conversational references (Wave 4 §8): "this", "that", "it", "them" —
 * resolved against what the conversation has actually been about, never
 * guessed.
 *
 * What a turn is "about" is kept as **focus**: the things it acted on,
 * proposed, asked about or mentioned, each with the time it came into play.
 * The route persists each turn's focus on the assistant message it wrote, so
 * the next turn reads it back — conversation state is a record, not a
 * model's memory.
 *
 * Priority, from the spec:
 *
 *   1. the current turn (an explicit name always wins — the caller only asks
 *      here when the words were a reference, not a name);
 *   2. the question WonderHome just asked (its candidates);
 *   3. the proposal waiting for a yes;
 *   4. recent conversation;
 *   5. recent HomeSend;
 *   6. the rest of the household's context (the caller's Wave 1 resolver).
 *
 * Tiers 4 and 5 are weighed together by recency, because "put that on the
 * list" straight after a school notice arrived and "put that on the list"
 * straight after talking about printer paper mean different things. When two
 * different things came into play within the same short window, the answer
 * is a question — "Do you mean the white T-shirt from the school notice or
 * printer paper?" — never a coin toss.
 */

export type FocusSource = "action_result" | "proposal" | "clarification" | "mention" | "homesend";

export type FocusEntity = {
  /**
   * What it is: a context `entityType` ("consumable", "member", "bill",
   * "school_item", "health_appointment", …) or "thing" for something named
   * but not (yet) on record — an item a notice asked for.
   */
  entityType: string;
  /** The record it is, when it is one. Null for a thing only mentioned. */
  entityId: string | null;
  label: string;
  source: FocusSource;
  /** When it came into play, ISO. */
  at: string;
  /** Where it came from, in the household's words: "the school notice". */
  origin?: string | null;
};

export type ReferenceState = {
  /** Candidates of the question WonderHome just asked. */
  clarification: FocusEntity[];
  /** What the proposal waiting for a yes is about. */
  proposal: FocusEntity[];
  /** Earlier turns' focus, newest first. */
  conversation: FocusEntity[];
  /** Recent HomeSend intake, newest first. */
  homesend: FocusEntity[];
};

export const NO_REFERENCES: ReferenceState = { clarification: [], proposal: [], conversation: [], homesend: [] };

/** Two things that came into play this close together are both "that". */
export const SAME_MOMENT_MS = 30 * 60_000;

/** HomeSend older than this is no longer what "that" points at. */
export const HOMESEND_REFERENCE_WINDOW_MS = 24 * 60 * 60_000;

export type AnaphorKind = "singular" | "plural";

/**
 * Whether the words are a reference rather than a name: "that", "it",
 * "those", "the same one". Null for anything with content of its own.
 */
export function anaphorOf(words: string): AnaphorKind | null {
  const text = words.trim().toLowerCase().replace(/[.!?]+$/, "");
  if (/^(?:this|that|it|this one|that one|the same|the same one|same|same thing|that thing|this thing)$/.test(text)) return "singular";
  if (/^(?:them|those|these|all of them|all those|both|both of them|those things|these things)$/.test(text)) return "plural";
  return null;
}

export type ReferenceResolution =
  | { kind: "resolved"; entities: FocusEntity[]; via: "clarification" | "proposal" | "conversation" | "homesend" }
  | { kind: "ambiguous"; candidates: FocusEntity[]; question: string }
  | { kind: "none" };

/**
 * What a reference points at, among things of the given kinds.
 *
 * `kinds` narrows to what the action can use — "put that on the list"
 * wants a thing, never a person or a bill.
 */
export function resolveAnaphor(
  anaphor: AnaphorKind,
  state: ReferenceState,
  options: { kinds: readonly string[]; now: Date },
): ReferenceResolution {
  const fits = (entity: FocusEntity) => options.kinds.includes(entity.entityType);

  // 2. The question just asked: a reference to one of its candidates only
  // resolves when there is exactly one (a pronoun cannot choose between two).
  const asked = dedupe(state.clarification.filter(fits));
  if (asked.length === 1) return { kind: "resolved", entities: asked, via: "clarification" };
  if (asked.length > 1) return { kind: "ambiguous", candidates: asked.slice(0, 3), question: whichOf(asked) };

  // 3. The proposal waiting for a yes.
  const proposed = dedupe(state.proposal.filter(fits));
  if (proposed.length > 0) return { kind: "resolved", entities: anaphor === "plural" ? proposed : proposed.slice(0, 1), via: "proposal" };

  // 4 + 5. Recent conversation and recent HomeSend, by recency.
  const now = options.now.getTime();
  const recentHomeSend = state.homesend.filter((entity) => fits(entity) && now - Date.parse(entity.at) <= HOMESEND_REFERENCE_WINDOW_MS);
  const pool = dedupe([...state.conversation.filter(fits), ...recentHomeSend]).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  if (pool.length === 0) return { kind: "none" };

  const newest = pool[0]!;
  // Everything that came into play in the same moment as the newest thing.
  const moment = pool.filter((entity) => Date.parse(newest.at) - Date.parse(entity.at) <= SAME_MOMENT_MS);

  if (anaphor === "plural") {
    // "Them" is the group that came in together — the newest turn's things,
    // or the newest HomeSend item's — not everything ever mentioned.
    const group = moment.filter((entity) => entity.source === newest.source && sameOrigin(entity, newest));
    return { kind: "resolved", entities: group, via: newest.source === "homesend" ? "homesend" : "conversation" };
  }

  if (moment.length === 1) return { kind: "resolved", entities: [newest], via: newest.source === "homesend" ? "homesend" : "conversation" };
  return { kind: "ambiguous", candidates: moment.slice(0, 3), question: whichOf(moment.slice(0, 3)) };
}

/** "Do you mean the white T-shirt from the school notice or printer paper?" */
export function whichOf(candidates: readonly FocusEntity[]): string {
  const named = candidates.slice(0, 3).map(describe);
  if (named.length <= 1) return `Do you mean ${named[0] ?? "that"}?`;
  return `Do you mean ${named.slice(0, -1).join(", ")} or ${named[named.length - 1]}?`;
}

/** Picks the candidate an answer names — "the T-shirt", "printer paper", "the first one". */
export function chooseCandidate(answer: string, candidates: readonly FocusEntity[]): FocusEntity | null {
  const said = normal(answer);
  if (!said) return null;
  const ordinal = /\b(?:first|1st|former)\b/.test(said) ? 0 : /\b(?:second|2nd|latter|other)\b/.test(said) ? 1 : /\b(?:third|3rd)\b/.test(said) ? 2 : null;
  if (ordinal !== null && candidates[ordinal]) return candidates[ordinal]!;
  const matches = candidates.filter((candidate) => {
    const label = normal(candidate.label);
    return label === said || said.includes(label) || label.includes(said);
  });
  return matches.length === 1 ? matches[0]! : null;
}

// ---------------------------------------------------------------------------
// Where focus comes from
// ---------------------------------------------------------------------------

/** Recent HomeSend intake as the things it named — the items a notice asked for, a bill it was. */
export function homeSendFocus(items: readonly HomeSendItem[]): FocusEntity[] {
  const focus: FocusEntity[] = [];
  for (const item of items) {
    if (item.status === "dismissed" || item.status === "undone" || item.status === "failed") continue;
    const origin = originOf(item);
    const understanding = item.understanding;
    const things = new Set<string>();
    for (const entity of understanding?.entities ?? []) {
      if (entity.type === "item" && entity.extractedValue.trim()) things.add(entity.extractedValue.trim());
    }
    for (const action of understanding?.candidateActions ?? []) {
      if (action.type !== "add_grocery_item" && action.type !== "add_household_need") continue;
      const name = action.fields.name ?? action.fields.item ?? action.fields.title;
      if (typeof name === "string" && name.trim()) things.add(name.trim());
    }
    const extractedGrocery = item.classifiedKind === "grocery_item" ? item.extracted?.title : null;
    if (typeof extractedGrocery === "string" && extractedGrocery.trim()) things.add(extractedGrocery.trim());

    for (const label of things) {
      focus.push({ entityType: "thing", entityId: null, label: cleanLabel(label), source: "homesend", at: item.createdAt, origin });
    }
    // The item itself, as what it became (or will become), for "pay that" / "when is that due".
    const title = item.extracted?.title ?? understanding?.contentSummary ?? null;
    if (title && item.classifiedKind === "bill") {
      focus.push({ entityType: "bill", entityId: item.routedTable === "obligations" ? item.routedId : null, label: cleanLabel(title), source: "homesend", at: item.createdAt, origin });
    }
    if (title && item.classifiedKind === "school_item") {
      focus.push({ entityType: "school_item", entityId: item.routedTable === "school_items" ? item.routedId : null, label: cleanLabel(title), source: "homesend", at: item.createdAt, origin });
    }
  }
  return focus;
}

/**
 * What an executed write touched, for the next turn's "it": the row the
 * executor actually wrote, never what was asked for.
 */
export function focusFromResult(action: string, result: Record<string, unknown>, at: string): FocusEntity[] {
  const id = (key: string) => (typeof result[key] === "string" ? (result[key] as string) : null);
  const text = (key: string) => (typeof result[key] === "string" ? (result[key] as string) : null);
  switch (action) {
    case "add_to_list": {
      // Several things added together are one group — what "them" means next.
      if (Array.isArray(result.items)) {
        return (result.items as { name?: unknown; consumableId?: unknown }[])
          .filter((entry) => typeof entry.name === "string")
          .map((entry) => ({ entityType: "consumable", entityId: typeof entry.consumableId === "string" ? entry.consumableId : null, label: entry.name as string, source: "action_result" as const, at }));
      }
      const name = text("name");
      return name ? [{ entityType: "consumable", entityId: id("consumableId"), label: name, source: "action_result", at }] : [];
    }
    case "complete_school_item":
    case "adjust_schedule":
      return id("schoolItemId") ? [{ entityType: "school_item", entityId: id("schoolItemId"), label: text("title") ?? "that", source: "action_result", at }] : [];
    case "raise_service_request":
      return id("serviceRequestId") ? [{ entityType: "home_asset", entityId: id("assetId"), label: text("assetName") ?? "that", source: "action_result", at }] : [];
    case "plan_event":
      return id("eventId") ? [{ entityType: "family_event", entityId: id("eventId"), label: text("title") ?? "that", source: "action_result", at }] : [];
    case "plan_meal":
      return id("mealId") ? [{ entityType: "meal", entityId: id("mealId"), label: text("name") ?? "the meal", source: "action_result", at }] : [];
    case "set_reminder":
      return id("notificationId") ? [{ entityType: "reminder", entityId: id("notificationId"), label: text("what") ?? "the reminder", source: "action_result", at }] : [];
    case "record_absence":
      return id("memberId") ? [{ entityType: "member", entityId: id("memberId"), label: text("memberName") ?? "them", source: "action_result", at }] : [];
    case "record_health_appointment":
      return id("appointmentId") ? [{ entityType: "health_appointment", entityId: id("appointmentId"), label: text("appointmentType") ?? "the appointment", source: "action_result", at }] : [];
    case "log_health_issue":
      return id("issueId") ? [{ entityType: "health_issue", entityId: id("issueId"), label: text("label") ?? "that", source: "action_result", at }] : [];
    case "log_vital":
      return id("vitalId") ? [{ entityType: "health_vital", entityId: id("vitalId"), label: text("vitalType") ?? "that reading", source: "action_result", at }] : [];
    default:
      return [];
  }
}

/** The things a proposal is about, from its parameters: the items on a list, the bill. */
export function focusFromProposal(input: { actionType: string; parameters: Record<string, unknown>; targetReference?: string | null; at: string }): FocusEntity[] {
  const at = input.at;
  if (input.actionType === "add_to_list" || input.actionType === "order_items") {
    const items = Array.isArray(input.parameters.items)
      ? input.parameters.items.filter((value): value is string => typeof value === "string")
      : typeof input.parameters.item === "string"
        ? [input.parameters.item]
        : typeof input.parameters.items === "string"
          ? [input.parameters.items]
          : [];
    return items.map((label) => ({ entityType: "thing", entityId: null, label, source: "proposal" as const, at }));
  }
  if (input.actionType === "make_payment") {
    const label = typeof input.parameters.billLabel === "string" ? input.parameters.billLabel : input.targetReference ?? null;
    return label ? [{ entityType: "bill", entityId: typeof input.parameters.billId === "string" ? input.parameters.billId : null, label, source: "proposal", at }] : [];
  }
  return [];
}

/** Reads a persisted focus list back, dropping anything malformed. */
export function readFocus(value: unknown): FocusEntity[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    if (typeof record.entityType !== "string" || typeof record.label !== "string" || typeof record.at !== "string") return [];
    const source = record.source;
    if (source !== "action_result" && source !== "proposal" && source !== "clarification" && source !== "mention" && source !== "homesend") return [];
    return [
      {
        entityType: record.entityType,
        entityId: typeof record.entityId === "string" ? record.entityId : null,
        label: record.label.slice(0, 120),
        source,
        at: record.at,
        origin: typeof record.origin === "string" ? record.origin : null,
      },
    ];
  });
}

// ---------------------------------------------------------------------------

function describe(entity: FocusEntity): string {
  // A list item's name is stored capitalised ("Printer paper"); in a
  // sentence it reads as the ordinary noun it is. A person's or a bill's
  // label is a name and keeps its capitals.
  const common = entity.entityType === "thing" || entity.entityType === "consumable";
  const label = common && /^[A-Z][a-z]/.test(entity.label) ? entity.label.charAt(0).toLowerCase() + entity.label.slice(1) : entity.label;
  const withArticle = /^(?:the|a|an|my|our|your)\s/i.test(label) || entity.entityType === "member" ? label : `the ${label}`;
  return entity.origin ? `${withArticle} from ${entity.origin}` : withArticle;
}

function originOf(item: HomeSendItem): string {
  switch (item.classifiedKind) {
    case "school_item":
      return "the school notice";
    case "bill":
      return "the bill you sent";
    case "grocery_item":
      return "the list you sent";
    case "health_document":
      return "the health document you sent";
    default:
      return "what you sent to HomeSend";
  }
}

function sameOrigin(a: FocusEntity, b: FocusEntity): boolean {
  return (a.origin ?? null) === (b.origin ?? null) && Math.abs(Date.parse(a.at) - Date.parse(b.at)) < 60_000;
}

function dedupe(entities: readonly FocusEntity[]): FocusEntity[] {
  const seen = new Map<string, FocusEntity>();
  for (const entity of entities) {
    const key = `${entity.entityType === "consumable" ? "thing" : entity.entityType}:${normal(entity.label)}`;
    const existing = seen.get(key);
    // The newest mention wins, but keeps where the thing first came from —
    // "the white T-shirt from the school notice" stays that after it is added.
    if (!existing) seen.set(key, entity);
    else if (Date.parse(entity.at) > Date.parse(existing.at)) seen.set(key, { ...entity, origin: entity.origin ?? existing.origin ?? null });
    else if (!existing.origin && entity.origin) seen.set(key, { ...existing, origin: entity.origin });
  }
  return [...seen.values()];
}

function cleanLabel(label: string): string {
  return label.replace(/^(?:a|an|one)\s+/i, "").replace(/[.!]+$/, "").trim().slice(0, 120);
}

function normal(text: string): string {
  return text
    .toLowerCase()
    .replace(/^(?:the|a|an|my|our)\s+/, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
