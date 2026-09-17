"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@wonderhome/core/db/server";

/**
 * Moving a notification along its lifecycle: seen, acted, resolved.
 *
 * The recipient may update their own notifications and nobody else's — the
 * RLS policy says so, and a request for another member's row affects nothing.
 */
const schema = z.object({
  notificationId: z.uuid(),
  status: z.enum(["seen", "acted", "resolved"]),
});

export async function updateNotificationAction(formData: FormData): Promise<void> {
  const parsed = schema.safeParse({ notificationId: formData.get("notificationId"), status: formData.get("status") });
  if (!parsed.success) return;

  const supabase = await createClient();
  const stamp = `${parsed.data.status}_at`;
  await supabase
    .from("notifications")
    .update({ status: parsed.data.status, [stamp]: new Date().toISOString() })
    .eq("id", parsed.data.notificationId);

  revalidatePath("/notifications");
  revalidatePath("/");
}
