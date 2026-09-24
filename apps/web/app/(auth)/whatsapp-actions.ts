"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auditChange } from "@wonderhome/core/api/audit";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { requireMembership } from "@wonderhome/core/identity/households";
import { whatsappConfigFromEnv } from "@wonderhome/core/notifications/whatsapp";
import { hitRateLimit, rateLimitMessage } from "@wonderhome/core/security/rate-limit";
import { recordWhatsAppEvents } from "@wonderhome/core/whatsapp/events";
import { connectMessage, createLinkRequest, whatsappBusinessNumber, whatsappChatLink } from "@wonderhome/core/whatsapp/linking";
import { disconnectWhatsApp, listWhatsAppLinks } from "@wonderhome/core/whatsapp/repository";

/**
 * Connecting WhatsApp, and disconnecting it (story 14-016).
 *
 * The member is always whoever is signed in — never a field on the form —
 * and only an adult gets a code. The code is shown to them once and kept
 * only as a hash; it links nothing until WhatsApp itself delivers it from
 * their phone. "I've sent it" never marks anyone connected: it only looks
 * again at whether the server has linked the number.
 */

export type WhatsAppConnectState = {
  error?: string;
  /** The code to send, and the ready-made WhatsApp link for it. Shown once. */
  code?: string;
  message?: string;
  chatLink?: string;
  expiresAt?: string;
  /** Looked again after "I've sent it" and nothing is linked yet. A link redirects instead. */
  status?: "waiting";
};

const householdSchema = z.object({ householdId: z.uuid() });

export async function startWhatsAppLinkAction(_previous: WhatsAppConnectState, formData: FormData): Promise<WhatsAppConnectState> {
  const parsed = householdSchema.safeParse({ householdId: formData.get("householdId") });
  if (!parsed.success) return { error: "That household could not be found." };
  const businessNumber = whatsappBusinessNumber();
  if (!whatsappConfigFromEnv() || !businessNumber) return { error: "WhatsApp isn't set up for WonderHome yet." };

  const supabase = await createClient();
  const membership = await requireMembership(supabase, parsed.data.householdId).catch(() => null);
  if (!membership) return { error: "That household could not be found." };
  if (membership.memberType !== "adult") return { error: "Only adults in the household can connect WhatsApp." };

  const admin = createAdminClient();
  if (!(await hitRateLimit(admin, "whatsapp.link", membership.memberId))) return { error: rateLimitMessage("whatsapp.link") };

  const { code, expiresAt } = await createLinkRequest(admin, { householdId: membership.household.id, memberId: membership.memberId });
  await recordWhatsAppEvents(admin, [{ kind: "connection_started", householdId: membership.household.id }]);
  await auditChange({ householdId: membership.household.id, actorMemberId: membership.memberId, eventType: "whatsapp.connect_requested", targetTable: "whatsapp_link_requests" });

  const message = connectMessage(code);
  return { code, message, chatLink: whatsappChatLink(businessNumber, message), expiresAt: expiresAt.toISOString() };
}

/** "I've sent the message": looks again, and only the server's own link says yes. */
export async function checkWhatsAppLinkAction(previous: WhatsAppConnectState, formData: FormData): Promise<WhatsAppConnectState> {
  const parsed = householdSchema.safeParse({ householdId: formData.get("householdId") });
  if (!parsed.success) return { ...previous, error: "That household could not be found." };
  const supabase = await createClient();
  const membership = await requireMembership(supabase, parsed.data.householdId).catch(() => null);
  if (!membership) return { ...previous, error: "That household could not be found." };

  const mine = (await listWhatsAppLinks(supabase, membership.household.id)).find((link) => link.memberId === membership.memberId);
  if (!mine) return { ...previous, error: undefined, status: "waiting" };
  revalidatePath("/household/members");
  revalidatePath("/home-send");
  // The page itself says so, from the server's record of the link.
  redirect("/settings/whatsapp?connected=1");
}

const disconnectSchema = z.object({ householdId: z.uuid(), identityId: z.uuid() });

export async function disconnectWhatsAppAction(_previous: { error?: string; done?: boolean }, formData: FormData): Promise<{ error?: string; done?: boolean }> {
  const parsed = disconnectSchema.safeParse({ householdId: formData.get("householdId"), identityId: formData.get("identityId") });
  if (!parsed.success) return { error: "That connection could not be found." };
  const supabase = await createClient();
  const membership = await requireMembership(supabase, parsed.data.householdId).catch(() => null);
  if (!membership) return { error: "That connection could not be found." };

  // The database decides who may: the member whose number it is, or an admin.
  const ended = await disconnectWhatsApp(supabase, parsed.data.identityId);
  if (!ended) return { error: "Only the person whose number it is, or an admin, can disconnect it." };

  await recordWhatsAppEvents(createAdminClient(), [{ kind: "disconnected", householdId: membership.household.id }]);
  await auditChange({ householdId: membership.household.id, actorMemberId: membership.memberId, eventType: "whatsapp.disconnected", targetTable: "whatsapp_identities", targetId: parsed.data.identityId });
  revalidatePath("/settings/whatsapp");
  revalidatePath("/household/members");
  revalidatePath("/home-send");
  return { done: true };
}
