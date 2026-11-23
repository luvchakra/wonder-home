import type { SupabaseClient } from "@supabase/supabase-js";

import { DELIVERY_ORDER } from "./delivery";
import { JOB_STEPS } from "./heartbeat";

/**
 * "Delivery clock on GitHub" on Platform admin's Overview and Integrations
 * (owner, 2026-11-23): whether the token is saved, and whether GitHub has
 * delivered recently, from the `delivery.*` heartbeats.
 */
export type DeliveryClockState = "not-set" | "running" | "failing";
export type DeliveryClockStatus = { state: DeliveryClockState; words: string };

const FRESH_MS = JOB_STEPS["delivery.due"].staleAfterMinutes * 60_000;

function ago(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 120) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

/** The line itself, from whether the token is saved and when GitHub last finished a delivery step. */
export function deliveryClockStatus(tokenSet: boolean, lastGitHubRun: Date | null, now: Date): DeliveryClockStatus {
  if (!tokenSet) return { state: "not-set", words: "Delivery clock on GitHub: not set — Vercel delivers every 5 minutes." };
  const age = lastGitHubRun ? now.getTime() - lastGitHubRun.getTime() : null;
  if (age !== null && age <= FRESH_MS) return { state: "running", words: `Delivery clock on GitHub: running (last run ${ago(age)}).` };
  const last = age === null ? "no run yet" : `last run ${ago(age)}`;
  return { state: "failing", words: `Delivery clock on GitHub: failing (${last}) — Vercel is delivering. Check the token and Actions → Delivery clock.` };
}

/** The latest clean finish of any delivery step on GitHub; null when there is none or it can't be read. */
export async function lastGitHubDelivery(admin: SupabaseClient): Promise<Date | null> {
  try {
    const { data, error } = await admin
      .from("platform_job_heartbeats")
      .select("last_ok_at")
      .eq("runner", "github")
      .in("step", DELIVERY_ORDER as string[])
      .order("last_ok_at", { ascending: false, nullsFirst: false })
      .limit(1);
    if (error) return null;
    const at = (data as { last_ok_at: string | null }[] | null)?.[0]?.last_ok_at;
    return at ? new Date(at) : null;
  } catch {
    return null;
  }
}
