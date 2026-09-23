import type { ContentClass, ContextCandidate } from "../ai/privacy";
import { freshnessQualifier } from "./freshness";
import type { ContextScope, HouseholdContextItem, PrivacyClass } from "./types";

/**
 * The context engine's side of the model boundary (Wave 1 §9).
 *
 *   Authenticate → household scope → RLS / authorized read → privacy scope
 *   → purpose + relevance → minimise → pseudonymise → provider
 *
 * Authentication and RLS happen before anything reaches this file: every
 * read went through the member's own client. What this adds is the second
 * line, applied to the derived items themselves, so that a read that ever
 * returned too much — a new adapter, a policy regression — still cannot
 * hand it to a model:
 *
 *  - an item from any other household is dropped, whatever its content;
 *  - money needs `finance.view`, health needs `health.manage`;
 *  - a `private` health item is only ever its subject's, or the subject's
 *    guardian's — never a household administrator's by virtue of being one
 *    (the health module's own precedent, kept here unchanged).
 *
 * Minimisation and pseudonymisation stay where they are, in `ai/privacy.ts`'s
 * consent gate: this file prepares candidates for it and never bypasses it.
 */

export type WithheldItem = { id: string; reason: "other_household" | "permission" | "health_scope" };

export function filterForViewer(
  items: readonly HouseholdContextItem[],
  scope: ContextScope,
): { items: HouseholdContextItem[]; withheld: WithheldItem[] } {
  const viewer = scope.viewer;
  const may = (permission: string) => viewer.permissions.includes(permission);
  const guarded = new Set(viewer.guardianOf);
  const kept: HouseholdContextItem[] = [];
  const withheld: WithheldItem[] = [];

  for (const item of items) {
    if (item.householdId !== scope.householdId) {
      withheld.push({ id: item.id, reason: "other_household" });
      continue;
    }
    if (item.privacyClass === "financial" && !may("finance.view")) {
      withheld.push({ id: item.id, reason: "permission" });
      continue;
    }
    if (item.privacyClass === "health") {
      if (!may("health.manage")) {
        withheld.push({ id: item.id, reason: "permission" });
        continue;
      }
      if (item.healthScope === "private" && !item.subjectMemberIds.every((subject) => subject === viewer.memberId || guarded.has(subject))) {
        withheld.push({ id: item.id, reason: "health_scope" });
        continue;
      }
    }
    kept.push(item);
  }

  return { items: kept, withheld };
}

/** The consent gate's class for a privacy class. `private` is somebody's own business: the strictest non-credential class. */
export function contentClassFor(privacyClass: PrivacyClass): ContentClass {
  return privacyClass === "private" ? "private_message" : privacyClass;
}

/**
 * Items as the consent gate's candidates. The candidate id is an opaque
 * sequence number — a row id never travels with a fact — and a stale fact
 * says so in its own words, so a model cannot repeat it as certain.
 */
export function toCandidates(
  items: readonly HouseholdContextItem[],
  relevant: (item: HouseholdContextItem) => boolean = () => true,
): ContextCandidate[] {
  return items.map((item, index) => ({
    id: `fact-${index + 1}`,
    contentClass: contentClassFor(item.privacyClass),
    need: item.need,
    text: `${item.summary.replace(/\.$/, "")}${freshnessQualifier(item)}.`.replace(/\.\.$/, "."),
    subjects: item.subjectMemberIds,
    relevant: relevant(item),
  }));
}
