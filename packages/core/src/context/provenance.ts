import type { HomeSendChange } from "../homesend/items";
import { formatDate } from "./format";
import type { HouseholdContextItem, SourceRef } from "./types";

/**
 * Where every fact came from (Wave 1 §10).
 *
 * Each item already names its own row as its primary source. What this adds
 * is the rest of the trail — a bill that exists because somebody sent a
 * photo to HomeSend carries that intake as evidence, so "why does
 * WonderHome think this?" has an answer with an id, a time and a
 * confirmation behind it.
 *
 * What is stored is structure — source ids, confidence, confirmation and
 * timestamps — and never a model's reasoning.
 */

/** Which table a HomeSend change routed into, by the change's own domain. */
const TABLE_FOR_DOMAIN: Record<HomeSendChange["domain"], string> = {
  bill: "bill",
  school_item: "school_item",
  grocery_item: "consumable",
  health_document: "health_record",
};

/** Attaches each routed HomeSend intake to the item it became. Returns new objects. */
export function attachHomeSendEvidence(items: readonly HouseholdContextItem[], changes: readonly HomeSendChange[]): HouseholdContextItem[] {
  const byItem = new Map<string, SourceRef[]>();
  for (const change of changes) {
    if (change.undoneAt) continue;
    const id = `${TABLE_FOR_DOMAIN[change.domain]}:${change.entityId}`;
    const refs = byItem.get(id) ?? [];
    refs.push({ type: "homesend_intake", sourceId: change.intakeId, capturedAt: change.createdAt });
    byItem.set(id, refs);
  }

  return items.map((item) => {
    const refs = byItem.get(item.id);
    return refs ? { ...item, evidence: [...item.evidence, ...refs] } : item;
  });
}

/** Every source behind one fact: the row itself first, then the trail that led to it. */
export function sourcesOf(item: HouseholdContextItem): SourceRef[] {
  return [item.source, ...item.evidence];
}

/**
 * The provenance block, in the shape the council asked for:
 *
 *   Fact: Asmi has Mathematics homework due tomorrow.
 *   Sources: school_items/123, HomeSend intake/987
 *   Confirmation: 23 Sep 2026
 */
export function describeProvenance(item: HouseholdContextItem, timezone: string): string[] {
  const sources = sourcesOf(item)
    .map((ref) => `${labelFor(ref.type)}${ref.sourceId ? `/${ref.sourceId}` : ""}`)
    .join(", ");
  const confirmedAt = [item.source.capturedAt, ...item.evidence.map((ref) => ref.capturedAt)].find(Boolean) ?? item.freshnessAt;
  return [
    `Fact: ${item.summary}`,
    `Sources: ${sources}`,
    item.confirmed ? `Confirmation: ${formatDate(new Date(confirmedAt), timezone)}` : `Confidence: ${Math.round(item.confidence * 100)}%, not yet confirmed by anyone`,
  ];
}

/** One sentence a household can read: "Added from something you sent to HomeSend on Sun 21 Sep." */
export function explainProvenance(item: HouseholdContextItem, timezone: string): string {
  const intake = item.evidence.find((ref) => ref.type === "homesend_intake");
  if (intake?.capturedAt) return `Added from something sent to HomeSend on ${formatDate(new Date(intake.capturedAt), timezone)}.`;
  if (item.source.type === "certification_items") {
    return item.confirmed ? "Something the household told WonderHome in HomeBrain Review, and confirmed." : "A belief in HomeBrain Review that nobody has confirmed yet.";
  }
  if (item.source.type.startsWith("memories")) {
    return item.confirmed ? "Something the household told WonderHome and confirmed." : "Something WonderHome picked up and has not had confirmed yet.";
  }
  const provider = item.attributes.provider;
  if (typeof provider === "string" && provider.trim()) return `Imported from ${provider.replace(/_/g, " ")}, a connected service.`;
  if (!item.confirmed) return "Something WonderHome worked out, not something a person entered.";
  return "Entered by the household.";
}

function labelFor(type: string): string {
  if (type === "homesend_intake") return "HomeSend intake";
  if (type === "household_state") return "household summary";
  return type;
}
