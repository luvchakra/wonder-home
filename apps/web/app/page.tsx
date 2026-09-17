import { createClient } from "@wonderhome/core/db/server";
import { listMemberships } from "@wonderhome/core/identity/households";

import { buildSession } from "./_lib/session";
import { ChildHome } from "./_screens/child-home";
import { HomeDashboard } from "./_screens/home-dashboard";
import { Landing } from "./_screens/landing";

export const dynamic = "force-dynamic";

/**
 * "/" is three different screens depending on who is looking: the landing
 * page for a visitor, the household dashboard for an adult, and the child
 * view for a child — a different framing, not a reduced one.
 */
export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return <Landing />;

  const memberships = await listMemberships(supabase);
  if (memberships.length === 0) {
    const { redirect } = await import("next/navigation");
    redirect("/welcome");
  }

  const session = await buildSession(supabase, memberships[0]!);

  return session.view.tone === "child" ? <ChildHome session={session} /> : <HomeDashboard session={session} />;
}
