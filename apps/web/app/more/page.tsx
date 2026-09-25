import { ChevronRight, LifeBuoy, LogOut } from "lucide-react";

import Link from "next/link";

import { AppShell } from "@wonderhome/core/shell/app-shell";
import { groupSecondaryNavigation } from "@wonderhome/core/navigation/secondary-navigation";
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
 * unbuilt things teaches people that links do nothing. Grouped the same way
 * the nav drawer groups it (`groupSecondaryNavigation`) so the two can never
 * drift apart on which item lives in which section.
 */
export default async function MorePage() {
  const { viewer, secondary, locale } = await requireSession("/more");
  const { t } = locale;

  const sections = groupSecondaryNavigation(secondary, viewer.labels?.groups);
  const domainSections = sections.filter((section) => section.group !== "manage");
  const manageSection = sections.find((section) => section.group === "manage");

  return (
    <AppShell active="more" viewer={viewer} secondary={secondary} pathname="/more">
      <div className="space-y-6">
        <Link
          href="/settings"
          className="wh-rise wh-lift flex items-center gap-3 rounded-[var(--wh-radius)] border border-[var(--wh-border)] bg-[var(--wh-surface)] p-4 shadow-[var(--wh-shadow-card)]"
        >
          <Avatar name={viewer.displayName} size="lg" />
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold">{viewer.displayName}</span>
            <span className="block text-xs text-[var(--wh-foreground-muted)]">
              {viewer.roleLabel} · {viewer.householdName}
            </span>
          </span>
          <ChevronRight aria-hidden className="size-5 text-[var(--wh-foreground-subtle)]" />
        </Link>

        {domainSections.map((section) => (
          <section key={section.group}>
            <SectionHeader title={section.label} />
            <DomainGrid>
              {section.items.map((item) => (
                <DomainCard key={item.key} href={item.href} icon={DOMAIN_ICONS[item.icon]} tone={item.tone} title={item.label} description={item.purpose} />
              ))}
            </DomainGrid>
          </section>
        ))}

        {manageSection ? (
          <section>
            <SectionHeader title={manageSection.label} />
            <Card className="p-2">
              <ul className="divide-y divide-[var(--wh-border)]">
                {manageSection.items.map((item) => {
                  const Icon = DOMAIN_ICONS[item.icon];
                  return (
                    <li key={item.key}>
                      <Link href={item.href} className="flex min-h-14 items-center gap-3 rounded-[var(--wh-radius-sm)] px-2 py-2 transition-colors hover:bg-[var(--wh-surface-muted)]">
                        <span className="grid size-10 place-items-center rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] text-[var(--wh-foreground-muted)]">
                          <Icon className="size-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{item.label}</span>
                          <span className="block text-xs text-[var(--wh-foreground-subtle)]">{item.purpose}</span>
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

        <section>
          <SectionHeader title={t("more.help")} />
          <Card className="p-2">
            <Link
              href="/help"
              className="flex min-h-14 items-center gap-3 rounded-[var(--wh-radius-sm)] px-2 py-2 transition-colors hover:bg-[var(--wh-surface-muted)]"
            >
              <span className="grid size-10 place-items-center rounded-[var(--wh-radius-sm)] bg-[var(--wh-primary-soft)] text-[var(--wh-primary)]">
                <LifeBuoy className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{t("more.getHelp")}</span>
                <span className="block text-xs text-[var(--wh-foreground-subtle)]">
                  {t("more.getHelpHint")}
                </span>
              </span>
              <ChevronRight aria-hidden className="size-4 text-[var(--wh-foreground-subtle)]" />
            </Link>
          </Card>
        </section>

        <form action={signOut}>
          <Button type="submit" variant="secondary" className="w-full gap-2">
            <LogOut aria-hidden className="size-4" /> {t("more.signOut")}
          </Button>
        </form>

        <QuoteCard>{t("more.quote")}</QuoteCard>
      </div>
    </AppShell>
  );
}
