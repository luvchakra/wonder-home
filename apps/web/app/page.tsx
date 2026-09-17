import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@wonderhome/core/db/server";
import { listMemberships } from "@wonderhome/core/identity/households";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Button } from "@wonderhome/core/ui/button";
import { Card, CardHeader, CardTitle } from "@wonderhome/core/ui/card";

import { signOut } from "./(auth)/actions";
import { AreaPlaceholder } from "./_components/area-placeholder";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return <SignedOutHome />;

  const memberships = await listMemberships(supabase);
  if (memberships.length === 0) redirect("/welcome");

  const membership = memberships[0]!;

  return (
    <AppShell active="home">
      <div className="space-y-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Good day, {membership.displayName}
          </h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">
            {membership.household.name} · {roleLabel(membership.roles)}
          </p>
        </header>

        <AreaPlaceholder
          title="Needs your attention"
          lede="Nothing is waiting on you right now."
          nextUp="Actionable cards arrive with the outcome engine (module 03) and the notification decision engine (module 06). Until then WonderHome has nothing to interrupt you about — which is the point."
        />

        <form action={signOut}>
          <Button type="submit" variant="secondary">
            Sign out
          </Button>
        </form>
      </div>
    </AppShell>
  );
}

function SignedOutHome() {
  return (
    <AppShell active="home">
      <div className="space-y-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">WonderHome</h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">
            Less mental load. More family time.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>A well-run home gives you more time</CardTitle>
          </CardHeader>
          <p className="mb-4 text-sm text-[var(--wh-foreground-muted)]">
            WonderHome manages household outcomes quietly and asks you only when a decision
            genuinely needs a person.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/sign-up">
              <Button>Get started</Button>
            </Link>
            <Link href="/sign-in">
              <Button variant="secondary">I already have an account</Button>
            </Link>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function roleLabel(roles: readonly string[]): string {
  if (roles.includes("head")) return "Head of Family";
  if (roles.includes("administrator")) return "Household Administrator";
  return "Member";
}
