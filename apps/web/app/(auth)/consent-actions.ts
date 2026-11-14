"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auditChange } from "@wonderhome/core/api/audit";
import { toErrorBody } from "@wonderhome/core/api/errors";
import { forgetLearnedDefaults } from "@wonderhome/core/homesend/learned-repository";
import { saveConfirmRequested } from "@wonderhome/core/conversation/consent-repository";
import { asAutoAddPercent, AUTO_ADD_PERCENTS } from "@wonderhome/core/homesend/auto-add";
import { saveAutoAddPercent } from "@wonderhome/core/household/auto-add-repository";
import { saveDirectAdd } from "@wonderhome/core/household/direct-add-repository";
import { saveHomeSendTidy } from "@wonderhome/core/household/homesend-tidy-repository";
import { RETENTION_WINDOW_CHOICES, saveRetentionWindow } from "@wonderhome/core/privacy/retention-window-repository";
import { createClient } from "@wonderhome/core/db/server";
import { requireHouseholdAdmin } from "@wonderhome/core/identity/households";

import type { ActionState } from "./actions";

/**
 * "Ask before acting on what I say" (HomeBrain 4.0 §3.9, story 14-025): an
 * Admin decides, for the whole household, whether a clear request in
 * HomeTalk is done at once (with an undo) or asked about first.
 */
const schema = z.object({ householdId: z.uuid(), confirm: z.enum(["on", "off"]) });

export async function saveConfirmRequestedAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    const membership = await requireHouseholdAdmin(supabase, parsed.data.householdId);
    await saveConfirmRequested(supabase, { householdId: parsed.data.householdId, actorMemberId: membership.memberId, confirm: parsed.data.confirm === "on" });
  } catch (thrown) {
    return { error: toErrorBody(thrown, "privacy").body.error.message };
  }
  revalidatePath("/settings/ai");
  return { notice: "saved" };
}

/**
 * How sure HomeSend must be before it adds an entry on its own (the owner,
 * 2026-10-26): an Admin picks the bar from the ones WonderHome offers.
 */
/** "0" is "Set for each kind by WonderHome" (`homebrain/kind-bar.ts`). */
const autoAddSchema = z.object({ householdId: z.uuid(), percent: z.enum(["0", ...AUTO_ADD_PERCENTS.map(String)] as [string, ...string[]]) });

export async function saveAutoAddPercentAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = autoAddSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    const membership = await requireHouseholdAdmin(supabase, parsed.data.householdId);
    await saveAutoAddPercent(supabase, { householdId: parsed.data.householdId, actorMemberId: membership.memberId, percent: parsed.data.percent === "0" ? "auto" : asAutoAddPercent(parsed.data.percent) });
  } catch (thrown) {
    return { error: toErrorBody(thrown, "privacy").body.error.message };
  }
  revalidatePath("/settings/ai");
  return { notice: "saved" };
}

/**
 * How long passed, handled entries are kept before periodic cleanup removes
 * them (the owner, 2026-10-28; `docs/data-retention.md`): an Admin picks the
 * household's retention window, or turns cleanup off. Picked, not typed.
 */
const retentionWindowSchema = z.object({
  householdId: z.uuid(),
  window: z.enum(["off", ...RETENTION_WINDOW_CHOICES.map(String)] as [string, ...string[]]),
});

export async function saveRetentionWindowAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = retentionWindowSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    const membership = await requireHouseholdAdmin(supabase, parsed.data.householdId);
    const days = parsed.data.window === "off" ? null : Number(parsed.data.window);
    await saveRetentionWindow(supabase, { householdId: parsed.data.householdId, actorMemberId: membership.memberId, days });
  } catch (thrown) {
    return { error: toErrorBody(thrown, "privacy").body.error.message };
  }
  revalidatePath("/settings/privacy");
  return { notice: "saved" };
}

/**
 * "Add money entries directly" / "Add health entries directly" (the owner,
 * 2026-10-26): an Admin decides whether bills and receipts, or health
 * documents, may be added on their own at all (`homesend/auto-add.ts`).
 */
const directAddSchema = z.object({ householdId: z.uuid(), area: z.enum(["money", "health"]), on: z.enum(["on", "off"]) });

export async function saveDirectAddAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = directAddSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    const membership = await requireHouseholdAdmin(supabase, parsed.data.householdId);
    await saveDirectAdd(supabase, { householdId: parsed.data.householdId, actorMemberId: membership.memberId, area: parsed.data.area, on: parsed.data.on === "on" });
  } catch (thrown) {
    return { error: toErrorBody(thrown, "privacy").body.error.message };
  }
  revalidatePath("/settings/ai");
  return { notice: "saved" };
}

/**
 * "Tidy up items that no longer apply" (the owner, 2026-11-03): an Admin
 * decides whether HomeSend's daily tidy may archive waiting items that no
 * longer apply (`homesend/tidy.ts`). On unless turned off.
 */
const homesendTidySchema = z.object({ householdId: z.uuid(), on: z.enum(["on", "off"]) });

export async function saveHomeSendTidyAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = homesendTidySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    const membership = await requireHouseholdAdmin(supabase, parsed.data.householdId);
    await saveHomeSendTidy(supabase, { householdId: parsed.data.householdId, actorMemberId: membership.memberId, on: parsed.data.on === "on" });
  } catch (thrown) {
    return { error: toErrorBody(thrown, "privacy").body.error.message };
  }
  revalidatePath("/settings/ai");
  return { notice: "saved" };
}

const forgetLearnedSchema = z.object({ householdId: z.string().uuid(), id: z.string().uuid().optional() });

/**
 * "Forget" on what HomeSend has learned (14-066): an Admin clears one thing
 * HomeSend remembered about who a sender's items are for, or all of it.
 * HomeSend then asks again the next time. Audited with the count only.
 */
export async function forgetLearnedAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const raw = Object.fromEntries(formData);
  const parsed = forgetLearnedSchema.safeParse({ householdId: raw.householdId, id: raw.id || undefined });
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    const membership = await requireHouseholdAdmin(supabase, parsed.data.householdId);
    const count = await forgetLearnedDefaults(supabase, parsed.data.householdId, parsed.data.id);
    await auditChange({ householdId: parsed.data.householdId, actorMemberId: membership.memberId, eventType: "homesend.learned_forgotten", targetTable: "homesend_learned_defaults", targetId: parsed.data.id ?? null, metadata: { count, all: !parsed.data.id } });
  } catch (thrown) {
    return { error: toErrorBody(thrown, "privacy").body.error.message };
  }
  revalidatePath("/settings/ai");
  return { notice: "forgotten" };
}
