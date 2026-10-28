"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { requireMembership } from "@wonderhome/core/identity/households";
import { createConnection, deleteConnection, updateConnection } from "@wonderhome/core/connections/repository";
import { getConnectorType } from "@wonderhome/core/connectors/registry";

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
    revalidatePath("/household/connections");
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
    revalidatePath("/household/connections");
    return { notice: "Connection updated." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "generic").body.error.message };
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
    revalidatePath("/household/connections");
    return { notice: "Connection removed." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "generic").body.error.message };
  }
}
