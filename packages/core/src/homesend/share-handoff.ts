import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The PWA Web Share Target's signed-out bridge (Phase 4).
 *
 * A share can land before anyone has signed in on that device, so
 * `POST /api/v1/intake/share` has no household to write into yet. This is
 * where the shared content waits: staged with the admin client (the only
 * client that can reach `homesend_share_handoffs` at all — see the
 * migration), keyed by an unguessable token carried through
 * `/sign-in?next=...`, consumed exactly once sign-in resolves a real
 * household. Always called with the admin client — there is no session to
 * scope a request-bound client to yet.
 */

export type ShareHandoffContent =
  | { kind: "text"; rawText: string }
  | { kind: "file"; fileBytes: Buffer; fileContentType: string };

function generateHandoffToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Stages a share's content and returns the token that unlocks it. */
export async function createShareHandoff(admin: SupabaseClient, content: ShareHandoffContent): Promise<string> {
  const token = generateHandoffToken();

  const row: Record<string, string | null> =
    content.kind === "text"
      ? { token, kind: "text", raw_text: content.rawText, file_bytes: null, file_content_type: null }
      : { token, kind: "file", raw_text: null, file_bytes: `\\x${content.fileBytes.toString("hex")}`, file_content_type: content.fileContentType };

  const { error } = await admin.from("homesend_share_handoffs").insert(row);
  if (error) throw new Error(`createShareHandoff failed: ${error.code ?? "unknown"}`);

  return token;
}

/**
 * Reads and deletes a handoff in one call — a token is single-use, whether
 * it resolves to real content or has already expired. `null` covers both
 * "no such token" and "expired", deliberately indistinguishable: neither
 * tells the caller anything worth knowing beyond "nothing to resume."
 */
export async function consumeShareHandoff(admin: SupabaseClient, token: string): Promise<ShareHandoffContent | null> {
  const { data, error } = await admin
    .from("homesend_share_handoffs")
    .select("id, kind, raw_text, file_bytes, file_content_type, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(`consumeShareHandoff failed: ${error.code ?? "unknown"}`);
  if (!data) return null;

  await admin.from("homesend_share_handoffs").delete().eq("id", data.id as string);

  if (new Date(data.expires_at as string).getTime() < Date.now()) return null;

  if (data.kind === "text") return { kind: "text", rawText: data.raw_text as string };

  const hex = (data.file_bytes as string).replace(/^\\x/, "");
  return { kind: "file", fileBytes: Buffer.from(hex, "hex"), fileContentType: data.file_content_type as string };
}

/** Opportunistic cleanup — cheap enough to run on every share POST rather than needing a cron. */
export async function pruneExpiredShareHandoffs(admin: SupabaseClient): Promise<void> {
  await admin.from("homesend_share_handoffs").delete().lt("expires_at", new Date().toISOString());
}
