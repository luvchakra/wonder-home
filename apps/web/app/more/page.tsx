import Link from "next/link";

import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card, CardHeader, CardTitle } from "@wonderhome/core/ui/card";

export const metadata = { title: "More" };

/**
 * The way into the household modules.
 *
 * Only sections that actually exist are listed. A menu of things that are not
 * built yet teaches people that half this app's links do nothing, so modules
 * appear here as their backlogs land rather than in advance.
 */
const SECTIONS = [
  {
    href: "/household/members",
    title: "Members & roles",
    description: "Who is in the household and what each person can do.",
  },
  {
    href: "/household/home",
    title: "Home & upkeep",
    description: "Maintenance, laundry, service requests and pet care that need someone.",
  },
] as const;

export default function MorePage() {
  return (
    <AppShell active="more">
      <div className="space-y-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">More</h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">
            Household modules, admin controls and settings.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Manage household</CardTitle>
          </CardHeader>
          <ul className="divide-y divide-[var(--wh-border)]">
            {SECTIONS.map((section) => (
              <li key={section.href}>
                <Link
                  href={section.href}
                  className="-mx-1 flex flex-col gap-0.5 rounded-[var(--wh-radius-sm)] px-1 py-3 hover:bg-[var(--wh-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wh-focus)]"
                >
                  <span className="text-sm font-medium">{section.title}</span>
                  <span className="text-xs text-[var(--wh-foreground-subtle)]">
                    {section.description}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </AppShell>
  );
}
