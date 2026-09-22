import type { SupabaseClient } from "@supabase/supabase-js";

import { SHARE_HANDOFF_RATE_LIMIT } from "./rate-limit";

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

/**
 * Stages a share's content and returns the token that unlocks it.
 *
 * `ipHash` is the sha256 of the caller's IP (`rate-limit.ts`'s
 * `hashClientIp`), never the address itself, or `null` when the request
 * carried no identifiable IP at all — stored purely so
 * `countRecentShareHandoffs` can throttle a single caller, not read back
 * for any other purpose.
 */
export async function createShareHandoff(
  admin: SupabaseClient,
  content: ShareHandoffContent,
  ipHash: string | null = null,
): Promise<string> {
  const token = generateHandoffToken();

  const row: Record<string, string | null> =
    content.kind === "text"
      ? { token, kind: "text", raw_text: content.rawText, file_bytes: null, file_content_type: null, ip_hash: ipHash }
      : {
          token,
          kind: "file",
          raw_text: null,
          file_bytes: `\\x${content.fileBytes.toString("hex")}`,
          file_content_type: content.fileContentType,
          ip_hash: ipHash,
        };

  const { error } = await admin.from("homesend_share_handoffs").insert(row);
  if (error) throw new Error(`createShareHandoff failed: ${error.code ?? "unknown"}`);

  return token;
}

/**
 * How many handoffs this IP hash has staged within the rate-limit window —
 * the count `rate-limit.ts`'s `mayCreateShareHandoff` decides against.
 * Counts every handoff regardless of whether it has since expired or been
 * consumed: the rate limit is about request volume from one caller, not
 * about what became of the rows afterward.
 */
export async function countRecentShareHandoffs(admin: SupabaseClient, ipHash: string, now: Date = new Date()): Promise<number> {
  const since = new Date(now.getTime() - SHARE_HANDOFF_RATE_LIMIT.windowMinutes * 60_000).toISOString();
  const { count, error } = await admin
    .from("homesend_share_handoffs")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", since);
  if (error) throw new Error(`countRecentShareHandoffs failed: ${error.code ?? "unknown"}`);
  return count ?? 0;
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

/**
 * Deletes every handoff past its 30-minute window, returning how many.
 *
 * Called two ways: opportunistically on every share POST (cheap enough not
 * to need a cron of its own for the common case), and again from
 * `/platform/retention`'s real sweep — a household that never shares
 * signed-out again would otherwise leave its one expired row behind
 * forever, and "a policy nothing applies is a promise" applies here too,
 * even though this table's TTL is minutes, not the day-scale schedule
 * `privacy/retention.ts` publishes (nobody has an account yet when a
 * handoff is staged, so it is not "their" data in the Privacy Centre's
 * sense — it is either consumed within minutes or it never was).
 */
export async function pruneExpiredShareHandoffs(admin: SupabaseClient): Promise<number> {
  const { data, error } = await admin
    .from("homesend_share_handoffs")
    .delete()
    .lt("expires_at", new Date().toISOString())
    .select("id");
  if (error) throw new Error(`pruneExpiredShareHandoffs failed: ${error.code ?? "unknown"}`);
  return (data ?? []).length;
}
