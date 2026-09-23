import { createHash } from "node:crypto";

import { contextItemsFor, GOLDEN_HOUSEHOLDS } from "./households";
import type { EvalCase } from "./types";

/**
 * What a run was made with (Wave 5 §12, §22), each derived from the thing
 * itself rather than a number someone has to remember to bump:
 *
 * - the prompt version changes when any prompt a model is given changes, or
 *   the output schema it must answer in;
 * - the context version changes when what the context engine builds from
 *   a household changes — a new fact, a renamed field, a different
 *   privacy class;
 * - the dataset version changes when a golden case is added, removed or
 *   edited.
 *
 * So two runs with the same three versions were measured against the same
 * thing, and a change in a pass rate can be traced to what changed.
 */

function shortHash(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex").slice(0, 12);
}

export { promptVersion } from "./prompt-version";

export function contextVersion(): string {
  // Household A seen by its head: the widest view of the richest household.
  const items = contextItemsFor(GOLDEN_HOUSEHOLDS.A, "a-kunal").map((item) => ({
    id: item.id,
    domain: item.domain,
    entityType: item.entityType,
    privacyClass: item.privacyClass,
    summary: item.summary,
    need: item.need,
    freshness: item.freshness,
    tier: item.tier,
    attributes: item.attributes,
  }));
  return `c-${shortHash(items)}`;
}

export function datasetVersion(cases: readonly EvalCase[]): string {
  return `d-${shortHash([...cases].sort((a, b) => a.id.localeCompare(b.id)))}`;
}
