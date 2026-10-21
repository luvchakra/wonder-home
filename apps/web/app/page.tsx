import { createClient, getVerifiedUser } from "@wonderhome/core/db/server";

import { buildSession, membershipsOrClaimed } from "./_lib/session";
import { ChildHome } from "./_screens/child-home";
import { HomeDashboard } from "./_screens/home-dashboard";
import { Landing } from "./_screens/landing";

export const dynamic = "force-dynamic";

/** The landing page is the one screen a search engine is welcome to read. */
export const metadata = { robots: { index: true, follow: true } };

/**
 * "/" is three different screens depending on who is looking: the landing
 * page for a visitor, the household dashboard for an adult, and the child
 * view for a child — a different framing, not a reduced one.
 */
export default async function HomePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [supabase, user, { tab }] = await Promise.all([createClient(), getVerifiedUser(), searchParams]);

  if (!user) return <Landing />;

  const memberships = await membershipsOrClaimed(supabase);
  if (memberships.length === 0) {
    const { redirect } = await import("next/navigation");
    redirect("/welcome");
  }

  const session = await buildSession(supabase, memberships[0]!);

  return session.view.tone === "child" ? <ChildHome session={session} tab={tab} /> : <HomeDashboard session={session} />;
}
