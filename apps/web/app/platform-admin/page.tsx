import Link from "next/link";

import { platformCan } from "@wonderhome/core/platform/admin";
import { Card } from "@wonderhome/core/ui/card";

import { platformStaff } from "../_lib/platform-staff";

export const dynamic = "force-dynamic";
export const metadata = { title: "Platform admin", robots: { index: false, follow: false } };

/** The platform-admin landing page: where staff go for each part of running WonderHome. */
export default async function PlatformAdminPage() {
  const staff = await platformStaff("operations.read");
  if (!staff) return null; // the layout has already answered 404

  const sections = [
    { href: "/platform-admin/performance", title: "Performance", body: "How fast and how healthy the database and the app are, in plain words, with tips on what to fix first. Read-only, totals only." },
    ...(platformCan(staff, "careers.manage")
      ? [{ href: "/platform-admin/careers", title: "Careers connection", body: "The key that connects the public careers pages to WonderJobs." }]
      : []),
  ];

  return (
    <main className="min-h-dvh px-4 py-10 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-[length:var(--wh-text-title)] font-bold tracking-tight">Platform admin</h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">
            You are signed in as platform staff ({staff.role}). Nothing here shows a household&rsquo;s own data.
          </p>
        </header>
        <ul className="grid gap-4 sm:grid-cols-2">
          {sections.map((section) => (
            <li key={section.href}>
              <Card className="h-full space-y-2">
                <h2 className="text-base font-semibold tracking-tight">{section.title}</h2>
                <p className="text-sm text-[var(--wh-foreground-muted)]">{section.body}</p>
                <Link href={section.href} className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--wh-primary)] hover:underline">
                  Open {section.title}
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
