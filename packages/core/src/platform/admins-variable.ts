import { createHash } from "node:crypto";

import type { SupabaseClient, User } from "@supabase/supabase-js";

import { recordAuditEvent } from "../api/audit";
import { adminClientFor, adminGrant } from "../db/admin-context";
import { log } from "../observability/logger";
import type { PlatformRole } from "./admin";

/**
 * Platform staff from a deployment variable (owner, 2026-11-22).
 *
 * `WONDERHOME_PLATFORM_ADMINS` is a comma-separated list of `email` or
 * `email:role`, e.g. `you@example.com:owner, helper@example.com:support`.
 * It is deployment-only on purpose (`STAYS_IN_VERCEL`): who may open Platform
 * admin cannot be decided inside Platform admin, or anyone who could write the
 * settings store could make themselves staff.
 *
 * - Emails are trimmed and case-insensitive; a role is support, operator or
 *   owner, and an entry with none is `operator`, so full control is always
 *   written out.
 * - Only a verified email of the signed-in auth user counts: a confirmed
 *   email, or a Google identity whose email Google verified. A phone-only
 *   account has no email and never matches. The email comes from the auth
 *   server (`auth.admin.getUserById`), never from the browser.
 * - Two auth users sharing an email are each judged on their own: only those
 *   that verified it match.
 * - The variable only changes rows it made (`source = 'variable'`): it grants,
 *   changes the role, reactivates and, once an email leaves the list,
 *   suspends. A row added by hand is never touched. It never creates an auth
 *   account: it acts only for someone already signed in.
 * - Every change writes an audit event naming the email only as a fingerprint
 *   and a masked form.
 */

export const PLATFORM_ADMINS_VARIABLE = "WONDERHOME_PLATFORM_ADMINS";

const ROLES: readonly PlatformRole[] = ["support", "operator", "owner"];
const RANK: Record<PlatformRole, number> = { support: 0, operator: 1, owner: 2 };
const EMAIL = /^[^\s@:,]+@[^\s@:,]+\.[^\s@:,]+$/;

export type ParsedPlatformAdmins = {
  /** Whether the variable is set at all (even to blanks). */
  set: boolean;
  /** Lower-cased email → role. */
  entries: ReadonlyMap<string, PlatformRole>;
  /** Entries that were not a valid `email` or `email:role`. */
  invalid: number;
};

export function parsePlatformAdmins(raw: string | undefined | null): ParsedPlatformAdmins {
  if (raw === undefined || raw === null) return { set: false, entries: new Map(), invalid: 0 };
  const entries = new Map<string, PlatformRole>();
  let invalid = 0;
  for (const piece of raw.split(/[,\n;]/)) {
    const item = piece.trim();
    if (!item) continue;
    const at = item.lastIndexOf(":");
    const email = (at > item.indexOf("@") ? item.slice(0, at) : item).trim().toLowerCase();
    const roleWord = at > item.indexOf("@") ? item.slice(at + 1).trim().toLowerCase() : "";
    const role = roleWord === "" ? "operator" : (ROLES as readonly string[]).includes(roleWord) ? (roleWord as PlatformRole) : null;
    if (!EMAIL.test(email) || !role) {
      invalid += 1;
      continue;
    }
    const before = entries.get(email);
    entries.set(email, before && RANK[before] > RANK[role] ? before : role);
  }
  return { set: true, entries, invalid };
}

/** Configuration health's line for the variable, or null when it is fine or unset. */
export function platformAdminsHealth(parsed: ParsedPlatformAdmins): string | null {
  if (!parsed.set) return null;
  if (parsed.entries.size === 0) {
    return `${PLATFORM_ADMINS_VARIABLE} is set but names nobody${parsed.invalid ? ` (${parsed.invalid} entr${parsed.invalid === 1 ? "y" : "ies"} not understood)` : ""} — no one is made staff from it.`;
  }
  if (parsed.invalid) {
    return `${PLATFORM_ADMINS_VARIABLE} has ${parsed.invalid} entr${parsed.invalid === 1 ? "y" : "ies"} that aren't an email or email:role (support, operator, owner) — ignored.`;
  }
  return null;
}

/** The verified emails of an auth user, lower-cased. Unverified and phone-only accounts give none. */
export function verifiedEmailsOf(user: Pick<User, "email" | "email_confirmed_at" | "identities">): string[] {
  const emails = new Set<string>();
  if (user.email && user.email_confirmed_at) emails.add(user.email.trim().toLowerCase());
  for (const identity of user.identities ?? []) {
    if (identity.provider !== "google") continue;
    const data = (identity.identity_data ?? {}) as { email?: unknown; email_verified?: unknown };
    if (typeof data.email === "string" && data.email && data.email_verified === true) emails.add(data.email.trim().toLowerCase());
  }
  return [...emails];
}

/** The strongest role any of these emails is listed with, and the email that gave it. */
export function matchPlatformAdmin(parsed: ParsedPlatformAdmins, emails: readonly string[]): { email: string; role: PlatformRole } | null {
  let best: { email: string; role: PlatformRole } | null = null;
  for (const email of emails) {
    const role = parsed.entries.get(email);
    if (role && (!best || RANK[role] > RANK[best.role])) best = { email, role };
  }
  return best;
}

export type StaffRow = { role: PlatformRole; status: "active" | "suspended"; source: "variable" | "manual" };

export type StaffChange =
  | { kind: "none" }
  | { kind: "grant"; role: PlatformRole }
  | { kind: "role_change"; from: PlatformRole; role: PlatformRole }
  | { kind: "reactivate"; role: PlatformRole }
  | { kind: "suspend" };

/** What the variable does to one person's row. A manual row is never changed. */
export function decideStaffChange(row: StaffRow | null, match: { role: PlatformRole } | null): StaffChange {
  if (row?.source === "manual") return { kind: "none" };
  if (!row) return match ? { kind: "grant", role: match.role } : { kind: "none" };
  if (!match) return row.status === "active" ? { kind: "suspend" } : { kind: "none" };
  if (row.status !== "active") return { kind: "reactivate", role: match.role };
  if (row.role !== match.role) return { kind: "role_change", from: row.role, role: match.role };
  return { kind: "none" };
}

/** A short one-way fingerprint of an email for audit rows. */
export function emailFingerprint(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 12);
}

/** `k***@gmail.com`: enough for staff to recognise their own, not to read it. */
export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

let parsedCache: { raw: string | undefined; parsed: ParsedPlatformAdmins } | null = null;

/** The parsed variable, once per value per server; invalid entries are logged once, without the email. */
export function platformAdminsFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): ParsedPlatformAdmins {
  const raw = env[PLATFORM_ADMINS_VARIABLE];
  if (parsedCache && parsedCache.raw === raw) return parsedCache.parsed;
  const parsed = parsePlatformAdmins(raw);
  if (parsed.invalid) log.warn("platform admins variable has entries that were ignored", { count: parsed.invalid, allow: ["count"] });
  parsedCache = { raw, parsed };
  return parsed;
}

const checked = new Set<string>();

/** Forget which people were checked (tests, and a sign-in that should look again). */
export function forgetPlatformAdminsCheck(userId?: string): void {
  if (userId) checked.delete(userId);
  else checked.clear();
}

/**
 * Keep this person's staff row in step with the variable. Once per person per
 * server, unless `force` (sign-in). Never throws: a failure leaves access as it
 * was and is logged.
 */
export async function applyPlatformAdminsVariable(userId: string, options: { force?: boolean; admin?: SupabaseClient } = {}): Promise<StaffChange> {
  if (!options.force && checked.has(userId)) return { kind: "none" };
  checked.add(userId);
  try {
    const parsed = platformAdminsFromEnv();
    const admin =
      options.admin ?? adminClientFor(adminGrant.worker("platform-admins-variable", "keep platform staff in step with WONDERHOME_PLATFORM_ADMINS"));
    const { data: rowData, error: rowError } = await admin
      .from("platform_admins")
      .select("id, role, status, source")
      .eq("profile_id", userId)
      .maybeSingle();
    if (rowError) throw rowError;
    const row = rowData as (StaffRow & { id: string }) | null;
    // Nothing listed and no row the variable made: nothing to look up.
    if (parsed.entries.size === 0 && (!row || row.source !== "variable")) return { kind: "none" };
    if (row?.source === "manual") return { kind: "none" };

    let match: { email: string; role: PlatformRole } | null = null;
    if (parsed.entries.size > 0) {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error || !data.user) throw error ?? new Error("auth user not found");
      match = matchPlatformAdmin(parsed, verifiedEmailsOf(data.user));
    }

    const change = decideStaffChange(row, match);
    if (change.kind === "none") return change;

    if (change.kind === "grant") {
      // A profile exists for every signed-in person; a missing one fails the insert and is logged.
      const { error } = await admin.from("platform_admins").insert({ profile_id: userId, role: change.role, status: "active", source: "variable" });
      if (error) throw error;
    } else if (change.kind === "suspend") {
      const { error } = await admin.from("platform_admins").update({ status: "suspended" }).eq("profile_id", userId).eq("source", "variable");
      if (error) throw error;
    } else {
      const { error } = await admin
        .from("platform_admins")
        .update({ role: change.role, status: "active" })
        .eq("profile_id", userId)
        .eq("source", "variable");
      if (error) throw error;
    }

    await recordAuditEvent(admin, {
      householdId: null,
      eventType: change.kind === "suspend" ? "platform_admin.suspended" : change.kind === "grant" ? "platform_admin.granted" : "platform_admin.role_changed",
      actorProfileId: null,
      targetTable: "platform_admins",
      targetId: userId,
      metadata: {
        source: PLATFORM_ADMINS_VARIABLE,
        change: change.kind,
        role: change.kind === "suspend" ? row?.role : change.role,
        ...(change.kind === "role_change" ? { from: change.from } : {}),
        ...(match ? { matchFingerprint: emailFingerprint(match.email), matchMasked: maskEmail(match.email) } : {}),
      },
    });
    return change;
  } catch (error) {
    // Stays marked as checked: a missing column or a refused read must not cost a query on every request. The next sign-in looks again.
    log.warn("platform admins variable could not be applied", { reason: (error as { code?: string })?.code ?? "unknown", allow: ["reason"] });
    return { kind: "none" };
  }
}
