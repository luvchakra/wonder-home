import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@wonderhome/core/db/server";
import { ageBandFor, parseDateOfBirth } from "@wonderhome/core/identity/age";
import { listMemberships } from "@wonderhome/core/identity/households";
import { buildPersonalView } from "@wonderhome/core/identity/views";
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

  const { data: memberRow } = await supabase
    .from("household_members")
    .select("date_of_birth")
    .eq("id", membership.memberId)
    .maybeSingle();

  // The view is assembled server-side: a section this member may not see is
  // absent from what reaches the browser, not hidden once it gets there.
  const view = buildPersonalView(
    membership,
    ageBandFor(parseDateOfBirth(memberRow?.date_of_birth as string | null)),
  );

  return (
    <AppShell active="home">
      <div className="space-y-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {view.tone === "child" ? `Hi ${view.displayName}!` : `Good day, ${view.displayName}`}
          </h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">
            {view.householdName} · {view.roleLabel}
          </p>
        </header>

        <AreaPlaceholder
          title="Needs your attention"
          lede={
            view.tone === "child"
              ? "Nothing to do right now. Nice."
              : "Nothing is waiting on you right now."
          }
          nextUp="Actionable cards arrive with the outcome engine (module 03) and the notification decision engine (module 06). Until then WonderHome has nothing to interrupt you about — which is the point."
        />

        {view.sections.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Your areas</CardTitle>
            </CardHeader>
            <ul className="divide-y divide-[var(--wh-border)]">
              {view.sections.map((section) => (
                <li key={section.key}>
                  <Link
                    href={section.href}
                    className="flex min-h-11 items-center justify-between gap-3 py-3 text-sm"
                  >
                    <span>
                      <span className="font-medium">{section.label}</span>
                      <span className="block text-xs text-[var(--wh-foreground-subtle)]">
                        {section.purpose}
                      </span>
                    </span>
                    <span aria-hidden className="text-[var(--wh-foreground-subtle)]">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

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
