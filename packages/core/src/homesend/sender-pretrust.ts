import type { SupabaseClient } from "@supabase/supabase-js";

import { readKnownCorrespondents } from "../homebrain/household-records";
import { auditChange } from "../api/audit";
import { activeAdultAdmin } from "../identity/active-admin";
import { log } from "../observability/logger";
import { bareAddress } from "./addresses";

/**
 * Known senders are trusted without asking (the owner, 2026-11-20, "HomeSend
 * on its own", decision 4). On "Ask once" (`record-first.ts`), mail from a
 * sender the household already knows is read like a trusted sender's,
 * without "Trust this sender?":
 *
 *   - **contact**: the address is a member's own email (Family) or a
 *     teacher's contact on a child's school page;
 *   - **school**: the address is at a child's school's own domain — a
 *     teacher's email domain, the domain earlier school notices came from,
 *     or a domain whose name is the school's name ("greenwoodhigh.edu.in"
 *     for "Greenwood High");
 *   - **payee**: the address sent a bill or receipt the household recorded,
 *     or its domain's name is a payee on record ("bescom.co.in" for BESCOM).
 *
 * Everyone else is still asked. A webmail domain (gmail.com …) never counts
 * as a school's or a payee's: only an exact address does. The exact address
 * is what gets trusted, never the whole domain. A sender someone answered
 * "Not ours" about, or an address an Admin removed from the list, is never
 * pre-trusted again (`pre_trust_off`). A default still never trusts anyone:
 * this is the household's own records speaking, decided before any question.
 *
 * Visible and reversible: the sender is added to the household's approved
 * senders with its `basis`, shown on Settings → Connections → Email as
 * "Trusted: in your contacts" (or "a child's school", "a payee on record"),
 * with the same Remove as any other entry. The entry is vouched for by the
 * household's owner when they are an active adult Admin, so its mail is
 * added on arrival like any trusted sender's (`trusted-arrival.ts`). Its
 * content stays untrusted (`injection.ts`); paying, approving and permission
 * never come from a sender.
 */

export const PRE_TRUST_BASES = ["contact", "school", "payee"] as const;
export type PreTrustBasis = (typeof PRE_TRUST_BASES)[number];

/** Webmail and ISP domains: anyone can have an address there, so the domain alone says nothing. */
export const SHARED_MAIL_DOMAINS: ReadonlySet<string> = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "yahoo.in", "ymail.com", "rocketmail.com",
  "outlook.com", "hotmail.com", "hotmail.co.in", "live.com", "live.in", "msn.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "pm.me",
  "zoho.com", "zohomail.in", "rediffmail.com", "gmx.com", "gmx.de", "web.de", "mail.com",
  "yandex.com", "yandex.ru", "qq.com", "163.com", "126.com", "fastmail.com", "tutanota.com", "hey.com",
]);

/** Second-level labels that are part of a public suffix ("co" in bescom.co.in). */
const SUFFIX_LABELS: ReadonlySet<string> = new Set(["co", "ac", "edu", "org", "gov", "net", "com", "sch", "nic", "res", "gen", "ind", "firm"]);

/** What the household's records say about senders it already knows. */
export type KnownSenders = {
  /** Exact addresses: members' emails, teachers' contacts, senders of recorded bills and school notices. */
  addresses: ReadonlyMap<string, PreTrustBasis>;
  /** Whole domains a school's own mail came from (never a webmail domain). */
  schoolDomains: ReadonlySet<string>;
  /** The children's schools, by name. */
  schoolNames: readonly string[];
  /** Payees on the household's bills, by name. */
  payeeNames: readonly string[];
};

export const NO_KNOWN_SENDERS: KnownSenders = { addresses: new Map(), schoolDomains: new Set(), schoolNames: [], payeeNames: [] };

function domainOf(address: string): string | null {
  const at = address.lastIndexOf("@");
  if (at <= 0 || at === address.length - 1) return null;
  return address.slice(at + 1);
}

/** "notices.greenwoodhigh.edu.in" → "greenwoodhigh": the name a domain was registered under. */
export function registeredName(domain: string): string | null {
  const labels = domain.toLowerCase().split(".").filter(Boolean);
  if (labels.length < 2) return null;
  labels.pop();
  if (labels.length >= 2 && SUFFIX_LABELS.has(labels[labels.length - 1]!)) labels.pop();
  return labels[labels.length - 1] ?? null;
}

/** "Greenwood High School" → "greenwoodhighschool": letters and digits only. */
function compact(name: string): string {
  return name.normalize("NFKC").toLowerCase().replace(/\b(ltd|limited|pvt|private|inc|llp|the)\b/g, "").replace(/[^\p{L}\p{N}]/gu, "");
}

/** A domain is this name's when its registered name is the name, or the name without "school". Short names never match. */
function domainNames(domain: string, name: string): boolean {
  const registered = registeredName(domain);
  const whole = compact(name);
  if (!registered || whole.length < 4) return false;
  const short = whole.replace(/(school|schools|academy|vidyalaya)$/u, "");
  return registered === whole || (short.length >= 5 && registered === short);
}

/**
 * Pure: whether the household's records know this sender, and why. Null for
 * anyone it doesn't know (they are asked, as before).
 */
export function preTrustBasis(from: string | null | undefined, known: KnownSenders): PreTrustBasis | null {
  if (!from) return null;
  const address = bareAddress(from);
  const domain = domainOf(address);
  if (!domain || /\s/.test(address)) return null;
  const exact = known.addresses.get(address);
  if (exact) return exact;
  if (SHARED_MAIL_DOMAINS.has(domain)) return null;
  if (known.schoolDomains.has(domain) || known.schoolNames.some((name) => domainNames(domain, name))) return "school";
  if (known.payeeNames.some((name) => domainNames(domain, name))) return "payee";
  return null;
}

type Row = Record<string, unknown>;

function emailIn(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /[^\s<>(),;:"']+@[^\s<>(),;:"']+\.[a-z]{2,}/i.exec(value);
  return match ? match[0].toLowerCase() : null;
}

/** What the household's own records say about who writes to it: one wave of bounded reads. Unreadable is "knows no one". */
export async function loadKnownSenders(admin: SupabaseClient, householdId: string): Promise<KnownSenders> {
  try {
    // The household's records (members, teachers, schools, payees) through HomeBrain; HomeSend reads only its own tables (X-003).
    const [records, routed] = await Promise.all([
      readKnownCorrespondents(admin, householdId),
      admin
        .from("home_send_items")
        .select("sender_address, routed_table")
        .eq("household_id", householdId)
        .eq("source", "email")
        .eq("status", "routed")
        .in("routed_table", ["obligations", "consumable_purchases", "school_items", "child_activity_notes"])
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    const addresses = new Map<string, PreTrustBasis>();
    const schoolDomains = new Set<string>();
    for (const value of records.memberEmails) {
      const email = emailIn(value);
      if (email) addresses.set(email, "contact");
    }
    for (const value of records.teacherContacts) {
      const email = emailIn(value);
      if (!email) continue;
      addresses.set(email, "contact");
      const domain = domainOf(email);
      if (domain && !SHARED_MAIL_DOMAINS.has(domain)) schoolDomains.add(domain);
    }
    for (const row of (routed.data ?? []) as Row[]) {
      const email = emailIn(row.sender_address);
      if (!email) continue;
      const school = row.routed_table === "school_items" || row.routed_table === "child_activity_notes";
      if (!addresses.has(email)) addresses.set(email, school ? "school" : "payee");
      const domain = domainOf(email);
      if (school && domain && !SHARED_MAIL_DOMAINS.has(domain)) schoolDomains.add(domain);
    }
    return { addresses, schoolDomains, schoolNames: records.schoolNames, payeeNames: records.payeeNames };
  } catch {
    return NO_KNOWN_SENDERS;
  }
}

/** The household's owner, when an active adult Admin: who vouches for a pre-trusted sender's mail. */
async function owner(admin: SupabaseClient, householdId: string): Promise<string | null> {
  const { data } = await admin.from("households").select("owner_member_id").eq("id", householdId).maybeSingle();
  const ownerId = (data as { owner_member_id: string | null } | null)?.owner_member_id ?? null;
  if (!ownerId) return null;
  return (await activeAdultAdmin(admin, householdId, ownerId))?.memberId ?? null;
}

/**
 * Whether this household's records know `from`, and if so adds the exact
 * address to its approved senders with its basis. Called by the webhook only
 * for a household on "Ask once" that hasn't approved the sender. Returns the
 * basis when the mail may be read now; null to ask, as before. Never throws.
 */
export async function preTrustSender(admin: SupabaseClient, input: { householdId: string; from: string | null | undefined; now?: Date }): Promise<PreTrustBasis | null> {
  try {
    const address = input.from ? bareAddress(input.from) : null;
    if (!address) return null;
    // "Not ours", or an Admin took this address off the list: never pre-trusted again.
    let declined = await admin.from("homesend_email_senders").select("state, pre_trust_off").eq("household_id", input.householdId).eq("address", address).maybeSingle();
    // Before the migration: no `pre_trust_off` yet, so only "Not ours" can have said no.
    if (declined.error && /column/i.test(declined.error.message ?? "")) declined = await admin.from("homesend_email_senders").select("state").eq("household_id", input.householdId).eq("address", address).maybeSingle();
    if (declined.error) return null;
    const said = declined.data as { state?: string; pre_trust_off?: boolean } | null;
    if (said?.state === "blocked" || said?.pre_trust_off === true) return null;

    const basis = preTrustBasis(address, await loadKnownSenders(admin, input.householdId));
    if (!basis) return null;
    const voucher = await owner(admin, input.householdId).catch(() => null);
    const row = { household_id: input.householdId, kind: "address", value: address, created_by_member_id: voucher, basis };
    const added = await admin.from("homesend_email_allowlist").upsert(row, { onConflict: "household_id,kind,value", ignoreDuplicates: true });
    // Before the migration there is no `basis` to show it by: read for this delivery only, nothing written.
    if (added.error && !/column/i.test(added.error.message ?? "")) return null;
    if (said?.state === "pending" || said?.state === "not_answered") {
      await admin.from("homesend_email_senders").update({ state: "trusted", decided_at: (input.now ?? new Date()).toISOString() }).eq("household_id", input.householdId).eq("address", address);
    }
    await auditChange({ householdId: input.householdId, actorMemberId: null, eventType: "homesend.sender_pre_trusted", targetTable: "households", targetId: input.householdId, metadata: { basis } }).catch(() => undefined);
    return basis;
  } catch (thrown) {
    log.warn("sender pre-trust failed", { reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["reason"] });
    return null;
  }
}

/**
 * An Admin removed an address from the approved senders: it is never
 * pre-trusted again, and its next mail asks "Trust this sender?" as for
 * anyone new. Service client, after the caller's own Admin check. Never throws.
 */
export async function turnOffPreTrust(admin: SupabaseClient, input: { householdId: string; address: string; memberId: string; now?: Date }): Promise<void> {
  try {
    const address = bareAddress(input.address);
    const at = (input.now ?? new Date()).toISOString();
    const { data } = await admin.from("homesend_email_senders").select("id, state").eq("household_id", input.householdId).eq("address", address).maybeSingle();
    if (data) {
      const state = (data as { state: string }).state;
      await admin
        .from("homesend_email_senders")
        .update({ pre_trust_off: true, ...(state === "trusted" ? { state: "not_answered", decided_at: at, decided_by_member_id: input.memberId } : {}) })
        .eq("id", (data as { id: string }).id);
    } else {
      await admin.from("homesend_email_senders").insert({ household_id: input.householdId, address, state: "not_answered", held_count: 0, asked_at: at, decided_at: at, decided_by_member_id: input.memberId, pre_trust_off: true });
    }
  } catch (thrown) {
    log.warn("turning pre-trust off failed", { reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["reason"] });
  }
}
