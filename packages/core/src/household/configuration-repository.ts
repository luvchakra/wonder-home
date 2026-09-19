import type { SupabaseClient } from "@supabase/supabase-js";

import { recordAuditEvent, type AuditEventType } from "../api/audit";
import { ApiError } from "../api/errors";
import { createAdminClient } from "../db/admin";
import { listMembers } from "../identity/households";
import type { AutonomyMode } from "./autonomy";
import type { ResolvedChange } from "./configuration-intent";
import {
  canDependOn,
  detectConflicts,
  downstreamOf,
  nextPolicyVersion,
  validatePlaybookItem,
  validateResponsibility,
  type ConfigMember,
  type ConfigurationConflict,
  type PlaybookInput,
  type PolicyCategory,
  type ResponsibilityInput,
} from "./configuration";

/**
 * Reading and writing the household's operating model (story 02-001).
 *
 * Two rules run through every write here.
 *
 * A policy is never edited in place. A change deactivates the version in
 * force and inserts the next one, so what a household had agreed to when a
 * decision was taken stays knowable afterwards. That is the entire reason
 * the table carries a version column.
 *
 * Every change is audited. Configuration is the thing that decides what
 * WonderHome may do on its own, so who changed it and when is exactly the
 * trail somebody will want later. The audit write goes through the admin
 * client because `audit_events` has no INSERT policy — a household cannot
 * write its own trail, which is what makes the trail worth reading.
 */

type Row = Record<string, unknown>;

export type SavedChange = {
  id: string;
  /** What this change means for the household, in their own terms. */
  downstream: string[];
};

export async function saveResponsibility(
  supabase: SupabaseClient,
  input: {
    householdId: string;
    actorMemberId: string;
    members: readonly ConfigMember[];
    responsibility: ResponsibilityInput;
  },
): Promise<SavedChange> {
  const validation = validateResponsibility(input.responsibility, input.members);
  if (!validation.ok) {
    throw ApiError.badRequest(validation.problems[0]!.message, { problems: validation.problems });
  }

  const { responsibility } = input;
  const { data, error } = await supabase
    .from("responsibilities")
    .upsert(
      {
        household_id: input.householdId,
        outcome_key: responsibility.outcomeKey,
        primary_member_id: responsibility.primaryMemberId,
        backup_member_id: responsibility.backupMemberId,
        ai_mode: responsibility.aiMode,
        priority: responsibility.priority,
      },
      { onConflict: "household_id,outcome_key" },
    )
    .select("id")
    .single();

  if (error) throw writeFailure("responsibility", error);

  const id = (data as Row).id as string;
  await audit(input.householdId, input.actorMemberId, "responsibility.updated", "responsibilities", id, {
    outcomeKey: responsibility.outcomeKey,
    aiMode: responsibility.aiMode,
    owned: responsibility.primaryMemberId !== null,
  });

  return {
    id,
    downstream: downstreamOf({
      kind: "responsibility",
      outcomeKey: responsibility.outcomeKey,
      aiMode: responsibility.aiMode,
      owned: responsibility.primaryMemberId !== null,
    }),
  };
}

export async function savePlaybookItem(
  supabase: SupabaseClient,
  input: {
    householdId: string;
    actorMemberId: string;
    item: PlaybookInput;
    /** An outcome this one waits for, by key. */
    dependsOnKey?: string | null;
  },
): Promise<SavedChange> {
  const validation = validatePlaybookItem(input.item);
  if (!validation.ok) {
    throw ApiError.badRequest(validation.problems[0]!.message, { problems: validation.problems });
  }

  const { item } = input;
  const { data, error } = await supabase
    .from("playbook_items")
    .upsert(
      {
        household_id: input.householdId,
        outcome_key: item.outcomeKey,
        name: item.name.trim(),
        outcome_definition: item.outcomeDefinition.trim(),
        operating_window: item.operatingWindow ?? {},
        escalation: item.escalateAfterHours ? { afterHours: item.escalateAfterHours } : {},
      },
      { onConflict: "household_id,outcome_key" },
    )
    .select("id")
    .single();

  if (error) throw writeFailure("playbook item", error);

  const id = (data as Row).id as string;
  const downstream = downstreamOf({ kind: "playbook", name: item.name, window: item.operatingWindow });

  if (input.dependsOnKey) {
    const waitsFor = await linkDependency(supabase, {
      householdId: input.householdId,
      itemId: id,
      itemKey: item.outcomeKey,
      dependsOnKey: input.dependsOnKey,
    });
    downstream.push(waitsFor);
  }

  await audit(input.householdId, input.actorMemberId, "playbook.updated", "playbook_items", id, {
    outcomeKey: item.outcomeKey,
    dependsOn: input.dependsOnKey ?? null,
  });

  return { id, downstream };
}

/**
 * Records that one outcome waits for another.
 *
 * The cycle check runs against the graph as it stands, because two outcomes
 * waiting for each other would both wait forever and neither would ever be
 * planned.
 */
async function linkDependency(
  supabase: SupabaseClient,
  input: { householdId: string; itemId: string; itemKey: string; dependsOnKey: string },
): Promise<string> {
  const { data: items, error: itemsError } = await supabase
    .from("playbook_items")
    .select("id, outcome_key")
    .eq("household_id", input.householdId);

  if (itemsError) throw writeFailure("playbook item", itemsError);

  const rows = (items as Row[] | null) ?? [];
  const target = rows.find((row) => row.outcome_key === input.dependsOnKey);
  if (!target) throw ApiError.badRequest("That outcome is not in this household's playbook.");

  const keyById = new Map(rows.map((row) => [row.id as string, row.outcome_key as string]));
  const { data: edges, error: edgesError } = await supabase
    .from("playbook_dependencies")
    .select("playbook_item_id, depends_on_item_id")
    .eq("household_id", input.householdId);

  if (edgesError) throw writeFailure("playbook item", edgesError);

  const existing = ((edges as Row[] | null) ?? []).flatMap((row) => {
    const itemKey = keyById.get(row.playbook_item_id as string);
    const dependsOnKey = keyById.get(row.depends_on_item_id as string);
    return itemKey && dependsOnKey ? [{ itemKey, dependsOnKey }] : [];
  });

  const check = canDependOn(input.itemKey, input.dependsOnKey, existing);
  if (!check.ok) throw ApiError.badRequest(check.problems[0]!.message);

  const { error } = await supabase.from("playbook_dependencies").upsert(
    {
      household_id: input.householdId,
      playbook_item_id: input.itemId,
      depends_on_item_id: target.id as string,
    },
    { onConflict: "playbook_item_id,depends_on_item_id" },
  );

  if (error) throw writeFailure("playbook item", error);

  return `Nothing here is planned until "${input.dependsOnKey}" is on track first.`;
}

/** The playbook's outcomes, for a form that offers them as dependencies. */
export async function listPlaybookOutcomes(
  supabase: SupabaseClient,
  householdId: string,
): Promise<{ key: string; name: string }[]> {
  const { data, error } = await supabase
    .from("playbook_items")
    .select("outcome_key, name")
    .eq("household_id", householdId)
    .eq("active", true)
    .order("name");

  if (error) throw new Error(`listPlaybookOutcomes failed: ${error.code ?? "unknown"}`);

  return ((data as Row[] | null) ?? []).map((row) => ({
    key: row.outcome_key as string,
    name: row.name as string,
  }));
}

/**
 * Puts a new version of a policy in force (02-001, 02-004).
 *
 * The previous version is deactivated rather than changed, and a partial
 * unique index in the database allows exactly one active version per name —
 * so "which rule was in force" always has one answer, and "which rules have
 * ever been in force" still has all of them.
 */
export async function savePolicy(
  supabase: SupabaseClient,
  input: {
    householdId: string;
    actorMemberId: string;
    category: PolicyCategory;
    name: string;
    rule: Record<string, unknown>;
  },
): Promise<SavedChange> {
  const name = input.name.trim();
  if (name.length === 0) throw ApiError.badRequest("Give the policy a name.");

  const { data: existing, error: readError } = await supabase
    .from("policies")
    .select("id, version, active")
    .eq("household_id", input.householdId)
    .eq("category", input.category)
    .eq("name", name);

  if (readError) throw writeFailure("policy", readError);

  const rows = (existing as Row[] | null) ?? [];
  const version = nextPolicyVersion(rows.map((row) => Number(row.version)));

  // Stand the old version down first: the index permits only one active
  // version per name, so inserting before deactivating would be refused.
  const inForce = rows.filter((row) => row.active === true).map((row) => row.id as string);
  if (inForce.length > 0) {
    const { error } = await supabase.from("policies").update({ active: false }).in("id", inForce);
    if (error) throw writeFailure("policy", error);
  }

  const { data, error } = await supabase
    .from("policies")
    .insert({
      household_id: input.householdId,
      category: input.category,
      name,
      rule: input.rule,
      version,
      active: true,
    })
    .select("id")
    .single();

  if (error) throw writeFailure("policy", error);

  const id = (data as Row).id as string;
  await audit(input.householdId, input.actorMemberId, "policy.updated", "policies", id, {
    category: input.category,
    version,
    supersededVersions: inForce.length,
  });

  return {
    id,
    downstream: downstreamOf({ kind: "policy", category: input.category, name, version }),
  };
}

export type ResponsibilityRow = {
  outcomeKey: string;
  primaryMemberId: string | null;
  backupMemberId: string | null;
  aiMode: AutonomyMode;
  priority: number;
};

export async function listResponsibilities(
  supabase: SupabaseClient,
  householdId: string,
): Promise<ResponsibilityRow[]> {
  const { data, error } = await supabase
    .from("responsibilities")
    .select("outcome_key, primary_member_id, backup_member_id, ai_mode, priority")
    .eq("household_id", householdId)
    .order("priority", { ascending: true });

  if (error) throw new Error(`listResponsibilities failed: ${error.code ?? "unknown"}`);

  return ((data as Row[] | null) ?? []).map((row) => ({
    outcomeKey: row.outcome_key as string,
    primaryMemberId: (row.primary_member_id as string | null) ?? null,
    backupMemberId: (row.backup_member_id as string | null) ?? null,
    aiMode: row.ai_mode as AutonomyMode,
    priority: Number(row.priority),
  }));
}

/**
 * Contradictions in the household's current responsibilities that nothing
 * caught at write time, because nothing was just written (story 02-007).
 *
 * Reads the same two things `saveResponsibility` validates against — the
 * current responsibilities and the household's currently active members —
 * and runs `detectConflicts` over them. A member who has left since an
 * outcome was assigned to them, or an outcome that has since become
 * adult-only, would otherwise sit unnoticed until somebody happened to
 * resave that exact row.
 */
export async function listConfigurationConflicts(
  supabase: SupabaseClient,
  householdId: string,
): Promise<ConfigurationConflict[]> {
  const [responsibilities, members] = await Promise.all([
    listResponsibilities(supabase, householdId),
    listMembers(supabase, householdId, null),
  ]);

  const active = members
    .filter((member) => member.status === "active")
    .map((member) => ({ id: member.id, displayName: member.displayName, memberType: member.memberType }));

  return detectConflicts(responsibilities, active);
}

/**
 * The next version each policy name would take (02-006).
 *
 * Read in one query so a proposal can say "saved as version 3" before
 * anything is written. A preview that cannot name the version it would
 * create is a preview of something slightly different from what happens.
 */
export async function policyVersions(
  supabase: SupabaseClient,
  householdId: string,
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("policies")
    .select("category, name, version")
    .eq("household_id", householdId);

  if (error) throw new Error(`policyVersions failed: ${error.code ?? "unknown"}`);

  const highest = new Map<string, number>();
  for (const row of (data as Row[] | null) ?? []) {
    const key = `${row.category as string}:${row.name as string}`;
    highest.set(key, Math.max(highest.get(key) ?? 0, Number(row.version)));
  }
  return highest;
}

/**
 * Applies a change a person has just agreed to (02-006).
 *
 * Every branch goes through the same function the forms call, so a change
 * arrived at by sentence is validated by the same rules, written to the same
 * canonical tables and audited the same way. There is deliberately no shorter
 * path here: the moment a sentence can reach a write a form cannot, the
 * validation stops being the truth about what a household can configure.
 */
export async function applyConfigurationChange(
  supabase: SupabaseClient,
  input: {
    householdId: string;
    actorMemberId: string;
    members: readonly ConfigMember[];
    change: ResolvedChange;
  },
): Promise<SavedChange> {
  const { householdId, actorMemberId, members, change } = input;

  switch (change.kind) {
    case "responsibility":
      return saveResponsibility(supabase, {
        householdId,
        actorMemberId,
        members,
        responsibility: change.responsibility,
      });

    case "policy":
      return savePolicy(supabase, {
        householdId,
        actorMemberId,
        category: change.category,
        name: change.name,
        rule: change.rule,
      });

    case "playbook":
      return savePlaybookItem(supabase, {
        householdId,
        actorMemberId,
        item: change.item,
        dependsOnKey: null,
      });
  }
}

function writeFailure(what: string, error: { code?: string; message?: string }): Error {
  if (error.code === "42501") {
    return ApiError.forbidden(`Only the Head of Family or an administrator can change the ${what}.`);
  }
  if (error.code === "23514") {
    return ApiError.badRequest(`That ${what} is not a combination WonderHome can store.`);
  }
  return new Error(`saving the ${what} failed: ${error.code ?? "unknown"}`);
}

/** Never lets a failed trail write undo a completed change; see api/audit.ts. */
async function audit(
  householdId: string,
  actorMemberId: string,
  eventType: AuditEventType,
  table: string,
  targetId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await recordAuditEvent(createAdminClient(), {
      householdId,
      actorMemberId,
      eventType,
      targetTable: table,
      targetId,
      metadata,
    });
  } catch {
    // recordAuditEvent already logs; a trail gap must not fail the change.
  }
}
