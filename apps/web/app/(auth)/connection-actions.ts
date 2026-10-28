"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { requireMembership } from "@wonderhome/core/identity/households";
import { createConnection, deleteConnection, getConnection, readConnectionSecrets, updateConnection } from "@wonderhome/core/connections/repository";
import { getConnectorType } from "@wonderhome/core/connectors/registry";
import { REST_METHODS, testRestRequest, type RestMethod, type RestTestResult } from "@wonderhome/core/connectors/rest-tester";
import { addConnectionScrapeUrl, removePortalScrapeUrl, setPortalScrapeUrlEnabled, type PortalScrapeKind } from "@wonderhome/core/portals/scrape-url-repository";
import { latestConnectionFetchJob, type PortalFetchJobStatus } from "@wonderhome/core/portals/job-repository";

import type { ActionState } from "./actions";

/**
 * Creating and changing a household's connections (the Connections framework).
 * Any adult member may do it (the RLS enforces it); the form carries the
 * parameters the chosen connector type declares, and the repository splits them
 * into the connection row and the secret store.
 */

const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
};

const PARAMS_MISSING = "Please fill in the details above.";

/** Collect the chosen connector type's declared parameters from the form. */
function collectParams(connectorType: string, formData: FormData): { params: Record<string, string>; missing: boolean } {
  const type = getConnectorType(connectorType);
  const params: Record<string, string> = {};
  if (!type || type.creation.mode !== "params") return { params, missing: false };
  let missing = false;
  for (const p of type.creation.params) {
    const value = field(formData, `param.${p.key}`) ?? "";
    if (value !== "") params[p.key] = value;
    else if (p.required) missing = true; // a blank secret on update is handled by the caller
  }
  return { params, missing };
}

const createSchema = z.object({
  householdId: z.uuid(),
  name: z.string().trim().min(1, { error: "Give the connection a name." }).max(80),
  connectorType: z.string().trim().min(1),
});

export async function createConnectionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = createSchema.safeParse({
    householdId: field(formData, "householdId"),
    name: field(formData, "name"),
    connectorType: field(formData, "connectorType"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  const type = getConnectorType(parsed.data.connectorType);
  if (!type) return { error: "That connection type isn't available." };
  if (type.creation.mode !== "params") return { error: "This connection type is set up a different way." };

  const { params, missing } = collectParams(parsed.data.connectorType, formData);
  if (missing) return { error: PARAMS_MISSING };

  try {
    const supabase = await createClient();
    const actor = await requireMembership(supabase, parsed.data.householdId);
    await createConnection(supabase, {
      householdId: parsed.data.householdId,
      name: parsed.data.name,
      connectorType: parsed.data.connectorType,
      params,
      actorMemberId: actor.memberId,
    });
    revalidatePath("/settings/connections");
    return { notice: "Connection created." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "generic").body.error.message };
  }
}

const updateSchema = z.object({
  householdId: z.uuid(),
  id: z.uuid(),
  connectorType: z.string().trim().min(1),
  name: z.string().trim().min(1, { error: "Give the connection a name." }).max(80),
});

export async function updateConnectionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = updateSchema.safeParse({
    householdId: field(formData, "householdId"),
    id: field(formData, "id"),
    connectorType: field(formData, "connectorType"),
    name: field(formData, "name"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  // On edit a blank secret keeps the stored one, so a missing required secret is fine.
  const { params } = collectParams(parsed.data.connectorType, formData);

  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    await updateConnection(supabase, {
      householdId: parsed.data.householdId,
      id: parsed.data.id,
      connectorType: parsed.data.connectorType,
      name: parsed.data.name,
      params,
    });
    revalidatePath("/settings/connections");
    return { notice: "Connection updated." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "generic").body.error.message };
  }
}

// --- Fetch / test / pages-to-read for a browser-automation connection ---

const connFetchSchema = z.object({ householdId: z.uuid(), connectionId: z.uuid() });

/** Test a connection's sign-in (and read its pages): enqueue a fetch for the worker. */
export async function testConnectionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = connFetchSchema.safeParse({ householdId: field(formData, "householdId"), connectionId: field(formData, "connectionId") });
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    const { error } = await supabase.rpc("enqueue_connection_fetch_job", { p_connection_id: parsed.data.connectionId });
    if (error) return { error: "Couldn’t start a check just now. Please try again." };
    revalidatePath("/settings/connections");
    return { notice: "Checking the connection… the result shows here once the worker signs in." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "connections").body.error.message };
  }
}

/** The outcome of the most recent fetch for a connection, so the page can poll after Test/Fetch. */
export async function connectionFetchStatusAction(input: { householdId: string; connectionId: string }): Promise<{ status: PortalFetchJobStatus | "none"; reason: string | null }> {
  const parsed = connFetchSchema.safeParse(input);
  if (!parsed.success) return { status: "none", reason: null };
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    const job = await latestConnectionFetchJob(supabase, parsed.data.householdId, parsed.data.connectionId);
    return { status: job?.status ?? "none", reason: job?.reason ?? null };
  } catch {
    return { status: "none", reason: null };
  }
}

// --- REST connection: the request/response tester ---

const restTestSchema = z.object({
  householdId: z.uuid(),
  connectionId: z.uuid(),
  method: z.enum(REST_METHODS),
  path: z.string().trim().max(2048),
  headersText: z.string().max(4096).optional(),
  body: z.string().max(64 * 1024).optional(),
});

/** Parse a textarea of "Name: value" lines into headers (blank and malformed lines ignored). */
function parseHeaderLines(text: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!text) return headers;
  for (const line of text.split("\n")) {
    const at = line.indexOf(":");
    if (at <= 0) continue;
    const name = line.slice(0, at).trim();
    const value = line.slice(at + 1).trim();
    if (name) headers[name] = value;
  }
  return headers;
}

/**
 * Send one test request for a REST connection and return the response to inspect.
 * An adult only — the stored auth header is read with the service role and
 * attached server-side (never to the browser); the target is gated same-site.
 */
export async function testRestRequestAction(input: {
  householdId: string;
  connectionId: string;
  method: string;
  path: string;
  headersText?: string;
  body?: string;
}): Promise<RestTestResult> {
  const parsed = restTestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the request above." };
  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    if (membership.memberType !== "adult") return { ok: false, error: "Only an adult can test a connection." };

    const connection = await getConnection(supabase, parsed.data.householdId, parsed.data.connectionId);
    if (!connection || connection.connectorType !== "rest") return { ok: false, error: "That isn’t a REST connection." };
    const baseUrl = connection.params.baseUrl;
    if (!baseUrl) return { ok: false, error: "This connection has no base address. Edit it first." };

    const secrets = await readConnectionSecrets(createAdminClient(), parsed.data.connectionId);
    return await testRestRequest({
      baseUrl,
      authHeader: connection.params.authHeader ?? null,
      authValue: secrets?.authValue ?? null,
      method: parsed.data.method as RestMethod,
      path: parsed.data.path,
      headers: parseHeaderLines(parsed.data.headersText),
      body: parsed.data.body ?? null,
    });
  } catch (thrown) {
    return { ok: false, error: toErrorBody(thrown, "connections").body.error.message };
  }
}

const PORTAL_SCRAPE_KINDS = ["homework", "calendar", "messages", "results", "generic"] as const;
const scrapeSchema = z.object({
  householdId: z.uuid(),
  connectionId: z.uuid(),
  url: z.string().trim().min(1, { error: "Enter the page's web address." }).max(2048),
  kind: z.enum(PORTAL_SCRAPE_KINDS).optional(),
  childMemberId: z.union([z.uuid(), z.literal("")]).optional(),
});

/** Add a post-auth page for the worker to read; validated same-site against the connection's URL (server-side). */
export async function addConnectionScrapeUrlAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = scrapeSchema.safeParse({
    householdId: field(formData, "householdId"),
    connectionId: field(formData, "connectionId"),
    url: field(formData, "url"),
    kind: field(formData, "kind"),
    childMemberId: field(formData, "childMemberId"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  try {
    const supabase = await createClient();
    const actor = await requireMembership(supabase, parsed.data.householdId);
    const connection = await getConnection(supabase, parsed.data.householdId, parsed.data.connectionId);
    const connectionUrl = connection?.params.url;
    if (!connectionUrl) return { error: "That connection has no web address." };
    await addConnectionScrapeUrl(supabase, {
      householdId: parsed.data.householdId,
      connectionId: parsed.data.connectionId,
      connectionUrl,
      url: parsed.data.url,
      kind: (parsed.data.kind ?? "generic") as PortalScrapeKind,
      childMemberId: parsed.data.childMemberId || null,
      createdBy: actor.memberId,
    });
    revalidatePath("/settings/connections");
    return { notice: "Page added." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "connections").body.error.message };
  }
}

const scrapeIdSchema = z.object({ householdId: z.uuid(), id: z.uuid() });

export async function removeConnectionScrapeUrlAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = scrapeIdSchema.safeParse({ householdId: field(formData, "householdId"), id: field(formData, "id") });
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    await removePortalScrapeUrl(supabase, { householdId: parsed.data.householdId, id: parsed.data.id });
    revalidatePath("/settings/connections");
    return { notice: "Page removed." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "connections").body.error.message };
  }
}

const scrapeEnabledSchema = z.object({ householdId: z.uuid(), id: z.uuid(), enabled: z.enum(["true", "false"]) });

export async function setConnectionScrapeUrlEnabledAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = scrapeEnabledSchema.safeParse({ householdId: field(formData, "householdId"), id: field(formData, "id"), enabled: field(formData, "enabled") });
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    await setPortalScrapeUrlEnabled(supabase, { householdId: parsed.data.householdId, id: parsed.data.id, enabled: parsed.data.enabled === "true" });
    revalidatePath("/settings/connections");
    return { notice: "Saved." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "connections").body.error.message };
  }
}

const deleteSchema = z.object({ householdId: z.uuid(), id: z.uuid() });

export async function deleteConnectionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = deleteSchema.safeParse({ householdId: field(formData, "householdId"), id: field(formData, "id") });
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    await deleteConnection(supabase, parsed.data.householdId, parsed.data.id);
    revalidatePath("/settings/connections");
    return { notice: "Connection removed." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "generic").body.error.message };
  }
}
