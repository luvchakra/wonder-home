import { ChevronRight, LogOut } from "lucide-react";

import Link from "next/link";

import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Avatar } from "@wonderhome/core/ui/avatar";
import { Button } from "@wonderhome/core/ui/button";
import { Card } from "@wonderhome/core/ui/card";
import { DomainCard, DomainGrid } from "@wonderhome/core/ui/domain-card";
import { QuoteCard } from "@wonderhome/core/ui/quote-card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";

import { signOut } from "../(auth)/actions";
import { DOMAIN_ICONS } from "../_lib/domain-icons";
import { requireSession } from "../_lib/session";

export const metadata = { title: "More" };
export const dynamic = "force-dynamic";

/**
 * More: the way into every household domain, plus administration and settings.
 *
 * Only sections this person may see are listed — the list is filtered
 * server-side from their permissions — and only sections that exist. A menu of
 * unbuilt things teaches people that links do nothing.
 */
export default async function MorePage() {
  const { viewer, secondary, view } = await requireSession("/more");

  const domains = secondary.filter((item) => !["manage", "settings", "notifications"].includes(item.key));
  const admin = secondary.filter((item) => item.key === "manage");
  const personal = secondary.filter((item) => item.key === "settings" || item.key === "notifications");

  return (
    <AppShell active="more" viewer={viewer} secondary={secondary} pathname="/more">
      <div className="space-y-6">
        <Link
          href="/settings"
          className="wh-rise wh-lift flex items-center gap-3 rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-4 shadow-[var(--wh-shadow-card)]"
        >
          <Avatar name={viewer.displayName} size="lg" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-semibold">{viewer.displayName}</span>
            <span className="block truncate text-xs text-[var(--wh-foreground-muted)]">
              {viewer.roleLabel} · {viewer.householdName}
            </span>
          </span>
          <ChevronRight aria-hidden className="size-5 text-[var(--wh-foreground-subtle)]" />
        </Link>

        <section>
          <SectionHeader title={view.tone === "child" ? "Your areas" : "Household"} />
          <DomainGrid>
            {domains.map((item) => (
              <DomainCard key={item.key} href={item.href} icon={DOMAIN_ICONS[item.icon]} tone={item.tone} title={item.label} description={item.purpose} />
            ))}
          </DomainGrid>
        </section>

        {admin.length > 0 || personal.length > 0 ? (
          <section>
            <SectionHeader title="Manage" />
            <Card className="p-2">
              <ul className="divide-y divide-[var(--wh-border)]">
                {[...admin, ...personal].map((item) => {
                  const Icon = DOMAIN_ICONS[item.icon];
                  return (
                    <li key={item.key}>
                      <Link href={item.href} className="flex min-h-14 items-center gap-3 rounded-[var(--wh-radius-sm)] px-2 py-2 transition-colors hover:bg-[var(--wh-surface-muted)]">
                        <span className="grid size-10 place-items-center rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] text-[var(--wh-foreground-muted)]">
                          <Icon className="size-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{item.label}</span>
                          <span className="block truncate text-xs text-[var(--wh-foreground-subtle)]">{item.purpose}</span>
                        </span>
                        <ChevronRight aria-hidden className="size-4 text-[var(--wh-foreground-subtle)]" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </section>
        ) : null}

        <form action={signOut}>
          <Button type="submit" variant="secondary" className="w-full gap-2">
            <LogOut aria-hidden className="size-4" /> Sign out
          </Button>
        </form>

        <QuoteCard>Less mental load. More family time.</QuoteCard>
      </div>
    </AppShell>
  );
}
