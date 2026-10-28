import type { SupabaseClient } from "@supabase/supabase-js";

import type { PortalCursorStore } from "./fetch-connection";

/**
 * The idempotency cursor for a scheduled portal fetch (story 08-033).
 *
 * `portal_fetch_cursors` holds the hashes of items already filed to HomeSend, so
 * a twice-daily run never re-files the same homework or message. It is the
 * worker's alone — no browser-reachable role can touch it — so every function
 * takes the admin (service-role) client. Pair with `selectNew` from `dedupe.ts`.
 */

const DEFAULT_LIMIT = 5000;

/** The hashes already seen for one (connection, page), most recent first, bounded. */
export async function loadSeenHashes(
  adminClient: SupabaseClient,
  input: { integrationId: string; scrapeUrl: string; limit?: number },
): Promise<Set<string>> {
  const { data, error } = await adminClient
    .from("portal_fetch_cursors")
    .select("item_hash")
    .eq("integration_id", input.integrationId)
    .eq("scrape_url", input.scrapeUrl)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? DEFAULT_LIMIT);
  if (error) throw new Error(`loadSeenHashes failed: ${error.code ?? "unknown"}`);
  return new Set(((data as { item_hash: string }[] | null) ?? []).map((row) => row.item_hash));
}

/** Remember hashes just filed, so the next run skips them. Duplicates are ignored. */
export async function recordSeen(
  adminClient: SupabaseClient,
  input: { householdId: string; integrationId: string; scrapeUrl: string; hashes: readonly string[] },
): Promise<void> {
  if (input.hashes.length === 0) return;
  const rows = input.hashes.map((item_hash) => ({
    household_id: input.householdId,
    integration_id: input.integrationId,
    scrape_url: input.scrapeUrl,
    item_hash,
  }));
  const { error } = await adminClient
    .from("portal_fetch_cursors")
    .upsert(rows, { onConflict: "integration_id,scrape_url,item_hash", ignoreDuplicates: true });
  if (error) throw new Error(`recordSeen failed: ${error.code ?? "unknown"}`);
}

/** The `PortalCursorStore` the fetch orchestrator consumes, backed by `portal_fetch_cursors`. */
export function portalCursorStore(adminClient: SupabaseClient, input: { householdId: string; integrationId: string }): PortalCursorStore {
  return {
    loadSeen: (scrapeUrl) => loadSeenHashes(adminClient, { integrationId: input.integrationId, scrapeUrl }),
    recordSeen: (scrapeUrl, hashes) =>
      recordSeen(adminClient, { householdId: input.householdId, integrationId: input.integrationId, scrapeUrl, hashes: [...hashes] }),
  };
}

// --- Connection-keyed cursor store (Connections framework). ---

async function loadConnectionSeen(adminClient: SupabaseClient, input: { connectionId: string; scrapeUrl: string; limit?: number }): Promise<Set<string>> {
  const { data, error } = await adminClient
    .from("portal_fetch_cursors")
    .select("item_hash")
    .eq("connection_id", input.connectionId)
    .eq("scrape_url", input.scrapeUrl)
    .order("created_at", { ascending: false })
    .limit(input.limit ?? DEFAULT_LIMIT);
  if (error) throw new Error(`loadConnectionSeen failed: ${error.code ?? "unknown"}`);
  return new Set(((data as { item_hash: string }[] | null) ?? []).map((row) => row.item_hash));
}

async function recordConnectionSeen(adminClient: SupabaseClient, input: { householdId: string; connectionId: string; scrapeUrl: string; hashes: readonly string[] }): Promise<void> {
  if (input.hashes.length === 0) return;
  const rows = input.hashes.map((item_hash) => ({ household_id: input.householdId, connection_id: input.connectionId, scrape_url: input.scrapeUrl, item_hash }));
  const { error } = await adminClient.from("portal_fetch_cursors").upsert(rows, { onConflict: "connection_id,scrape_url,item_hash", ignoreDuplicates: true });
  if (error) throw new Error(`recordConnectionSeen failed: ${error.code ?? "unknown"}`);
}

export function connectionCursorStore(adminClient: SupabaseClient, input: { householdId: string; connectionId: string }): PortalCursorStore {
  return {
    loadSeen: (scrapeUrl) => loadConnectionSeen(adminClient, { connectionId: input.connectionId, scrapeUrl }),
    recordSeen: (scrapeUrl, hashes) => recordConnectionSeen(adminClient, { householdId: input.householdId, connectionId: input.connectionId, scrapeUrl, hashes: [...hashes] }),
  };
}
