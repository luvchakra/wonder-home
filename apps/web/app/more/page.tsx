import {
  BookOpen,
  Bot,
  Bell,
  Cog,
  ListChecks,
  Plug,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react";
import type { ComponentType } from "react";

import { AppShell } from "@wonderhome/core/shell/app-shell";
import { NavRow } from "@wonderhome/core/ui/action-row";
import type { IconTone } from "@wonderhome/core/ui/icon-tile";
import { Card } from "@wonderhome/core/ui/card";
import { SectionHeader } from "@wonderhome/core/ui/section-header";

export const metadata = { title: "More" };

/**
 * Manage Household: the way into every module.
 *
 * Only sections that actually exist are listed. A menu of things that are not
 * built yet teaches people that half this app's links do nothing, so modules
 * appear here as their backlogs land rather than in advance.
 */
type Section = {
  href: string;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  tone: IconTone;
};

const SECTIONS: readonly Section[] = [
  {
    href: "/household/members",
    title: "Members & roles",
    description: "Who is who",
    icon: Users,
    tone: "primary",
  },
  {
    href: "/household/home",
    title: "Home & upkeep",
    description: "Maintenance, laundry, services and pets",
    icon: Wrench,
    tone: "home",
  },
];

/** Named here so the screen says plainly what is still coming, and from where. */
const COMING: readonly { title: string; description: string; icon: ComponentType<{ className?: string }> }[] = [
  { title: "Responsibilities", description: "Who handles what", icon: ListChecks },
  { title: "Household playbook", description: "Routines & outcomes", icon: BookOpen },
  { title: "Policies", description: "Rules and preferences", icon: ShieldCheck },
  { title: "AI autonomy", description: "What WonderHome can do", icon: Bot },
  { title: "Notifications", description: "Who gets what, when", icon: Bell },
  { title: "Integrations", description: "School, calendar, shopping", icon: Plug },
  { title: "House settings", description: "Home, devices, locations", icon: Cog },
];

export default function MorePage() {
  return (
    <AppShell active="more">
      <div className="space-y-5">
        <header className="space-y-1">
          <h1 className="text-[1.375rem] font-semibold tracking-tight">Manage household</h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">
            Household modules, admin controls and settings.
          </p>
        </header>

        <Card className="p-2">
          <ul>
            {SECTIONS.map((section) => (
              <NavRow
                key={section.href}
                href={section.href}
                icon={section.icon}
                tone={section.tone}
                title={section.title}
                meta={section.description}
              />
            ))}
          </ul>
        </Card>

        <section>
          <SectionHeader title="Still being built" />
          <Card className="p-2">
            <ul className="divide-y divide-[var(--wh-border)]">
              {COMING.map((item) => (
                <li key={item.title} className="flex items-center gap-3 px-1 py-3 opacity-60">
                  <span
                    aria-hidden
                    className="grid size-10 shrink-0 place-items-center rounded-[var(--wh-radius-sm)] bg-[var(--wh-surface-muted)] text-[var(--wh-foreground-subtle)]"
                  >
                    <item.icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.title}</span>
                    <span className="block truncate text-xs text-[var(--wh-foreground-subtle)]">
                      {item.description}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      </div>
    </AppShell>
  );
}
