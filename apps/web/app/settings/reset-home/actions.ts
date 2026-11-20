"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ApiError } from "@wonderhome/core/api/errors";
import { adminGrant } from "@wonderhome/core/db/admin-context";
import { createClient, verifyUser } from "@wonderhome/core/db/server";
import { startOnboarding } from "@wonderhome/core/household/onboarding-repository";
import { confirmsHomeName, mayResetHome } from "@wonderhome/core/household/reset-policy";
import { resetHousehold, ResetUnavailableError } from "@wonderhome/core/household/reset-repository";
import { requireMembership } from "@wonderhome/core/identity/households";
import { log } from "@wonderhome/core/observability/logger";

import { confirmStaffPassword } from "../../_lib/platform-step-up";
import type { ResetState } from "./reset-state";

/**
 * Reset home (story 15-014). The order of checks is the point:
 *
 *   1. signed in, a member of this household, and its owner, on the app
 *      (`mayResetHome`: never another Admin, a child, a voice channel or an agent);
 *   2. the home's name typed;
 *   3. a fresh step-up: the password, or a Google sign-in in the last ten
 *      minutes for a Google-only account (`confirmStaffPassword`, PR #565);
 *   4. the reset itself, through a grant only the owner can be given, and a
 *      database function that checks the owner and the name again.
 *
 * Nothing here runs on a timer, a default or a model: only this form submits it.
 */
const schema = z.object({
  householdId: z.uuid(),
  confirmName: z.string().max(200),
  password: z.string().max(200).optional(),
});

export async function resetHomeAction(_previous: ResetState, formData: FormData): Promise<ResetState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { code: "invalid" };
  const { householdId, confirmName, password } = parsed.data;

  const supabase = await createClient();
  const user = await verifyUser(supabase);
  if (!user) return { code: "not_owner" };

  let membership;
  try {
    membership = await requireMembership(supabase, householdId);
  } catch {
    return { code: "not_owner" };
  }
  if (!mayResetHome(membership, "app", householdId).ok) return { code: "not_owner" };
  if (!confirmsHomeName(confirmName, membership.household.name)) return { code: "name_mismatch" };

  const check = await confirmStaffPassword(password ?? "");
  if (check !== "ok") return { code: check };

  try {
    await resetHousehold(adminGrant.householdOwner(membership, "reset home"), {
      householdId,
      actorProfileId: user.id,
      confirmName,
    });
  } catch (thrown) {
    if (thrown instanceof ResetUnavailableError) return { code: "not_available" };
    if (thrown instanceof ApiError && thrown.code === "forbidden") return { code: "not_owner" };
    if (thrown instanceof ApiError && thrown.code === "unprocessable") return { code: "name_mismatch" };
    log.error("reset home failed", { reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["reason"] });
    return { code: "failed" };
  }

  // A new household starts guided setup; so does a reset one.
  try {
    await startOnboarding(supabase, { householdId, memberId: membership.memberId });
  } catch (error) {
    log.warn("onboarding not restarted after reset", { reason: error instanceof Error ? error.name : "unknown", allow: ["reason"] });
  }

  revalidatePath("/", "layout");
  redirect("/onboarding");
}
