"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { createDeveloperKey, developerApiEnabled, PARTNER_SCOPES, revokeDeveloperKey } from "@wonderhome/core/developer/keys";
import { requireHouseholdAdmin } from "@wonderhome/core/identity/households";

/**
 * Partner keys (story 18-008): an Admin creates one — seen in full exactly
 * once, in this action's answer — and revokes one. The Admin check runs on
 * the household session first; only then does the server-only table get
 * touched, through the service-role client.
 */
export type DeveloperKeyState = { error?: string; notice?: string; key?: string };

const createSchema = z.object({
  householdId: z.uuid(),
  name: z.string().trim().min(1, { error: "Give the key a name you'll recognise." }).max(60),
  environment: z.enum(["sandbox", "live"]),
  scopes: z.array(z.enum(PARTNER_SCOPES)).min(1, { error: "Choose at least one thing the key may do." }),
  expiresInDays: z.enum(["30", "90", "365", "never"]),
});

export async function createDeveloperKeyAction(_previous: DeveloperKeyState, formData: FormData): Promise<DeveloperKeyState> {
  if (!developerApiEnabled()) return { error: "Developer access is not switched on for this deployment." };
  const parsed = createSchema.safeParse({
    householdId: formData.get("householdId"),
    name: formData.get("name"),
    environment: formData.get("environment"),
    scopes: formData.getAll("scopes"),
    expiresInDays: formData.get("expiresInDays"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  try {
    const membership = await requireHouseholdAdmin(await createClient(), parsed.data.householdId);
    const { key } = await createDeveloperKey(createAdminClient(), {
      householdId: parsed.data.householdId,
      memberId: membership.memberId,
      name: parsed.data.name,
      environment: parsed.data.environment,
      scopes: parsed.data.scopes,
      expiresInDays: parsed.data.expiresInDays === "never" ? null : Number(parsed.data.expiresInDays),
    });
    revalidatePath("/household/integrations");
    return { key, notice: "Key created. Copy it now: it won't be shown again." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "developer").body.error.message };
  }
}

const revokeSchema = z.object({ householdId: z.uuid(), keyId: z.uuid() });

export async function revokeDeveloperKeyAction(_previous: DeveloperKeyState, formData: FormData): Promise<DeveloperKeyState> {
  const parsed = revokeSchema.safeParse({ householdId: formData.get("householdId"), keyId: formData.get("keyId") });
  if (!parsed.success) return { error: "Something is missing." };
  try {
    const membership = await requireHouseholdAdmin(await createClient(), parsed.data.householdId);
    await revokeDeveloperKey(createAdminClient(), { householdId: parsed.data.householdId, memberId: membership.memberId, keyId: parsed.data.keyId });
    revalidatePath("/household/integrations");
    return { notice: "Revoked. Anything using it stops working now." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "developer").body.error.message };
  }
}
