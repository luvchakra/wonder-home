import { notFound, redirect } from "next/navigation";

import { householdThreadId } from "@wonderhome/core/chat/repository";

import { requireSession } from "../../_lib/session";

export const dynamic = "force-dynamic";

/**
 * Family's "Family chat" icon lands here (the owner, 2026-10-21: "a group
 * chat for family should be available"): the household's one chat with
 * everyone in it, found or opened once by `chat_household_thread`.
 */
export default async function FamilyChatPage() {
  const { supabase, chatOn, membership } = await requireSession("/chat/family");
  if (!chatOn) notFound();
  let threadId: string;
  try {
    threadId = await householdThreadId(supabase, membership.household.id);
  } catch {
    notFound();
  }
  redirect(`/chat/${threadId}`);
}
