import type { PendingClarification } from "../conversation/clarify";
import { readFocus } from "../conversation/references";
import { bareRule } from "../commerce/bare-amount";
import { baseOf, ladderForItem } from "../commerce/buying-sizes";
import type { NamedItem } from "../commerce/catalog";
import type { DetailField } from "../homesend/completeness";
import type { HomeSendKind } from "../homesend/items";
import type { Translate } from "../i18n/translate";

/**
 * Answers to pick, under HomeTalk's question (design principle 20, the owner
 * 2026-10-26: "instead of receiving answers in text, why don't you give easy
 * contextual answers to pick from").
 *
 * A choice is a label in the person's language and `say`: the exact English
 * words HomeTalk already reads as that answer (`conversation/clarify.ts`), so
 * picking one sends `say` as an ordinary turn. Nothing here decides, grounds
 * or writes: the engine reads the words exactly as if they had been typed,
 * and every gate runs on them. The text box always stays; a choice is never
 * the only way to answer. `say: null` is "Another day…": it puts the cursor
 * in the text box instead of sending anything.
 *
 * Pure. The amounts for a grocery come from the catalog's ladder or pack,
 * looked up by the caller (`amountsFor`).
 */

export type HomeTalkChoice = { label: string; say: string | null };

export type HomeTalkChoices = {
  /** One answer (chips, a radio group), or several at once (checkboxes and one Send). */
  mode: "single" | "multi";
  choices: HomeTalkChoice[];
  /** Beside Send in a multi set: answers that stand alone ("Not now"). */
  also?: HomeTalkChoice[];
  /** About a health record: never put in a WhatsApp button. */
  health?: true;
};

/** An amount a shop sells, in the unit it is said in. */
export type SuggestedAmount = { quantity: number; unit: "g" | "kg" | "ml" | "l" | "pcs" | "packet" | "bottle" | "bunch" };

export type ChoiceContext = {
  t: Translate;
  now: Date;
  timezone: string;
  /** The household's first names, for "who is it for" with nothing narrower on record. */
  people?: readonly string[];
  /** Practical amounts per item, by lowercased name (`amountsFor`). */
  amounts?: Readonly<Record<string, readonly SuggestedAmount[]>>;
};

const MAX_CHOICES = 10;

/** The choices for the question a reply leaves open, or null when its answers aren't a known set. */
export function choicesFor(pending: PendingClarification | null | undefined, context: ChoiceContext): HomeTalkChoices | null {
  if (!pending) return null;
  const { t } = context;
  const skip = { label: t("hometalk.choice.skip"), say: "skip" };

  if (pending.action === "fill_homesend_details") {
    const offered = offeredTitles(pending.parameters.titles);
    const yes = { label: t("hometalk.choice.yes"), say: "yes" };
    const notNow = { label: t("hometalk.choice.notNow"), say: "not now" };
    // Several waiting: which of them to fill in now, all ticked to start.
    if (offered.length >= 2) return { mode: "multi", choices: offered.map((item) => ({ label: item.title, say: item.title })), also: [notNow] };
    return single([yes, notNow]);
  }

  if (pending.action === "complete_homesend_item") return intakeChoices(pending, context, skip);

  const awaiting = pending.parameters.awaiting;
  if (awaiting === "quantity") {
    const asked = strings(pending.parameters.quantityFor);
    const leave = /\bthat'?s enough\b/i.test(pending.question) ? { label: t("hometalk.choice.enough"), say: "that's enough" } : skip;
    // "How many bottles should I add for 1 litre?" (25-038): grounding's own choices, the last one switching the unit.
    const offered = strings(pending.parameters.choices);
    if (pending.parameters.unitAsk && offered.length > 0) return single(offered.map((said) => unitAskChoice(said, t)));
    if (asked.length === 1) {
      const amounts = (context.amounts?.[asked[0]!.toLowerCase()] ?? []).map((amount) => amountChoice(amount, t));
      return single([...amounts, leave]);
    }
    if (asked.length > 1) {
      return single([1, 2].map((count) => ({ label: t("hometalk.choice.ofEach", { count }), say: `${count} of each` })).concat(leave));
    }
    return null;
  }
  if (awaiting === "member") {
    const named = readFocus(pending.parameters.candidates).map((candidate) => candidate.label);
    const names = named.length > 0 ? named : [...(context.people ?? [])];
    return names.length >= 2 ? single(names.map((name) => ({ label: name, say: name }))) : null;
  }
  if (awaiting === "day") return single(dayChoices(context, "ahead"));
  if (awaiting === "referent" || pending.action === "order_items" || pending.action === "add_to_list" || pending.action === "plan_meal" || pending.action === "complete_school_item" || pending.action === "adjust_schedule") {
    const labels = readFocus(pending.parameters.candidates).map((candidate) => candidate.label);
    return labels.length >= 2 ? single(labels.map((label) => ({ label, say: label }))) : null;
  }
  return null;
}

function intakeChoices(pending: PendingClarification, context: ChoiceContext, skip: HomeTalkChoice): HomeTalkChoices | null {
  const { t } = context;
  const field = pending.parameters.field as DetailField | undefined;
  const kind = pending.parameters.kind as HomeSendKind | undefined;
  const health = kind === "health_document";
  const marked = (set: HomeTalkChoices | null): HomeTalkChoices | null => (set && health ? { ...set, health: true } : set);
  switch (field) {
    case "child":
    case "person": {
      const people = Array.isArray(pending.parameters.choices) ? (pending.parameters.choices as { displayName?: unknown }[]) : [];
      const names = people.map((person) => (typeof person.displayName === "string" ? person.displayName.split(/\s+/)[0]! : "")).filter(Boolean);
      return names.length > 0 ? marked(single([...names.map((name) => ({ label: name, say: name })), skip])) : null;
    }
    case "quantity": {
      const title = typeof pending.parameters.title === "string" ? pending.parameters.title : "";
      const amounts = (context.amounts?.[title.toLowerCase()] ?? []).map((amount) => amountChoice(amount, t));
      return single([...amounts, skip]);
    }
    case "dueDate":
      return marked(single([...dayChoices(context, "ahead"), skip]));
    case "date":
      return marked(single([...dayChoices(context, kind === "receipt" || kind === "health_document" ? "past" : "ahead"), skip]));
    case "time":
      return single([
        ...COMMON_TIMES.map((time) => ({ label: t(`hometalk.choice.time.${time.key}`), say: time.say })),
        { label: t("hometalk.choice.anotherTime"), say: null },
        skip,
      ]);
    case "recordType":
      {
        const set = single([...RECORD_TYPE_CHOICES.map((type) => ({ label: t(`hometalk.choice.record.${type.key}`), say: type.say })), skip]);
        return set ? { ...set, health: true } : null;
      }
    default:
      return null;
  }
}

const SWITCH_UNIT: Record<string, "l" | "ml" | "kg" | "g"> = { litre: "l", litres: "l", millilitre: "ml", millilitres: "ml", kilogram: "kg", kilograms: "kg", kilos: "kg", gram: "g", grams: "g" };

/** One of grounding's unit choices ("2 bottles", "Count it in litres instead"), labelled in the person's language where it can be. */
function unitAskChoice(said: string, t: Translate): HomeTalkChoice {
  const switchTo = /^count it in (\w+) instead$/i.exec(said.trim());
  if (switchTo) {
    const unit = SWITCH_UNIT[switchTo[1]!.toLowerCase()];
    return { label: unit ? t(`hometalk.choice.countIn.${unit}`) : said, say: said };
  }
  const amount = /^(\d+(?:\.\d+)?)\s*(g|kg|ml|l|litres?|bottles?|packets?|bunch(?:es)?)$/i.exec(said.trim());
  if (!amount) return { label: said, say: said };
  const word = amount[2]!.toLowerCase();
  const unit: SuggestedAmount["unit"] = word.startsWith("litre") ? "l" : word.startsWith("bottle") ? "bottle" : word.startsWith("packet") ? "packet" : word.startsWith("bunch") ? "bunch" : (word as SuggestedAmount["unit"]);
  return { label: t(`hometalk.choice.amount.${unit}`, { count: Number(amount[1]) }), say: said };
}

/** A few times a household plans around; "Another time…" for the rest. */
const COMMON_TIMES = [
  { key: "9am", say: "9 am" },
  { key: "12pm", say: "12 pm" },
  { key: "4pm", say: "4 pm" },
  { key: "6pm", say: "6 pm" },
] as const;

/** The words `readRecordType` (`hometalk/detail-answers.ts`) reads as each kind. */
const RECORD_TYPE_CHOICES = [
  { key: "prescription", say: "prescription" },
  { key: "lab", say: "lab report" },
  { key: "scan", say: "scan" },
  { key: "vaccination", say: "vaccination" },
  { key: "other", say: "something else" },
] as const;

/**
 * Today, Tomorrow, the next weekend day, then "Another day…"; for a date
 * already gone (a receipt, a health document), Today, Yesterday, then
 * "Another day…". The weekday is the household's own.
 */
function dayChoices(context: ChoiceContext, direction: "ahead" | "past"): HomeTalkChoice[] {
  const { t } = context;
  const another = { label: t("hometalk.choice.anotherDay"), say: null };
  if (direction === "past") return [{ label: t("hometalk.choice.today"), say: "today" }, { label: t("hometalk.choice.yesterday"), say: "yesterday" }, another];
  const today = weekdayIn(context.now, context.timezone);
  const choices: HomeTalkChoice[] = [
    { label: t("hometalk.choice.today"), say: "today" },
    { label: t("hometalk.choice.tomorrow"), say: "tomorrow" },
  ];
  // The next weekend day that isn't today or tomorrow already: Sunday after a Friday, none on a Saturday.
  if (today === "Friday") choices.push({ label: t("hometalk.choice.day.sunday"), say: "sunday" });
  else if (today !== "Saturday") choices.push({ label: t("hometalk.choice.day.saturday"), say: "saturday" });
  return [...choices, another];
}

function weekdayIn(now: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: timezone }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(now);
  }
}

function single(choices: HomeTalkChoice[]): HomeTalkChoices | null {
  const kept = dedupe(choices).slice(0, MAX_CHOICES);
  return kept.length > 0 ? { mode: "single", choices: kept } : null;
}

function dedupe(choices: readonly HomeTalkChoice[]): HomeTalkChoice[] {
  const seen = new Set<string>();
  return choices.filter((choice) => {
    const key = choice.label.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "") : [];
}

function offeredTitles(value: unknown): { id: string; title: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const record = entry as { id?: unknown; title?: unknown } | null;
    return record && typeof record.id === "string" && typeof record.title === "string" && record.title.trim() ? [{ id: record.id, title: record.title.trim() }] : [];
  });
}

/**
 * Several ticked answers as one turn: "Maths worksheet and Diwali dinner".
 * The joining "and" is HomeTalk's own English, which the engine reads.
 */
export function combinedSay(says: readonly string[]): string {
  const kept = says.map((said) => said.trim()).filter(Boolean);
  if (kept.length <= 1) return kept[0] ?? "";
  return `${kept.slice(0, -1).join(", ")} and ${kept.at(-1)}`;
}

/**
 * Whether a turn's only effect was asking (the owner's screenshot,
 * 2026-10-26): "yes" to filling in HomeSend details, or an answer that only
 * led to the next question. Such a turn shows no "Done … Can be undone"
 * preview card — a question isn't done, and there is nothing to undo.
 */
export function onlyAsked(input: { action: string; proposal: string; askedNext: boolean }): boolean {
  if (input.proposal !== "executed") return false;
  return input.action === "fill_homesend_details" || (input.action === "complete_homesend_item" && input.askedNext);
}

/** Choices as stored on a message's metadata, checked field by field; null for anything else. */
export function readChoices(value: unknown): HomeTalkChoices | null {
  const record = value as { mode?: unknown; choices?: unknown; also?: unknown; health?: unknown } | null;
  if (!record || (record.mode !== "single" && record.mode !== "multi")) return null;
  const read = (entries: unknown): HomeTalkChoice[] =>
    (Array.isArray(entries) ? entries : []).flatMap((entry) => {
      const choice = entry as { label?: unknown; say?: unknown } | null;
      return choice && typeof choice.label === "string" && choice.label.trim() && (typeof choice.say === "string" || choice.say === null) ? [{ label: choice.label, say: choice.say }] : [];
    }).slice(0, MAX_CHOICES);
  const choices = read(record.choices);
  if (choices.length === 0) return null;
  const also = read(record.also);
  return { mode: record.mode, choices, ...(also.length > 0 ? { also } : {}), ...(record.health === true ? { health: true as const } : {}) };
}

// --- Amounts ---------------------------------------------------------------------------------

/**
 * Two or three amounts a shop sells for this item, read by the one rule for
 * amounts (`commerce/bare-amount.ts`, 25-037) from the catalog's unit,
 * category, pack and ladder: litres for a liquid (500 ml, 1 litre, 2
 * litres), kilos for a loose staple (500 g, 1 kg, 2 kg), the catalog pack
 * for a small weighed thing (1, 2 and 4 packs' worth), pieces for counted
 * things (the pack when it has one, else 1, 2, 3), and the item's own word
 * (loaves, bunches). Nothing known about the item → no amounts; "Skip" and
 * the text box remain.
 */
export function suggestedAmounts(name: string, named: NamedItem | null): SuggestedAmount[] {
  if (!named) return [];
  const pack = named.pack ? { quantity: named.pack.quantity, unit: named.pack.unit } : null;
  const rule = bareRule({ name, unit: named.unit, catalog: { category: named.category, subcategory: null, pack, ladder: null } });
  switch (rule.kind) {
    case "litre":
      return [{ quantity: 500, unit: "ml" }, { quantity: 1, unit: "l" }, { quantity: 2, unit: "l" }];
    case "kilo":
      return [{ quantity: 500, unit: "g" }, { quantity: 1, unit: "kg" }, { quantity: 2, unit: "kg" }];
    case "piece": {
      const counted = pack && baseOf(pack.unit).unit === "pcs" ? pack.quantity * baseOf(pack.unit).factor : 1;
      return (counted > 1 ? [counted, counted * 2] : [1, 2, 3]).map((quantity) => ({ quantity, unit: "pcs" as const }));
    }
    case "own": {
      const unit = countedUnit(rule.one.unit) ?? "pcs";
      return [1, 2, 3].map((quantity) => ({ quantity, unit }));
    }
    case "pack": {
      const base = baseOf(rule.one.unit);
      if (base.unit !== "g" && base.unit !== "ml") return [];
      return [1, 2, 4].map((times) => inSaidUnit(rule.one.quantity * base.factor * times, base.unit as "g" | "ml"));
    }
    case "unclear": {
      // Kept by weight or volume, counted by people (lemons by the kilo): its ladder's amounts, never a bare number.
      const base = baseOf(named.unit).unit;
      if (base !== "g" && base !== "ml") return [];
      const first = ladderForItem({ category: named.category ?? "", subcategory: null, name, unit: named.unit }).sizes[0] ?? 0;
      return first > 0 ? [1, 2, 4].map((times) => inSaidUnit(first * times, base)) : [];
    }
  }
}

function countedUnit(unit: string): SuggestedAmount["unit"] | null {
  const key = unit.trim().toLowerCase().replace(/s$/, "");
  if (key === "packet" || key === "pack") return "packet";
  if (key === "bottle") return "bottle";
  if (key === "bunch" || key === "bunche") return "bunch";
  return null;
}

function inSaidUnit(amount: number, base: "g" | "ml"): SuggestedAmount {
  const rounded = Math.round(amount * 1000) / 1000;
  if (rounded >= 1000) return { quantity: Math.round((rounded / 1000) * 100) / 100, unit: base === "g" ? "kg" : "l" };
  return { quantity: rounded, unit: base };
}

/** The label in the person's language, and the English HomeTalk reads ("1 litre", "500 g", "2 packets"). */
export function amountChoice(amount: SuggestedAmount, t: Translate): HomeTalkChoice {
  const { quantity, unit } = amount;
  const label = t(`hometalk.choice.amount.${unit}`, { count: quantity });
  return { label, say: englishAmount(amount) };
}

export function englishAmount({ quantity, unit }: SuggestedAmount): string {
  const many = quantity !== 1;
  switch (unit) {
    case "l":
      return `${quantity} ${many ? "litres" : "litre"}`;
    case "pcs":
      return String(quantity);
    case "packet":
    case "bottle":
      return `${quantity} ${unit}${many ? "s" : ""}`;
    case "bunch":
      return `${quantity} ${many ? "bunches" : "bunch"}`;
    default:
      return `${quantity} ${unit}`;
  }
}
