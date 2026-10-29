import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import { ApiError } from "../api/errors";
import { bareAddress } from "./addresses";

/**
 * The email sender allowlist (HomeSend Phase 2, story 17-016).
 *
 * The privacy gate for email intake: WonderHome reads and keeps mail only
 * from senders a household has approved, and drops everything else before it
 * is ever stored. The allowlist is the one source of that decision — the
 * inbound webhook asks it, per household, with the fetched message's real
 * sender, and keeps nothing from a sender that is not on it.
 *
 * Two deliberate properties:
 *  - **Empty allows no one.** A household that has added nothing has an empty
 *    list, and `senderMatchesAllowlist` returns `false` for every sender, so
 *    nothing is read until an Admin adds one. Reading never begins silently.
 *  - **The sender is evidence, not proof.** A forwarded `From` header can be
 *    forged, so a match is only the gate to the ordinary HomeSend pipeline,
 *    where the item still waits for a person's confirmation (bills, receipts
 *    and health always wait) and its content is always untrusted
 *    (`injection.ts`). We match the message's own `from`; we never claim SPF
 *    or DKIM verification we do not have.
 *
 * Reading the list is open to every member; adding and removing entries is
 * admin-only, enforced by RLS (42501) and backed by the application check in
 * the server action — the same shape as the household's forwarding address.
 */

export const ALLOWLIST_KINDS = ["address", "domain"] as const;
export type AllowlistKind = (typeof ALLOWLIST_KINDS)[number];

/** A normalized, canonical allowlist rule: an exact address, or a whole domain. */
export type AllowlistEntry = { kind: AllowlistKind; value: string };

export type StoredAllowlistEntry = AllowlistEntry & { id: string; createdAt: string };

/** The largest an allowlist may grow — generous for a household, a bound on a hot read (CLAUDE.md "every list has a bound"). */
export const MAX_ALLOWLIST_ENTRIES = 200;

/**
 * A domain is one or more dot-separated labels of letters, digits and
 * hyphens, each label starting and ending alphanumeric, with at least one
 * dot (so a bare "com" or "localhost" is rejected). Deliberately strict:
 * this is a privacy gate, not a parser, and a malformed rule should be
 * refused rather than guessed at.
 */
function isValidDomain(domain: string): boolean {
  if (domain.length === 0 || domain.length > 255) return false;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain);
}

/** The local part of an address: anything but "@", whitespace and control characters, 1–64 chars. */
function isValidLocalPart(local: string): boolean {
  return local.length >= 1 && local.length <= 64 && /^[^\s@]+$/.test(local);
}

/**
 * Turns what a person typed into a canonical entry, or `null` when it is not
 * a usable rule. Accepts:
 *   - `bills@bescom.co.in`           → an exact address;
 *   - `@school.edu` or `school.edu`  → a whole domain.
 * Everything is lower-cased and trimmed; an angle-bracketed form
 * ("Name <a@b.com>") is reduced to its address first.
 */
export function normalizeAllowlistEntry(raw: string): AllowlistEntry | null {
  const bare = bareAddress(raw);
  if (!bare || /\s/.test(bare)) return null;

  if (bare.startsWith("@")) {
    const domain = bare.slice(1);
    return isValidDomain(domain) ? { kind: "domain", value: domain } : null;
  }

  if (bare.includes("@")) {
    const parts = bare.split("@");
    if (parts.length !== 2) return null;
    const [local, domain] = parts as [string, string];
    return isValidLocalPart(local) && isValidDomain(domain) ? { kind: "address", value: `${local}@${domain}` } : null;
  }

  // No "@" at all — read it as a bare domain (school.edu), the common shorthand.
  return isValidDomain(bare) ? { kind: "domain", value: bare } : null;
}

/** How an entry reads back to a person: a domain always shows its leading "@". */
export function describeAllowlistEntry(entry: AllowlistEntry): string {
  return entry.kind === "domain" ? `@${entry.value}` : entry.value;
}

/**
 * Does this sender match any rule? Pure, so the gate is the same in the
 * webhook and in a test. An empty list matches nothing. A sender with no
 * address, or no domain, matches nothing.
 */
export function senderMatchesAllowlist(from: string | null | undefined, entries: readonly AllowlistEntry[]): boolean {
  if (!from || entries.length === 0) return false;
  const bare = bareAddress(from);
  const at = bare.lastIndexOf("@");
  if (at <= 0 || at === bare.length - 1) return false;
  const domain = bare.slice(at + 1);
  for (const entry of entries) {
    if (entry.kind === "address" && entry.value === bare) return true;
    if (entry.kind === "domain" && entry.value === domain) return true;
  }
  return false;
}

type Row = Record<string, unknown>;

function fromRow(row: Row): StoredAllowlistEntry {
  return {
    id: row.id as string,
    kind: row.kind as AllowlistKind,
    value: row.value as string,
    createdAt: row.created_at as string,
  };
}

const SELECT_COLUMNS = "id, kind, value, created_at";

/** Every approved sender for a household, newest first. Member-readable (RLS). */
export async function loadEmailAllowlist(supabase: SupabaseClient, householdId: string): Promise<StoredAllowlistEntry[]> {
  const { data, error } = await supabase
    .from("homesend_email_allowlist")
    .select(SELECT_COLUMNS)
    .eq("household_id", householdId)
    .order("created_at", { ascending: false })
    .limit(MAX_ALLOWLIST_ENTRIES);
  if (error) throw new Error(`loadEmailAllowlist failed: ${error.code ?? "unknown"}`);
  return ((data as Row[] | null) ?? []).map(fromRow);
}

/**
 * Adds one approved sender. Admin-only (RLS 42501). The raw text is
 * normalized first; an unusable rule is a 400 the caller shows, never a row.
 * A duplicate (same kind and value) is returned as the existing entry rather
 * than erroring, so adding the same sender twice is a no-op a person can see.
 */
export async function addEmailAllowlistEntry(
  supabase: SupabaseClient,
  input: { householdId: string; actorMemberId: string; raw: string },
): Promise<StoredAllowlistEntry> {
  const normalized = normalizeAllowlistEntry(input.raw);
  if (!normalized) {
    throw ApiError.badRequest("Enter a full email address (bills@bescom.co.in) or a whole domain (@school.edu).");
  }

  const { data, error } = await supabase
    .from("homesend_email_allowlist")
    .upsert(
      { household_id: input.householdId, kind: normalized.kind, value: normalized.value, created_by_member_id: input.actorMemberId },
      { onConflict: "household_id,kind,value" },
    )
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only a household administrator can change the approved email senders.");
    throw new Error(`addEmailAllowlistEntry failed: ${error.code ?? "unknown"}`);
  }

  await auditChange({
    householdId: input.householdId,
    actorMemberId: input.actorMemberId,
    eventType: "homesend.allowlist_added",
    targetTable: "homesend_email_allowlist",
    targetId: data.id as string,
  });

  return fromRow(data as Row);
}

/** Removes one approved sender by id. Admin-only (RLS 42501). */
export async function removeEmailAllowlistEntry(
  supabase: SupabaseClient,
  input: { householdId: string; actorMemberId: string; id: string },
): Promise<void> {
  const { data, error } = await supabase
    .from("homesend_email_allowlist")
    .delete()
    .eq("household_id", input.householdId)
    .eq("id", input.id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only a household administrator can change the approved email senders.");
    throw new Error(`removeEmailAllowlistEntry failed: ${error.code ?? "unknown"}`);
  }
  if (!data) return;

  await auditChange({
    householdId: input.householdId,
    actorMemberId: input.actorMemberId,
    eventType: "homesend.allowlist_removed",
    targetTable: "homesend_email_allowlist",
    targetId: input.id,
  });
}

/**
 * The webhook's gate: of the households an email was delivered to, which have
 * approved its sender? One query for all of them (CLAUDE.md "one wave"),
 * grouped and matched in memory. Always the admin client — a webhook carries
 * no member session. A household absent from the result approved nothing.
 */
export async function allowedHouseholdsForSender(
  admin: SupabaseClient,
  households: readonly string[],
  from: string | null | undefined,
): Promise<Set<string>> {
  if (households.length === 0 || !from) return new Set();

  const { data, error } = await admin
    .from("homesend_email_allowlist")
    .select("household_id, kind, value")
    .in("household_id", households as string[]);
  if (error) throw new Error(`allowedHouseholdsForSender failed: ${error.code ?? "unknown"}`);

  const byHousehold = new Map<string, AllowlistEntry[]>();
  for (const row of (data as Row[] | null) ?? []) {
    const householdId = row.household_id as string;
    const list = byHousehold.get(householdId) ?? [];
    list.push({ kind: row.kind as AllowlistKind, value: row.value as string });
    byHousehold.set(householdId, list);
  }

  const allowed = new Set<string>();
  for (const householdId of households) {
    if (senderMatchesAllowlist(from, byHousehold.get(householdId) ?? [])) allowed.add(householdId);
  }
  return allowed;
}
