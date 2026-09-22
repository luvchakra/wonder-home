import type { SupabaseClient } from "@supabase/supabase-js";

import type { IntakeSource } from "../ai/classify-intake";
import type { HomeSendExtraction, HomeSendKind } from "./items";
import { setHomeSendClassification } from "./repository";

/**
 * Classifies one intake's content and saves whatever came back — shared by
 * every HomeSend entry point (upload, paste, and the Web Share Target) so
 * the "never guess, never throw, fall back to manual entry" contract lives
 * in one place rather than being re-implemented per channel. The item
 * itself must already exist (`createHomeSendItem`/`createEmailHomeSendItem`
 * already ran); this only ever updates its classification.
 */

export type ClassifyAndSaveResult = {
  notice: string;
  item: { id: string; classifiedKind: HomeSendKind; extracted: HomeSendExtraction | null };
};

export function emptyExtraction(): HomeSendExtraction {
  return {
    title: null, notes: null, billKind: null, payee: null, amount: null, currency: null,
    dueDate: null, schoolKind: null, subject: null, quantity: null, unit: null, category: null,
    secondary: null,
  };
}

export async function classifyAndSave(
  supabase: SupabaseClient,
  householdId: string,
  itemId: string,
  source: IntakeSource,
): Promise<ClassifyAndSaveResult> {
  const { readHouseholdKey } = await import("../ai/credentials");
  const { resolveModelKey, platformKey } = await import("../ai/model-key");
  const { classifyIntake } = await import("../ai/classify-intake");

  const householdKey = await readHouseholdKey(householdId).catch(() => null);
  const key = resolveModelKey(householdKey, platformKey());
  if (key.source === "none" || !key.provider || !key.key) {
    return {
      notice: "No AI provider is set up for this household yet — you can still tell WonderHome what this is below.",
      item: { id: itemId, classifiedKind: "unknown", extracted: null },
    };
  }

  const extraction = await classifyIntake(key.provider, key.key, source);
  if (!extraction || !extraction.readable) {
    await setHomeSendClassification(supabase, householdId, itemId, { classifiedKind: "unknown", extracted: emptyExtraction() });
    return {
      notice: "Could not make that out — please fill in the details below by hand.",
      item: { id: itemId, classifiedKind: "unknown", extracted: null },
    };
  }

  const extracted: HomeSendExtraction = {
    title: extraction.title,
    notes: extraction.notes,
    billKind: extraction.billKind,
    payee: extraction.payee,
    amount: extraction.amount,
    currency: extraction.currency,
    dueDate: extraction.dueDate,
    schoolKind: extraction.schoolKind,
    subject: extraction.subject,
    quantity: extraction.quantity,
    unit: extraction.unit,
    category: extraction.category,
    secondary: extraction.secondary,
  };
  await setHomeSendClassification(supabase, householdId, itemId, { classifiedKind: extraction.kind, extracted });

  return {
    notice: "Filled in from what you sent — check it over before adding.",
    item: { id: itemId, classifiedKind: extraction.kind, extracted },
  };
}
