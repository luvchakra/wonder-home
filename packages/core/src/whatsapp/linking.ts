import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Linking a WhatsApp number to one adult member (the WhatsApp HomeSend spec
 * §11). A number becomes a member's only when:
 *   1. the member, signed in, asks for a code — a single-use code, valid
 *      for fifteen minutes, stored only as its SHA-256 hash; and
 *   2. WhatsApp itself then delivers "CONNECT <code>" from that number, in a
 *      webhook delivery whose signature verified.
 * A number that merely matches something typed somewhere links nothing, and
 * the member and household are only ever the ones the code was issued to.
 */

/** No 0/O, 1/I/L: a code a person can read off a screen and type. */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CONNECT_CODE_LENGTH = 10;
export const LINK_TTL_MINUTES = 15;

export function generateConnectCode(random: (bytes: Uint8Array) => Uint8Array = (bytes) => crypto.getRandomValues(bytes)): string {
  // Rejection sampling keeps every character equally likely.
  const limit = 256 - (256 % CODE_ALPHABET.length);
  let code = "";
  while (code.length < CONNECT_CODE_LENGTH) {
    for (const byte of random(new Uint8Array(CONNECT_CODE_LENGTH * 2))) {
      if (byte >= limit) continue;
      code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
      if (code.length === CONNECT_CODE_LENGTH) break;
    }
  }
  return code;
}

/** The message the member sends from their phone. */
export function connectMessage(code: string): string {
  return `CONNECT ${code}`;
}

/** The code in a "CONNECT <code>" message, or null. The whole message must be just that. */
export function readConnectCode(text: string | null): string | null {
  const match = /^\s*connect\s+([a-z0-9]{10})\s*[.!]?\s*$/i.exec(text ?? "");
  if (!match) return null;
  const code = match[1]!.toUpperCase();
  return [...code].every((character) => CODE_ALPHABET.includes(character)) ? code : null;
}

export async function hashConnectCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code.trim().toUpperCase()));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Issues a code for a member. Server only, with the admin client, after the
 * caller has checked that the signed-in person is this member and an adult
 * (the database checks the adult part again).
 */
export async function createLinkRequest(
  admin: SupabaseClient,
  input: { householdId: string; memberId: string; now?: Date },
): Promise<{ code: string; expiresAt: Date }> {
  const now = input.now ?? new Date();
  const code = generateConnectCode();
  const expiresAt = new Date(now.getTime() + LINK_TTL_MINUTES * 60_000);
  const { error } = await admin.from("whatsapp_link_requests").insert({
    household_id: input.householdId,
    member_id: input.memberId,
    token_hash: await hashConnectCode(code),
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw new Error(`createLinkRequest failed: ${error.code ?? "unknown"}`);
  return { code, expiresAt };
}

export const LINK_OUTCOMES = ["linked", "already_linked", "invalid", "expired", "in_use"] as const;
export type LinkOutcome = (typeof LINK_OUTCOMES)[number];

export type LinkResult = { outcome: LinkOutcome; householdId: string | null; memberId: string | null; identityId: string | null };

/** Completes a link from a verified inbound "CONNECT <code>", atomically in the database. */
export async function completeLink(
  admin: SupabaseClient,
  input: { code: string; waUserId: string; phone: string; displayName: string | null },
): Promise<LinkResult> {
  const { data, error } = await admin.rpc("complete_whatsapp_link", {
    p_token_hash: await hashConnectCode(input.code),
    p_wa_user_id: input.waUserId,
    p_phone_number: input.phone,
    p_display_name: input.displayName ?? "",
  });
  if (error) throw new Error(`complete_whatsapp_link failed: ${error.code ?? "unknown"}`);
  const row = (Array.isArray(data) ? data[0] : data) as { outcome?: string; household_id?: string | null; member_id?: string | null; identity_id?: string | null } | undefined;
  const outcome = (LINK_OUTCOMES as readonly string[]).includes(row?.outcome ?? "") ? (row!.outcome as LinkOutcome) : "invalid";
  return { outcome, householdId: row?.household_id ?? null, memberId: row?.member_id ?? null, identityId: row?.identity_id ?? null };
}

/** What WonderHome says back on WhatsApp after a CONNECT message. Nothing here names a household or a person. */
export const LINK_REPLIES: Record<LinkOutcome, string> = {
  linked:
    "WhatsApp connected ✓ Send or forward messages, photos, documents and voice notes here, and WonderHome will put them in your household's HomeSend for you to check. You can disconnect any time in WonderHome.",
  already_linked: "This number is already connected to your WonderHome account ✓",
  invalid: "That code isn't one WonderHome recognises. In WonderHome, choose Connect WhatsApp and send the new code it shows.",
  expired: "That code has expired. In WonderHome, choose Connect WhatsApp again for a new one.",
  in_use: "This WhatsApp number is already connected to another WonderHome account. Disconnect it there first, then try again.",
};

/** What an unlinked number is told — the same whoever it is, so nothing about any household leaks. */
export const UNKNOWN_SENDER_REPLY =
  "This number isn't connected to WonderHome yet. In WonderHome, open Settings, choose Connect WhatsApp, and send the code it shows from this phone.";

export type WhatsAppIdentity = { id: string; householdId: string; memberId: string; phone: string };

/** The live link for a sender, if there is one. The only way inbound WhatsApp finds a household. */
export async function findActiveIdentity(admin: SupabaseClient, waUserId: string): Promise<WhatsAppIdentity | null> {
  const { data, error } = await admin
    .from("whatsapp_identities")
    .select("id, household_id, member_id, phone_number")
    .eq("wa_user_id", waUserId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(`findActiveIdentity failed: ${error.code ?? "unknown"}`);
  if (!data) return null;
  const row = data as { id: string; household_id: string; member_id: string; phone_number: string };
  return { id: row.id, householdId: row.household_id, memberId: row.member_id, phone: row.phone_number };
}

/** WonderHome's official WhatsApp number, as the deployment configured it, or null. */
export function whatsappBusinessNumber(env: Record<string, string | undefined> = process.env): string | null {
  const number = env.WHATSAPP_BUSINESS_NUMBER?.replace(/[\s()-]/g, "");
  return number && /^\+[1-9]\d{7,14}$/.test(number) ? number : null;
}

/** Opens WhatsApp on the phone, addressed to WonderHome, with the message ready to send. */
export function whatsappChatLink(businessNumber: string, text: string): string {
  return `https://wa.me/${businessNumber.replace(/^\+/, "")}?text=${encodeURIComponent(text)}`;
}

/** "+91 98765 43210" for showing a number; the stored form stays E.164. */
export function formatWhatsAppNumber(e164: string): string {
  const india = /^\+91(\d{5})(\d{5})$/.exec(e164);
  if (india) return `+91 ${india[1]} ${india[2]}`;
  return e164;
}
