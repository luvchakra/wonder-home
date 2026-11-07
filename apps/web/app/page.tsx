import { createClient, getVerifiedUser } from "@wonderhome/core/db/server";
import { landingVariant } from "@wonderhome/core/platform/settings";

import { visitorLocale } from "./_lib/entry-locale";
import { buildSession, membershipsOrClaimed } from "./_lib/session";
import { ChildHome } from "./_screens/child-home";
import { HomeDashboard } from "./_screens/home-dashboard";
import { ClassicLanding } from "./_screens/landing-classic";
import { NewLanding } from "./_screens/landing-new";

export const dynamic = "force-dynamic";

/** The landing page is the one screen a search engine is welcome to read. */
export async function generateMetadata() {
  const { t } = await visitorLocale();
  return { title: t("landing.meta.title"), description: t("landing.meta.description"), robots: { index: true, follow: true } };
}

/**
 * "/" is three different screens depending on who is looking: the landing
 * page for a visitor, the household dashboard for an adult, and the child
 * view for a child — a different framing, not a reduced one.
 */
export default async function HomePage({ searchParams }: { searchParams: Promise<{ tab?: string; landing?: string }> }) {
  const [supabase, user, { tab, landing }] = await Promise.all([createClient(), getVerifiedUser(), searchParams]);

  if (!user) {
    // `?landing=classic|new` previews either page without changing the setting (staff checking before they switch; the end-to-end suite).
    const variant = landing === "classic" || landing === "new" ? landing : await landingVariant(supabase);
    return variant === "classic" ? <ClassicLanding /> : <NewLanding />;
  }

  const memberships = await membershipsOrClaimed(supabase);
  if (memberships.length === 0) {
    const { redirect } = await import("next/navigation");
    redirect("/welcome");
  }

  const session = await buildSession(supabase, memberships[0]!);

  return session.view.tone === "child" ? <ChildHome session={session} tab={tab} /> : <HomeDashboard session={session} />;
}
