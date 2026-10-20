import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { createClient, getVerifiedUser } from "@wonderhome/core/db/server";
import { ageBandFor, parseDateOfBirth } from "@wonderhome/core/identity/age";
import { listMemberships, signAvatarPaths } from "@wonderhome/core/identity/households";
import { claimMembers } from "@wonderhome/core/identity/member-phone";
import type { HouseholdMembership } from "@wonderhome/core/identity/schemas";
import { buildPersonalView, type PersonalView } from "@wonderhome/core/identity/views";
import type { Formatter } from "@wonderhome/core/i18n/format";
import { preferencesOf, type LocalePreferences } from "@wonderhome/core/i18n/preferences";
import { requestFormat, requestFormatIn, requestT, setRequestLocale } from "@wonderhome/core/i18n/request";
import { translatorFor, type Translate } from "@wonderhome/core/i18n/translate";
import { PRIMARY_NAVIGATION } from "@wonderhome/core/navigation/primary-navigation";
import { secondaryNavigationFor, SECONDARY_GROUP_ORDER, type SecondaryNavItem } from "@wonderhome/core/navigation/secondary-navigation";
import { installBannerLabels } from "@wonderhome/core/pwa/install-labels";
import { childStarCount } from "@wonderhome/core/school/goal-repository";
import type { ShellLabels, ShellViewer } from "@wonderhome/core/shell/mobile-header";

import { reconcileRemindersSoon } from "./reminders";

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
  /** How this person reads WonderHome: their language, the household's region, their formats (story 22-002). */
  locale: { preferences: LocalePreferences; t: Translate; format: Formatter };
};

/**
 * Loads the session or sends the person where they need to go: sign-in if
 * there is no account, onboarding if there is no household yet.
 */
export async function requireSession(nextPath: string): Promise<Session> {
  const [supabase, user] = await Promise.all([createClient(), getVerifiedUser()]);
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(nextPath)}`);

  const memberships = await membershipsOrClaimed(supabase);
  if (memberships.length === 0) redirect("/welcome");

  return buildSession(supabase, memberships[0]!);
}

/**
 * This person's households — and, when they have none yet, the ones a family
 * recorded them in by their verified email (they confirmed it by a link, so
 * no sign-in action ran). Someone with no household and no match goes on to
 * create one, as before.
 */
export async function membershipsOrClaimed(supabase: SupabaseClient): Promise<HouseholdMembership[]> {
  const memberships = await listMemberships(supabase);
  if (memberships.length > 0) return memberships;
  return (await claimMembers(supabase)) > 0 ? listMemberships(supabase) : memberships;
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

  const memberships = await membershipsOrClaimed(supabase).catch(() => []);
  if (memberships.length === 0) return null;

  return buildSession(supabase, memberships[0]!).catch(() => null);
}

/** The same, for a screen that has already established there is a user. */
export async function buildSession(
  supabase: SupabaseClient,
  membership: HouseholdMembership,
): Promise<Session> {
  // Everything the shell needs beyond the membership, in one wave: the unread
  // dot, the first-seen mark, the reader's words and their own photo. None is
  // worth failing the page for: a slow or failed count leaves the dot off, a
  // missing photo leaves the initials.
  const preferences = preferencesOf(membership.locale, membership.household.timezone);
  const isChild = membership.memberType === "child";
  const [unread, , t, avatarUrl, stars] = await Promise.all([
    countUnread(supabase, membership.memberId).catch(() => 0),
    markFirstSeen(supabase, membership),
    translatorFor(preferences.language),
    ownAvatarUrl(supabase, membership.avatarPath ?? null),
    // A child's stars, counted from what they did (story 08-017); only ever read for a child.
    isChild ? childStarCount(supabase, membership.household.id, membership.memberId).catch(() => 0) : Promise.resolve(0),
  ]);

  const view = buildPersonalView(membership, ageBandFor(parseDateOfBirth(membership.dateOfBirth)));

  // Reminders follow the household's records: re-read after this response.
  reconcileRemindersSoon(membership.household.id);

  // Set once for the whole request, so every date, time and amount on the
  // page — however deep — is written the way this person reads.
  setRequestLocale(preferences, t);

  const labels: ShellLabels = {
    nav: Object.fromEntries(PRIMARY_NAVIGATION.map((item) => [item.key, t(`nav.${item.key}`)])),
    groups: Object.fromEntries(SECONDARY_GROUP_ORDER.map((group) => [group, t(`nav.group.${group}`)])),
    settings: t("nav.settings"),
    household: t("settings.section.household"),
    logout: t("nav.logout"),
    talking: t("nav.talking"),
    install: installBannerLabels(t, preferences.language),
  };

  return {
    supabase,
    membership,
    view,
    viewer: {
      displayName: view.displayName,
      avatarUrl,
      roleLabel: roleWords(view.roleLabel, t),
      householdName: view.householdName,
      unread,
      language: preferences.language,
      dir: preferences.dir,
      labels,
      ...(isChild ? { audience: "child" as const, stars: { count: stars, label: t("kids.stars.header", { count: stars }) } } : {}),
    },
    secondary: secondaryNavigationFor({ permissions: view.permissions, tone: view.tone }).map((item) => ({
      ...item,
      label: t(`nav.item.${item.key}`) || item.label,
      purpose: t(`nav.purpose.${item.key}`) || item.purpose,
      ...(item.key === "notifications" && unread > 0 ? { badge: unread } : {}),
    })),
    locale: { preferences, t, format: requestFormat() },
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

/** The date as the household reads it, in the household's own time zone and the person's own language. */
export function formatToday(timezone: string, now = new Date()): string {
  return requestFormatIn(timezone).today(now);
}

/** A time of day, 12- or 24-hour as the person chose (story 22-002). */
export function formatTime(timezone: string, at: Date): string {
  return requestFormatIn(timezone).time(at);
}

export function formatDate(timezone: string, at: Date, style: "short" | "long" = "short"): string {
  return requestFormatIn(timezone).date(at, style);
}

/** A greeting for the household's hour, not the server's, in the person's language. */
export function greetingFor(timezone: string, now = new Date()): string {
  const hour = requestFormatIn(timezone).hourOf(now);
  const t = requestT();
  if (hour < 5) return t("greeting.night");
  if (hour < 12) return t("greeting.morning");
  if (hour < 17) return t("greeting.afternoon");
  return t("greeting.evening");
}

const ROLE_KEYS = { Admin: "role.admin", Adult: "role.adult", Child: "role.child", Househelper: "role.househelper" } as const;

/** The viewer's role in their language (story 22-004); an unknown label is shown as it is. */
export function roleWords(label: string, t: Translate): string {
  const key = ROLE_KEYS[label as keyof typeof ROLE_KEYS];
  return key ? t(key) : label;
}

/**
 * A signed URL for this member's own photo in Family — the same picture in
 * the header as on their card — or null. The path comes with the membership
 * (`listMemberships`), so this is one storage call, and only when there is a
 * photo. Never fails the page.
 */
async function ownAvatarUrl(supabase: Awaited<ReturnType<typeof createClient>>, path: string | null): Promise<string | null> {
  try {
    if (!path) return null;
    return (await signAvatarPaths(supabase, [path])).get(path) ?? null;
  } catch {
    return null;
  }
}
