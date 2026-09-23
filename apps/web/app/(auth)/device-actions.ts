"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { ASSET_CATEGORIES } from "@wonderhome/core/home/assets";
import { updateDeviceLink } from "@wonderhome/core/home/device-repository";
import { createAsset } from "@wonderhome/core/home/repository";
import { requireHouseholdAdmin } from "@wonderhome/core/identity/households";

import type { ActionState } from "./actions";

/**
 * A household's decisions about its devices (story 17-008): which appliance
 * each one is, and whether to ignore it. Admin only, checked here and again
 * by RLS and the column grants.
 */

/** The picker's own "not listed" value: the appliance is added, then linked. */
const NEW_ASSET = "new";

const linkSchema = z.object({
  householdId: z.uuid(),
  linkId: z.uuid(),
  asset: z.union([z.uuid(), z.literal(""), z.literal(NEW_ASSET)]),
  newName: z.string().trim().max(120).optional(),
  newCategory: z.enum(ASSET_CATEGORIES).optional(),
});

function refresh() {
  revalidatePath("/household/integrations");
  revalidatePath("/household/home");
}

export async function linkDeviceAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = linkSchema.safeParse({
    householdId: formData.get("householdId"),
    linkId: formData.get("linkId"),
    asset: formData.get("asset") ?? "",
    newName: formData.get("newName") || undefined,
    newCategory: formData.get("newCategory") || undefined,
  });
  if (!parsed.success) return { error: "Pick an appliance, or add the one it is." };
  if (parsed.data.asset === NEW_ASSET && !parsed.data.newName) return { error: "Give the appliance a name." };

  try {
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, parsed.data.householdId);

    let assetId: string | null = parsed.data.asset === "" ? null : parsed.data.asset;
    if (parsed.data.asset === NEW_ASSET) {
      const created = await createAsset(supabase, {
        householdId: parsed.data.householdId,
        name: parsed.data.newName!,
        category: parsed.data.newCategory ?? "appliance",
      });
      assetId = created.id;
    }

    await updateDeviceLink(supabase, { householdId: parsed.data.householdId, linkId: parsed.data.linkId, assetId });
    refresh();
    return { notice: assetId ? "Linked. Its fresh readings count from the next sync." : "Unlinked. Its readings are no longer used." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "devices").body.error.message };
  }
}

const ignoreSchema = z.object({ householdId: z.uuid(), linkId: z.uuid(), ignored: z.enum(["true", "false"]) });

/** Ignore or stop ignoring — never a delete: a device goes when its provider is disconnected. */
export async function ignoreDeviceAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = ignoreSchema.safeParse({
    householdId: formData.get("householdId"),
    linkId: formData.get("linkId"),
    ignored: formData.get("ignored"),
  });
  if (!parsed.success) return { error: "That device could not be found." };

  try {
    const supabase = await createClient();
    await requireHouseholdAdmin(supabase, parsed.data.householdId);
    const ignored = parsed.data.ignored === "true";
    await updateDeviceLink(supabase, { householdId: parsed.data.householdId, linkId: parsed.data.linkId, ignored });
    refresh();
    return { notice: ignored ? "Ignored. Nothing it reports is used, and you can undo this." : "Its readings are used again." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "devices").body.error.message };
  }
}
