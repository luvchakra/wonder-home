import { notFound, redirect } from "next/navigation";

import { openDirect } from "@wonderhome/core/chat/repository";

import { requireSession } from "../../../_lib/session";

export const dynamic = "force-dynamic";

/**
 * Family's chat icon and the inbox's Start a chat land here: the direct chat
 * with this person is found, or opened once, by `chat_open_direct` (which
 * holds both people to the same household), and the member goes straight to it.
 */
export default async function ChatWithPage({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(memberId)) notFound();
  const { supabase } = await requireSession(`/chat/with/${memberId}`);
  let threadId: string;
  try {
    threadId = await openDirect(supabase, memberId);
  } catch {
    notFound();
  }
  redirect(`/chat/${threadId}`);
}
