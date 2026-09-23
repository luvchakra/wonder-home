import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { createClient, getVerifiedUser } from "@wonderhome/core/db/server";
import { ageBandFor, parseDateOfBirth } from "@wonderhome/core/identity/age";
import { listMemberships } from "@wonderhome/core/identity/households";
import type { HouseholdMembership } from "@wonderhome/core/identity/schemas";
import { buildPersonalView, type PersonalView } from "@wonderhome/core/identity/views";
import { secondaryNavigationFor, type SecondaryNavItem } from "@wonderhome/core/navigation/secondary-navigation";
import type { ShellViewer } from "@wonderhome/core/shell/mobile-header";

/**
 * Everything a signed-in screen needs to render its shell: who is looking,
 * from which household, with which permissions, and what to offer them.
 *
 * The view is assembled server-side: a section this member may not see is
 * absent from what reaches the browser, not hidden once it gets there. The
 * pages and the API still check again — this is presentation.
 */
export type Session = {
  supabase: SupabaseClient;
  membership: HouseholdMembership;
  view: PersonalView;
  viewer: ShellViewer;
  secondary: SecondaryNavItem[];
};

/**
 * Loads the session or sends the person where they need to go: sign-in if
 * there is no account, onboarding if there is no household yet.
 */
export async function requireSession(nextPath: string): Promise<Session> {
  const [supabase, user] = await Promise.all([createClient(), getVerifiedUser()]);
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(nextPath)}`);

  const memberships = await listMemberships(supabase);
  if (memberships.length === 0) redirect("/welcome");

  return buildSession(supabase, memberships[0]!);
}

/**
 * The session if there is one, and nothing if there is not.
 *
 * For a page that is worth reading signed out — the help guide — but is
 * better with the shell around it when somebody is signed in. Deliberately
 * never redirects: a public page that bounces a visitor to sign-in is not a
 * public page, and the whole point of this helper is the one that does not.
 */
export async function optionalSession(): Promise<Session | null> {
  const [supabase, user] = await Promise.all([createClient(), getVerifiedUser()]);
  if (!user) return null;

  const memberships = await listMemberships(supabase).catch(() => []);
  if (memberships.length === 0) return null;

  return buildSession(supabase, memberships[0]!).catch(() => null);
}

/** The same, for a screen that has already established there is a user. */
export async function buildSession(
  supabase: SupabaseClient,
  membership: HouseholdMembership,
): Promise<Session> {
  // The unread dot is the only thing the shell needs beyond the membership,
  // and it is not worth waiting for: a failure or a slow count leaves the
  // dot off rather than the page late.
  const [unread] = await Promise.all([
    countUnread(supabase, membership.memberId).catch(() => 0),
    markFirstSeen(supabase, membership),
  ]);

  const view = buildPersonalView(membership, ageBandFor(parseDateOfBirth(membership.dateOfBirth)));

  return {
    supabase,
    membership,
    view,
    viewer: {
      displayName: view.displayName,
      roleLabel: view.roleLabel,
      householdName: view.householdName,
      unread,
    },
    secondary: secondaryNavigationFor({ permissions: view.permissions, tone: view.tone }),
  };
}

/**
 * Records this person's first sign-in to the household, once.
 *
 * The moment starts their week of setup guidance. It is written by a
 * definer function that only fills an empty value, so nobody — this code
 * included — can move it later. A failure leaves the membership as it was;
 * the screen then treats them as brand new, which is the safe direction.
 */
async function markFirstSeen(supabase: SupabaseClient, membership: HouseholdMembership): Promise<void> {
  if (membership.firstSeenAt) return;
  try {
    const { data } = await supabase.rpc("mark_member_seen", { p_household_id: membership.household.id });
    if (typeof data === "string") membership.firstSeenAt = data;
  } catch {
    // Not worth failing a page for.
  }
}

async function countUnread(supabase: SupabaseClient, memberId: string): Promise<number> {
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_member_id", memberId)
    .in("status", ["generated", "delivered"])
    // Held for later (a reminder for tomorrow) is not unread yet.
    .lte("scheduled_for", new Date().toISOString());
  return count ?? 0;
}

/** The date as the household reads it, in the household's own time zone. */
export function formatToday(timezone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: timezone,
    }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(now);
  }
}

export function formatTime(timezone: string, at: Date): string {
  try {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(at);
  } catch {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(at);
  }
}

export function formatDate(timezone: string, at: Date, style: "short" | "long" = "short"): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: style === "long" ? "short" : undefined,
      day: "numeric",
      month: "short",
      timeZone: timezone,
    }).format(at);
  } catch {
    return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(at);
  }
}

/** A greeting for the household's hour, not the server's. */
export function greetingFor(timezone: string, now = new Date()): string {
  let hour = now.getHours();
  try {
    hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: timezone }).format(now));
  } catch {
    // Fall through to the server's hour.
  }
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
