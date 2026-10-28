import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { validateScrapeUrl } from "./url-guard";

/**
 * The post-auth pages a household has WonderHome read from a connected portal
 * (story 08-033). Managing them is an Admin's act (RLS decides); every one is
 * validated **same-site as the portal** before it is stored, so a connection
 * can't be pointed at an unrelated or internal host (SSRF). Re-adding a page
 * that was turned off turns it back on rather than erroring.
 */

export type PortalScrapeKind = "homework" | "calendar" | "messages" | "results" | "generic";

export type PortalScrapeUrl = {
  id: string;
  integrationId: string;
  url: string;
  kind: PortalScrapeKind;
  childMemberId: string | null;
  enabled: boolean;
};

type Row = Record<string, unknown>;

const rowToScrapeUrl = (row: Row): PortalScrapeUrl => ({
  id: row.id as string,
  integrationId: row.integration_id as string,
  url: row.url as string,
  kind: row.kind as PortalScrapeKind,
  childMemberId: (row.child_member_id as string | null) ?? null,
  enabled: Boolean(row.enabled),
});

export async function listPortalScrapeUrls(supabase: SupabaseClient, householdId: string): Promise<PortalScrapeUrl[]> {
  const { data, error } = await supabase
    .from("portal_scrape_urls")
    .select("id, integration_id, url, kind, child_member_id, enabled")
    .eq("household_id", householdId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listPortalScrapeUrls failed: ${error.code ?? "unknown"}`);
  return ((data as Row[] | null) ?? []).map(rowToScrapeUrl);
}

/** Add (or re-enable) a page to read. `portalUrl` is the connection's login URL, used to enforce same-site. */
export async function addPortalScrapeUrl(
  supabase: SupabaseClient,
  input: { householdId: string; integrationId: string; portalUrl: string; url: string; kind: PortalScrapeKind; childMemberId?: string | null; createdBy: string },
): Promise<void> {
  const checked = validateScrapeUrl(input.url, input.portalUrl);
  if (!checked.ok) {
    throw ApiError.badRequest(
      checked.reason === "offsite"
        ? "That page is on a different site than the portal you connected."
        : checked.reason === "insecure"
          ? "A page address must start with https://."
          : checked.reason === "invalid_url"
            ? "That is not a web address."
            : "That page address is not allowed.",
    );
  }

  const row = {
    household_id: input.householdId,
    integration_id: input.integrationId,
    url: checked.url,
    kind: input.kind,
    child_member_id: input.childMemberId ?? null,
    created_by: input.createdBy,
  };
  const { error } = await supabase.from("portal_scrape_urls").insert(row);
  if (!error) return;
  if (error.code === "23505") {
    // Already tracked — turn it back on (and move it under this child, if given).
    const { error: updateError } = await supabase
      .from("portal_scrape_urls")
      .update({ enabled: true, kind: input.kind, child_member_id: input.childMemberId ?? null })
      .eq("integration_id", input.integrationId)
      .eq("url", checked.url);
    if (updateError) throw mapWriteError(updateError.code);
    return;
  }
  throw mapWriteError(error.code);
}

export async function setPortalScrapeUrlEnabled(
  supabase: SupabaseClient,
  input: { householdId: string; id: string; enabled: boolean },
): Promise<void> {
  const { error } = await supabase
    .from("portal_scrape_urls")
    .update({ enabled: input.enabled })
    .eq("household_id", input.householdId)
    .eq("id", input.id);
  if (error) throw mapWriteError(error.code);
}

export async function removePortalScrapeUrl(supabase: SupabaseClient, input: { householdId: string; id: string }): Promise<void> {
  const { error } = await supabase.from("portal_scrape_urls").delete().eq("household_id", input.householdId).eq("id", input.id);
  if (error) throw mapWriteError(error.code);
}

function mapWriteError(code?: string): Error {
  if (code === "42501") return ApiError.forbidden("Only an Admin can manage a portal's pages.");
  return new Error(`portal_scrape_urls write failed: ${code ?? "unknown"}`);
}

// --- Connection-keyed variants (Connections framework). Same table, keyed by
// connection_id instead of integration_id; an adult manages a connection's pages. ---

export type ConnectionScrapeUrl = {
  id: string;
  connectionId: string;
  url: string;
  kind: PortalScrapeKind;
  childMemberId: string | null;
  enabled: boolean;
};

export async function listConnectionScrapeUrls(supabase: SupabaseClient, connectionId: string): Promise<ConnectionScrapeUrl[]> {
  const { data, error } = await supabase
    .from("portal_scrape_urls")
    .select("id, connection_id, url, kind, child_member_id, enabled")
    .eq("connection_id", connectionId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listConnectionScrapeUrls failed: ${error.code ?? "unknown"}`);
  return ((data as Row[] | null) ?? []).map((row) => ({
    id: row.id as string,
    connectionId: row.connection_id as string,
    url: row.url as string,
    kind: row.kind as PortalScrapeKind,
    childMemberId: (row.child_member_id as string | null) ?? null,
    enabled: Boolean(row.enabled),
  }));
}

/** Add (or re-enable) a page to read for a connection. `connectionUrl` is the connection's login URL, for same-site. */
export async function addConnectionScrapeUrl(
  supabase: SupabaseClient,
  input: { householdId: string; connectionId: string; connectionUrl: string; url: string; kind: PortalScrapeKind; childMemberId?: string | null; createdBy: string },
): Promise<void> {
  const checked = validateScrapeUrl(input.url, input.connectionUrl);
  if (!checked.ok) {
    throw ApiError.badRequest(
      checked.reason === "offsite"
        ? "That page is on a different site than the connection."
        : checked.reason === "insecure"
          ? "A page address must start with https://."
          : checked.reason === "invalid_url"
            ? "That is not a web address."
            : "That page address is not allowed.",
    );
  }
  const row = {
    household_id: input.householdId,
    connection_id: input.connectionId,
    url: checked.url,
    kind: input.kind,
    child_member_id: input.childMemberId ?? null,
    created_by: input.createdBy,
  };
  const { error } = await supabase.from("portal_scrape_urls").insert(row);
  if (!error) return;
  if (error.code === "23505") {
    const { error: updateError } = await supabase
      .from("portal_scrape_urls")
      .update({ enabled: true, kind: input.kind, child_member_id: input.childMemberId ?? null })
      .eq("connection_id", input.connectionId)
      .eq("url", checked.url);
    if (updateError) throw mapWriteError(updateError.code);
    return;
  }
  throw mapWriteError(error.code);
}
