import type { SupabaseClient } from "@supabase/supabase-js";

import type { PortalBrowser } from "@wonderhome/core/portals/adapter";
import { portalCursorStore } from "@wonderhome/core/portals/cursor-repository";
import { fetchConnection, type ScrapeTarget } from "@wonderhome/core/portals/fetch-connection";
import { GenericAdapter } from "@wonderhome/core/portals/generic-adapter";
import { resolveAdapter } from "@wonderhome/core/portals/registry";
import { portalSessionStore, setPortalSessionState } from "@wonderhome/core/portals/session-repository";
import { readSchoolPortalCredentials } from "@wonderhome/core/school/portal-credentials";

import { placeholderExtractor } from "./extractor";
import { loggingFiler } from "./filer";

/**
 * Run one fetch job: read the connection's sign-in, resolve its adapter, and run
 * the governed `fetchConnection` with the real Playwright browser. Everything
 * sensitive is read with the service role (the admin client); the sign-in never
 * leaves the worker. Known providers register their adapter here; today only the
 * generic one is wired, so any portal uses it.
 */

export type JobOutcome = { state: "connected" | "reconnect_needed" | "no_credentials"; filed: number; reason?: string };

type Row = Record<string, unknown>;

export async function runFetchJob(input: {
  adminClient: SupabaseClient;
  browser: PortalBrowser;
  integrationId: string;
  householdId: string;
  log: (message: string) => void;
}): Promise<JobOutcome> {
  const { adminClient, browser, integrationId, householdId, log } = input;

  const creds = await readSchoolPortalCredentials(adminClient, integrationId);
  if (!creds) {
    await setPortalSessionState(adminClient, { householdId, integrationId, state: "reconnect_needed", reason: "login_failed" });
    return { state: "no_credentials", filed: 0, reason: "no stored sign-in" };
  }

  const { data: integ } = await adminClient.from("integrations").select("provider").eq("id", integrationId).maybeSingle();
  const providerId = ((integ as Row | null)?.provider as string | undefined) ?? null;

  const { data: targetRows, error: targetErr } = await adminClient
    .from("portal_scrape_urls")
    .select("url, kind, child_member_id")
    .eq("integration_id", integrationId)
    .eq("enabled", true)
    .order("created_at", { ascending: true });
  if (targetErr) throw new Error(`load scrape targets failed: ${targetErr.code ?? "unknown"}`);
  const targets: ScrapeTarget[] = ((targetRows as Row[] | null) ?? []).map((row) => ({
    url: row.url as string,
    kind: row.kind as string,
    childMemberId: (row.child_member_id as string | null) ?? null,
  }));

  const adapter = resolveAdapter({ portalUrl: creds.portalUrl, providerId, adapters: [GenericAdapter], fallback: GenericAdapter });

  const result = await fetchConnection({
    connectionId: integrationId,
    portalUrl: creds.portalUrl,
    browser,
    adapter,
    store: portalSessionStore(adminClient, { householdId, integrationId }),
    credentials: async () => ({ username: creds.username, password: creds.password }),
    targets,
    extractor: placeholderExtractor,
    filer: loggingFiler(log),
    cursors: portalCursorStore(adminClient, { householdId, integrationId }),
    onState: (state, reason) => setPortalSessionState(adminClient, { householdId, integrationId, state, reason: reason ?? null }),
  });

  if (!result.ok) {
    log(`[job] ${integrationId}: reconnect needed (${result.reason})`);
    return { state: "reconnect_needed", filed: 0, reason: result.reason };
  }
  const failures = result.targets.filter((t) => t.error).length;
  log(
    `[job] ${integrationId}: ${result.reAuthenticated ? "re-logged in" : "reused session"}; ` +
      `pages=${result.targets.length} (${failures} failed) filed=${result.filed}`,
  );
  return { state: "connected", filed: result.filed };
}
