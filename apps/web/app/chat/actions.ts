"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { addPeople, editMessage, leaveChat, markRead, resolveLink, sendMessage, takeBackMessage, type LinkChoice } from "@wonderhome/core/chat/repository";
import { CHAT_PAGE_KEYS, CHAT_RECORD_KINDS } from "@wonderhome/core/chat/links";
import { createClient } from "@wonderhome/core/db/server";
import { requireMembership } from "@wonderhome/core/identity/households";

/**
 * Household chat's writes (story 12-015). The browser names only the thread,
 * its own words, and — for an attachment — a record's kind and id or a
 * screen's key. Who is writing comes from the session's own membership, the
 * link is rebuilt from the record as this member's session reads it, and RLS
 * plus the `chat_*` functions decide every write again.
 */
type Result = { ok: true } | { error: string };

const attachment = z
  .union([
    z.object({ kind: z.enum(CHAT_RECORD_KINDS), id: z.uuid() }),
    z.object({ kind: z.literal("page"), key: z.enum(CHAT_PAGE_KEYS) }),
  ])
  .nullable();

const sendSchema = z.object({ householdId: z.uuid(), threadId: z.uuid(), body: z.string().max(4000), attachment });

export async function sendChatMessageAction(input: z.input<typeof sendSchema>): Promise<Result> {
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { error: "That didn't send." };
  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    const link = await resolveLink(supabase, parsed.data.householdId, parsed.data.attachment as LinkChoice | null);
    if (parsed.data.attachment && !link) return { error: "That can't be attached." };
    await sendMessage(supabase, {
      threadId: parsed.data.threadId,
      householdId: parsed.data.householdId,
      authorMemberId: membership.memberId,
      body: parsed.data.body,
      link,
    });
    await markRead(supabase, parsed.data.threadId).catch(() => undefined);
  } catch (thrown) {
    return { error: toErrorBody(thrown, "household").body.error.message };
  }
  revalidatePath(`/chat/${parsed.data.threadId}`);
  return { ok: true };
}

const messageSchema = z.object({ threadId: z.uuid(), messageId: z.uuid() });

export async function editChatMessageAction(input: z.input<typeof messageSchema> & { body: string }): Promise<Result> {
  const parsed = messageSchema.extend({ body: z.string().max(4000) }).safeParse(input);
  if (!parsed.success) return { error: "That couldn't be changed." };
  try {
    const supabase = await createClient();
    if (!(await editMessage(supabase, parsed.data.messageId, parsed.data.body))) return { error: "That couldn't be changed." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "household").body.error.message };
  }
  revalidatePath(`/chat/${parsed.data.threadId}`);
  return { ok: true };
}

export async function takeBackChatMessageAction(input: z.input<typeof messageSchema>): Promise<Result> {
  const parsed = messageSchema.safeParse(input);
  if (!parsed.success) return { error: "That couldn't be taken back." };
  try {
    const supabase = await createClient();
    if (!(await takeBackMessage(supabase, parsed.data.messageId))) return { error: "That couldn't be taken back." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "household").body.error.message };
  }
  revalidatePath(`/chat/${parsed.data.threadId}`);
  return { ok: true };
}

const addSchema = z.object({ threadId: z.uuid(), memberIds: z.array(z.uuid()).min(1).max(50) });

export async function addChatPeopleAction(input: z.input<typeof addSchema>): Promise<{ ok: true; added: number } | { error: string }> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { error: "Pick who to add." };
  let added: number;
  try {
    const supabase = await createClient();
    added = await addPeople(supabase, parsed.data.threadId, parsed.data.memberIds);
  } catch (thrown) {
    return { error: toErrorBody(thrown, "household").body.error.message };
  }
  revalidatePath(`/chat/${parsed.data.threadId}`);
  revalidatePath("/chat");
  return { ok: true, added };
}

export async function leaveChatAction(input: { threadId: string }): Promise<Result> {
  const threadId = z.uuid().safeParse(input.threadId);
  if (!threadId.success) return { error: "That chat could not be found." };
  try {
    const supabase = await createClient();
    await leaveChat(supabase, threadId.data);
  } catch (thrown) {
    return { error: toErrorBody(thrown, "household").body.error.message };
  }
  revalidatePath("/chat");
  return { ok: true };
}
