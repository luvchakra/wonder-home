"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { adminClientFor, adminGrant } from "@wonderhome/core/db/admin-context";
import { log } from "@wonderhome/core/observability/logger";
import { resultMessage, RUN_ACTIONS, type RunActionId } from "@wonderhome/core/platform/performance-actions";

import { confirmStaffPassword } from "../../_lib/platform-step-up";
import { platformStaff } from "../../_lib/platform-staff";

/**
 * The Performance page's one write surface (the owner, 2026-10-29). A fixed
 * allowlist: three maintenance actions, each a guarded database function that
 * checks the staff role again, validates its arguments, audits the run and
 * rate limits it. Nothing here forwards SQL. Schema changes are never run
 * from the web; the page offers a snippet to copy instead.
 */

export type PerformanceActionState = {
  tone: "info" | "risk" | null;
  message: string | null;
  /** A preview's count of connections, before the person confirms. */
  preview?: number;
  previewMinutes?: number;
  /** Bumped on every answer so the same message shows again. */
  n?: number;
};

const NOT_ALLOWED: PerformanceActionState = { tone: "risk", message: "Only platform staff with the right role can do this." };

const schema = z.object({
  action: z.enum(["analyze", "reset_statements", "end_idle_sessions"]),
  target: z.string().max(63).optional(),
  minutes: z.coerce.number().int().min(1).max(1440).optional(),
  step: z.enum(["preview", "run"]).default("run"),
  password: z.string().max(200).optional(),
});

export async function runPerformanceAction(previous: PerformanceActionState, formData: FormData): Promise<PerformanceActionState> {
  const n = (previous.n ?? 0) + 1;
  const answer = (state: Omit<PerformanceActionState, "n">): PerformanceActionState => ({ ...state, n });

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return answer({ tone: "risk", message: "That request was not understood. Nothing was run." });
  const { action, minutes, step, password } = parsed.data;
  const target = parsed.data.target?.trim() || null;
  const info = RUN_ACTIONS[action as RunActionId];

  const staff = await platformStaff(info.capability);
  if (!staff) return answer(NOT_ALLOWED);

  if (action === "end_idle_sessions" && minutes === undefined) return answer({ tone: "risk", message: "Choose how long a connection must have been stuck." });
  if (action === "analyze" && target !== null && target.length === 0) return answer({ tone: "risk", message: "Choose a table." });

  // Destructive: the person proves it is them, again, right before it runs.
  const needsPassword = info.stepUp && !(action === "end_idle_sessions" && step === "preview");
  if (needsPassword) {
    const check = await confirmStaffPassword(password ?? "");
    if (check !== "ok") {
      log.warn("platform performance action refused at step-up", { event: "platform_perf_step_up_refused", action, reason: check, allow: ["event", "action", "reason"] });
      return answer({
        tone: "risk",
        message: check === "limited" ? "Too many attempts. Wait a moment." : check === "unavailable" ? "We could not check your password just now. Nothing was run." : "That password did not match. Nothing was run.",
      });
    }
  }

  const admin = adminClientFor(adminGrant.platformAdmin(staff, `performance action: ${action}`));
  const rpc =
    action === "analyze"
      ? await admin.rpc("platform_perf_analyze", { p_staff_profile_id: staff.profileId, p_table: target })
      : action === "reset_statements"
        ? await admin.rpc("platform_perf_reset_statements", { p_staff_profile_id: staff.profileId })
        : await admin.rpc("platform_perf_end_idle_sessions", { p_staff_profile_id: staff.profileId, p_minutes: minutes, p_dry_run: step === "preview" });

  if (action === "end_idle_sessions" && step === "preview" && !rpc.error) {
    const count = Number((rpc.data as { count?: number } | null)?.count ?? 0);
    return answer({
      tone: "info",
      preview: count,
      previewMinutes: minutes,
      message: count === 0 ? "No app connections have been stuck that long. Nothing to end." : `${count} app ${count === 1 ? "connection has" : "connections have"} been stuck that long.`,
    });
  }

  revalidatePath("/platform-admin/performance");
  return answer(resultMessage(action as RunActionId, target, rpc));
}
