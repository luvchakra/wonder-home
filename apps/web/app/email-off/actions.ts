"use server";

import { createAdminClient } from "@wonderhome/core/db/admin";
import { turnEmailOff } from "@wonderhome/core/notifications/email-health";
import { verifyUnsubscribe } from "@wonderhome/core/notifications/unsubscribe";
import { z } from "zod";

/**
 * The button on the link at the foot of a notification email (story 27-009).
 * The signed token is the only credential and it can do only this: switch
 * that person's email channel off. Anything else answers the same, so a
 * guessed link learns nothing.
 */
export async function turnEmailOffAction(_previous: { done?: boolean; error?: boolean }, formData: FormData): Promise<{ done?: boolean; error?: boolean }> {
  const link = z.object({ m: z.uuid(), t: z.string().min(1).max(512) }).safeParse({ m: formData.get("m"), t: formData.get("t") });
  if (!link.success) return { error: true };
  const { m: memberId, t: token } = link.data;
  if (!verifyUnsubscribe(memberId, token)) return { error: true };
  return (await turnEmailOff(createAdminClient(), memberId)) ? { done: true } : { error: true };
}
