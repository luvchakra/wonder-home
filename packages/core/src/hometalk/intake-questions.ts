import type { SupabaseClient } from "@supabase/supabase-js";

import type { PendingClarification } from "../conversation/clarify";
import { openSession, recordMessage, type ConversationSurface } from "../conversation/repository";
import { amountWords, sureClause, waitingWords, wasAdded, type AddedOnItsOwn, type WaitingInHomeSend } from "../homesend/auto-add";
import { listDetails, missingDetails, nextMissingDetail, personNamed, type CompletenessReading, type DetailField } from "../homesend/completeness";
import type { HomeSendKind } from "../homesend/items";
import type { Translate, TranslationKey } from "../i18n/translate";
import { readDetailAnswer } from "./detail-answers";

/**
 * HomeTalk asks what a HomeSend entry still lacks (the owner, 2026-10-26:
 * "why would HomeSend ask a question, isn't that HomeTalk's job").
 *
 * HomeSend reports what is missing (`homesend/completeness.ts`); HomeTalk is
 * the one door (rule 13), so it words every question here, asks one focused
 * question at a time — in the app's conversation and on WhatsApp — and reads
 * the answer through its own clarify machinery: the question is kept on the
 * reply that asked it (`metadata.clarify`), and the next turn is read as its
 * answer (`conversation/clarify.ts`, action `complete_homesend_item`). The
 * answers go back onto the HomeSend item; once nothing is left to ask, HomeSend
 * adds it (Pre Approved and above the bar) or it waits there for a person.
 *
 * Who an item is for is asked the same way, with the household's own names
 * as the choices — never a second, HomeSend-side question.
 */

/** HomeTalk's words for each detail. Short, polite, and never saying back a value. */
export const DETAIL_QUESTIONS: Record<DetailField, string> = {
  name: "What should go on the list?",
  quantity: "How much should I get? For example 2 litres or 1 kg.",
  child: "Who is it for?",
  person: "Whose record is it?",
  title: "What is it called?",
  dueDate: "When is it due?",
  className: "Which class is it for?",
  date: "Which day is it?",
  time: "What time does it start?",
  where: "Where is it?",
  payee: "Who is the bill from?",
  amount: "How much is the bill?",
  recordType: "What kind of record is it — a prescription, a lab report, a scan, a vaccination or something else?",
  merchant: "Which shop is it from?",
};

/** A receipt or a health document is dated, not due: its date asks which day it is from. */
const DATED_QUESTION: Partial<Record<HomeSendKind, string>> = {
  receipt: "What day was it bought?",
  health_document: "What date is on it?",
};

/**
 * The second ask, when an answer can't be read (design §5): "Sorry, …", then
 * ways of saying it that work, as a list. Never the same question twice, and
 * only once: a second answer that can't be read is left for HomeSend.
 */
const SECOND_ASK_WAYS: Partial<Record<DetailField, string[]>> = {
  quantity: ['- "2 litres" or "500 g"', '- "1 bottle" or "2 packets"', '- just a number, like "3"'],
  dueDate: ['- "tomorrow" or "next Friday"', '- a date, like "7 Nov"'],
  date: ['- "tomorrow" or "last Monday"', '- a date, like "7 Nov"'],
  time: ['- "8 pm" or "9:30 am"', '- "18:30"'],
  amount: ['- a number, like "1500"', '- with the currency, like "₹1,500"'],
  recordType: ["- a prescription", "- a lab report", "- a scan", "- a vaccination"],
};

export function secondAsk(field: DetailField, choices: readonly Pick<IntakePerson, "displayName">[]): string {
  const skip = 'Or say "skip" and I\'ll leave it for you in HomeSend.';
  if (field === "child" || field === "person") {
    const names = choices.map((person) => `- ${person.displayName.split(/\s+/)[0]}`);
    return names.length > 0
      ? ["Sorry, I couldn't tell who from that. Could you pick one?", ...names, skip].join("\n")
      : ["Sorry, I couldn't tell who from that. Could you say their name as your household has it?", skip].join("\n");
  }
  const ways = SECOND_ASK_WAYS[field];
  return ways
    ? ["Sorry, I couldn't make that out. Could you say it one of these ways?", ...ways, skip].join("\n")
    : [`Sorry, I couldn't make that out. ${DETAIL_QUESTIONS[field]} A few words is enough.`, skip].join("\n");
}

function withoutAnswer(parameters: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...parameters };
  delete rest.answer;
  return rest;
}

export type IntakePerson = { id: string; displayName: string; nickname?: string | null; memberType?: string | null };

/** Who an item could be for: a child's things are a child's; a health record anyone's but a helper's. */
function eligiblePeople(kind: HomeSendKind | null, people: readonly IntakePerson[]): IntakePerson[] {
  if (kind === "school_item" || kind === "activity_item") return people.filter((person) => person.memberType === "child");
  if (kind === "health_document") return people.filter((person) => person.memberType !== "helper");
  return [];
}

function either(names: readonly string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`;
}

export type IntakeQuestion = { field: DetailField; question: string; clarify: PendingClarification };

/**
 * The next question HomeTalk asks about a HomeSend item, or null when there is
 * nothing it can usefully ask. Pure.
 *
 * Who it is for is asked only when the content names nobody (or names someone
 * two people could be) and two to six people fit; otherwise the review picks.
 */
export function intakeQuestion(input: {
  itemId: string;
  kind: HomeSendKind | null;
  extracted: CompletenessReading;
  asked: readonly DetailField[];
  people: readonly IntakePerson[];
  /** Names the content used that more than one person fits. */
  ambiguous?: readonly string[];
}): IntakeQuestion | null {
  const eligible = eligiblePeople(input.kind, input.people);
  const ambiguous = (input.ambiguous ?? []).filter(Boolean);
  const choices = ambiguous.length >= 2 ? eligible.filter((person) => ambiguous.some((name) => sameName(name, person))) : eligible;
  const askable = choices.length >= 2 && choices.length <= 6;
  const personKnown = !askable || (ambiguous.length < 2 && personNamed(input.extracted) !== null);
  const next = nextMissingDetail(input.kind, input.extracted, input.asked, { person: personKnown });
  if (!next) return null;
  const named = choices.map((person) => person.displayName.split(/\s+/)[0]!);
  const question =
    next.field === "child" || next.field === "person"
      ? `${input.kind === "health_document" ? "Whose record is it" : "Who is it for"} — ${either(named)}?`
      : next.field === "date"
        ? (DATED_QUESTION[input.kind ?? "unknown"] ?? DETAIL_QUESTIONS.date)
        : DETAIL_QUESTIONS[next.field];
  return {
    field: next.field,
    question,
    clarify: {
      action: "complete_homesend_item",
      target: { kind: "unspecified" },
      parameters: {
        itemId: input.itemId,
        kind: input.kind,
        field: next.field,
        asked: [...input.asked, next.field],
        ...(next.field === "child" || next.field === "person" ? { choices: choices.map((person) => ({ id: person.id, displayName: person.displayName, nickname: person.nickname ?? null })) } : {}),
      },
      question,
      utterance: "",
      asked: 1,
    },
  };
}

function sameName(said: string, person: Pick<IntakePerson, "displayName" | "nickname">): boolean {
  const name = person.displayName.trim().toLowerCase();
  const word = said.trim().toLowerCase();
  return name === word || name.split(/\s+/)[0] === word || person.nickname?.trim().toLowerCase() === word;
}

/**
 * The person a short reply names, when exactly one of the choices fits: their
 * name, their first name or their nickname, ignoring case. Pure.
 */
export function memberNamedInReply(text: string, members: readonly Pick<IntakePerson, "id" | "displayName" | "nickname">[]): { id: string; displayName: string } | null {
  const said = text.trim().toLowerCase().replace(/^(?:for|it'?s for|its for|this is for|it'?s|that'?s)\s+/, "").replace(/[.!]+$/, "").trim();
  if (!said || said.length > 60) return null;
  const fits = members.filter((member) => sameName(said, member));
  return fits.length === 1 ? { id: fits[0]!.id, displayName: fits[0]!.displayName } : null;
}

type ItemRow = { id: string; status: string; classified_kind: HomeSendKind | null; extracted: Record<string, unknown> | null; understanding: Record<string, unknown> | null };

async function loadItem(client: SupabaseClient, householdId: string, itemId: string): Promise<ItemRow | null> {
  const { data } = await client.from("home_send_items").select("id, status, classified_kind, extracted, understanding").eq("household_id", householdId).eq("id", itemId).maybeSingle();
  return (data as ItemRow | null) ?? null;
}

/** Names the reading used that more than one person fits (`homesend/resolve.ts`'s references). */
function ambiguousNames(understanding: Record<string, unknown> | null): string[] {
  const references = Array.isArray(understanding?.references) ? (understanding!.references as { candidates?: unknown }[]) : [];
  const split = references.find((reference) => Array.isArray(reference.candidates) && reference.candidates.length > 1);
  return split ? (split.candidates as unknown[]).filter((name): name is string => typeof name === "string") : [];
}

/**
 * Asks the first question about a fresh HomeSend item in the member's
 * conversation on `surface`: the question is recorded as HomeTalk's reply,
 * open for the next turn to answer, exactly as a question HomeTalk asked
 * itself. Returns its words, or null when nothing needs asking.
 */
export async function openIntakeQuestion(
  admin: SupabaseClient,
  input: { householdId: string; memberId: string; itemId: string; surface: ConversationSurface; t?: Translate },
): Promise<string | null> {
  const [item, { data: members }] = await Promise.all([
    loadItem(admin, input.householdId, input.itemId),
    admin.from("household_members").select("id, display_name, nickname, member_type").eq("household_id", input.householdId).eq("status", "active").limit(50),
  ]);
  if (!item || item.status !== "classified" || !item.classified_kind) return null;
  const people = ((members ?? []) as { id: string; display_name: string; nickname: string | null; member_type: string }[]).map((row) => ({ id: row.id, displayName: row.display_name, nickname: row.nickname, memberType: row.member_type }));
  const next = intakeQuestion({ itemId: item.id, kind: item.classified_kind, extracted: (item.extracted ?? null) as CompletenessReading, asked: [], people, ambiguous: ambiguousNames(item.understanding) });
  if (!next) return null;
  // Said outside a HomeTalk turn, so in the member's language here (14-047); the clarify keeps HomeTalk's own words.
  const said = input.t ? questionIn(input.t, item.classified_kind, next) : next.question;
  const sessionId = await openSession(admin, { householdId: input.householdId, memberId: input.memberId, channel: "text", surface: input.surface });
  await recordMessage(admin, {
    householdId: input.householdId,
    sessionId,
    role: "assistant",
    content: said,
    metadata: { proposal: "clarify", intent: "complete_homesend_item", mode: "clarify", clarify: next.clarify },
  });
  return said;
}

const QUESTION_KEYS: Record<Exclude<DetailField, "child" | "person">, TranslationKey> = {
  name: "whatsapp.ask.name",
  quantity: "whatsapp.ask.quantity",
  title: "whatsapp.ask.title",
  dueDate: "whatsapp.ask.dueDate",
  className: "whatsapp.ask.className",
  date: "whatsapp.ask.date",
  time: "whatsapp.ask.time",
  where: "whatsapp.ask.where",
  payee: "whatsapp.ask.payee",
  amount: "whatsapp.ask.amount",
  recordType: "whatsapp.ask.recordType",
  merchant: "whatsapp.ask.merchant",
};

/** HomeTalk's question in the member's language, from the catalog (`whatsapp.ask.*`). */
export function questionIn(t: Translate, kind: HomeSendKind | null, next: IntakeQuestion): string {
  if (next.field === "child" || next.field === "person") {
    const choices = (Array.isArray(next.clarify.parameters.choices) ? next.clarify.parameters.choices : []) as Pick<IntakePerson, "displayName">[];
    const named = choices.map((person) => person.displayName.split(/\s+/)[0]!);
    const names = named.length <= 1 ? (named[0] ?? "") : `${named.slice(0, -1).join(", ")}${t("whatsapp.list.or")}${named.at(-1)}`;
    return t(kind === "health_document" ? "whatsapp.ask.whose" : "whatsapp.ask.who", { names });
  }
  if (next.field === "date" && kind === "receipt") return t("whatsapp.ask.receiptDate");
  if (next.field === "date" && kind === "health_document") return t("whatsapp.ask.healthDate");
  return t(QUESTION_KEYS[next.field]);
}

export type IntakeAnswer = {
  /** What HomeTalk says: the answer taken (never said back), and the next question when there is one. */
  text: string;
  /** The next question, left open for the next turn. */
  clarify: PendingClarification | null;
  /** Nothing left to ask: HomeSend decides now — added where the household allows it, else it waits. */
  handBack: boolean;
  /** What it still can't be added without, for the closing line. */
  stillNeeded: string[];
  title: string | null;
};

/**
 * Puts an answer to HomeTalk's question onto the HomeSend item, as the
 * member (their own client; RLS decides), and works out what comes next.
 * The item only ever waits in HomeSend: nothing here reaches a domain table.
 */
export async function answerIntakeQuestion(
  client: SupabaseClient,
  input: { householdId: string; parameters: Record<string, unknown>; answer: string; people: readonly IntakePerson[]; timezone: string; now: Date },
): Promise<IntakeAnswer> {
  const itemId = typeof input.parameters.itemId === "string" ? input.parameters.itemId : "";
  const field = input.parameters.field as DetailField;
  const asked = (Array.isArray(input.parameters.asked) ? input.parameters.asked : []).filter((entry): entry is DetailField => typeof entry === "string");
  const item = itemId ? await loadItem(client, input.householdId, itemId) : null;
  if (!item || item.status !== "classified" || !item.classified_kind) {
    return { text: "That one isn't waiting in HomeSend any more, so there's nothing to fill in.", clarify: null, handBack: false, stillNeeded: [], title: null };
  }
  const kind = item.classified_kind;
  const extracted = item.extracted ?? {};
  let lead: string;
  let patch: Record<string, unknown> | null = null;
  let unread = false;
  let understanding = item.understanding;

  if (field === "child" || field === "person") {
    const choices = (Array.isArray(input.parameters.choices) ? input.parameters.choices : []) as IntakePerson[];
    const member = memberNamedInReply(input.answer, choices.length > 0 ? choices : input.people);
    if (member) {
      patch = { subjectMemberName: member.displayName, people: [member.displayName] };
      // The review reads who an item is for from its understanding's references (`homesend/resolve.ts`).
      understanding = item.understanding ? { ...item.understanding, references: [{ text: member.displayName, candidates: [], confidence: 0 }] } : null;
      lead = `Got it — that's for ${member.displayName}.`;
    } else {
      unread = true;
      lead = "Sorry, I couldn't tell who from that, so I've left it for you to pick in HomeSend.";
    }
  } else {
    const read = readDetailAnswer(kind, field, input.answer, { timezone: input.timezone, now: input.now });
    if (read === "skip") lead = "No problem.";
    else if (read) {
      patch = read as Record<string, unknown>;
      lead = "Got it, thanks.";
    } else {
      unread = true;
      lead = "Sorry, I couldn't make that out, so I've left it for you to fill in in HomeSend.";
    }
  }

  // An answer that can't be read gets one polite second ask, never the same question (design §5).
  if (unread && input.parameters.retried !== true) {
    const choices = (Array.isArray(input.parameters.choices) ? input.parameters.choices : []) as IntakePerson[];
    const question = secondAsk(field, choices);
    const title = typeof extracted.title === "string" ? extracted.title : null;
    return {
      text: question,
      clarify: { action: "complete_homesend_item", target: { kind: "unspecified" }, parameters: { ...withoutAnswer(input.parameters), retried: true }, question, utterance: "", asked: 2 },
      handBack: false,
      stillNeeded: [],
      title,
    };
  }

  const filled = patch ? { ...extracted, ...patch } : extracted;
  if (patch) {
    const { error } = await client
      .from("home_send_items")
      .update({ extracted: filled, ...(understanding !== item.understanding ? { understanding } : {}) })
      .eq("household_id", input.householdId)
      .eq("id", item.id);
    if (error) return { text: "I couldn't save that to HomeSend just now. It's still waiting there for you.", clarify: null, handBack: false, stillNeeded: [], title: null };
  }

  const title = typeof filled.title === "string" ? filled.title : null;
  const next = intakeQuestion({ itemId: item.id, kind, extracted: filled as CompletenessReading, asked, people: input.people, ambiguous: patch && (field === "child" || field === "person") ? [] : ambiguousNames(understanding) });
  // Filling in several waiting items (14-050): the rest of the queue rides on every question about this one.
  if (next && Array.isArray(input.parameters.queue)) next.clarify.parameters.queue = input.parameters.queue;
  if (next) return { text: `${lead} ${next.question}`, clarify: next.clarify, handBack: false, stillNeeded: [], title };
  // Every detail still missing: the required ones, and useful ones never asked (one already asked isn't insisted on).
  const stillNeeded = missingDetails(kind, filled as CompletenessReading, { person: true })
    .filter((spec) => spec.need === "required" || (!asked.includes(spec.field) && spec.field !== field))
    .map((spec) => spec.label);
  return { text: lead, clarify: null, handBack: true, stillNeeded, title };
}

/** The closing words once HomeTalk has nothing left to ask. Never an amount, a health detail or a number. */
export function handedBackText(lead: string, outcome: { added: AddedOnItsOwn | WaitingInHomeSend | null; stillNeeded: readonly string[] }): string {
  const added = wasAdded(outcome.added) ? outcome.added : null;
  if (added?.more) {
    // More of a grocery already on the list (I-24), as HomeTalk's own add says it: "+2 L, now 3 L".
    return `${lead} Added ${amountWords(added.more.added)} more **${added.title}** (now ${amountWords(added.more.now)})${sureClause(added)} — your household lets WonderHome add these on its own. You can undo it in HomeSend.`;
  }
  if (added) return `${lead} Added **${added.title}** to ${added.where}${sureClause(added)} — your household lets WonderHome add these on its own. You can undo it in HomeSend.`;
  if (outcome.stillNeeded.length > 0) return `${lead} It's waiting in HomeSend — the ${listDetails(outcome.stillNeeded.map((label) => ({ label })))} can be filled in there.`;
  const held = outcome.added && "waiting" in outcome.added ? outcome.added : null;
  const waiting = held ? waitingWords(held.waiting, held.title) : null;
  return `${lead} ${waiting ?? "It's waiting in HomeSend for you to check."}`;
}

// --- Filling in what waits in HomeSend (story 14-050) --------------------------------------

/** How far back a waiting item is still offered; older ones are left for the HomeSend screen. */
const OFFER_WINDOW_DAYS = 14;

export type WaitingItem = { itemId: string; title: string | null };

/**
 * The member's waiting HomeSend items that HomeTalk could ask a question
 * about, newest first: read, not yet added, from the last two weeks, and
 * missing something it can ask (`intakeQuestion`). Through the member's own
 * client, so RLS decides what they see.
 */
export async function waitingForDetails(client: SupabaseClient, input: { householdId: string; people: readonly IntakePerson[]; now: Date; limit?: number }): Promise<WaitingItem[]> {
  const since = new Date(input.now.getTime() - OFFER_WINDOW_DAYS * 86_400_000).toISOString();
  const { data, error } = await client
    .from("home_send_items")
    .select("id, status, classified_kind, extracted, understanding")
    .eq("household_id", input.householdId)
    .eq("status", "classified")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) return [];
  const waiting: WaitingItem[] = [];
  for (const row of (data ?? []) as ItemRow[]) {
    if (!row.classified_kind || row.classified_kind === "unknown") continue;
    const next = intakeQuestion({ itemId: row.id, kind: row.classified_kind, extracted: (row.extracted ?? null) as CompletenessReading, asked: [], people: input.people, ambiguous: ambiguousNames(row.understanding) });
    if (next) waiting.push({ itemId: row.id, title: typeof row.extracted?.title === "string" ? row.extracted.title : null });
    if (waiting.length >= (input.limit ?? 5)) break;
  }
  return waiting;
}

/**
 * The first question about the first item in `queue` that still needs one,
 * with the rest of the queue riding on it; null when none does any more.
 */
export async function nextQueuedQuestion(
  client: SupabaseClient,
  input: { householdId: string; queue: readonly string[]; people: readonly IntakePerson[] },
): Promise<{ title: string | null; question: string; clarify: PendingClarification } | null> {
  for (let index = 0; index < input.queue.length; index += 1) {
    const item = await loadItem(client, input.householdId, input.queue[index]!);
    if (!item || item.status !== "classified" || !item.classified_kind) continue;
    const next = intakeQuestion({ itemId: item.id, kind: item.classified_kind, extracted: (item.extracted ?? null) as CompletenessReading, asked: [], people: input.people, ambiguous: ambiguousNames(item.understanding) });
    if (!next) continue;
    next.clarify.parameters.queue = input.queue.slice(index + 1);
    return { title: typeof item.extracted?.title === "string" ? item.extracted.title : null, question: next.question, clarify: next.clarify };
  }
  return null;
}

/** "Maths worksheet and Diwali dinner" — at most three titles, for the offer. */
export function titlesFor(items: readonly WaitingItem[], or = " and "): string {
  const titles = items.map((item) => item.title?.trim()).filter((title): title is string => Boolean(title)).slice(0, 3);
  if (titles.length <= 1) return titles[0] ?? "";
  return `${titles.slice(0, -1).join(", ")}${or}${titles.at(-1)}`;
}
