import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { platformCan } from "@wonderhome/core/platform/admin";

import { platformStaff } from "../_lib/platform-staff";

export const dynamic = "force-dynamic";

/**
 * The frame of every platform-admin page: staff only, with the sections as a
 * row of links. Anyone else sees a 404, as with every platform boundary; each
 * page still checks the capability it needs.
 */
export default async function PlatformAdminLayout({ children }: { children: ReactNode }) {
  const staff = await platformStaff("operations.read");
  if (!staff) notFound();

  const sections = [
    { href: "/platform-admin", label: "Overview" },
    { href: "/platform-admin/performance", label: "Performance" },
    ...(platformCan(staff, "careers.manage") ? [{ href: "/platform-admin/careers", label: "Careers" }] : []),
  ];

  return (
    <>
      <nav aria-label="Platform admin sections" className="border-b border-[var(--wh-border)] bg-[var(--wh-surface)] px-4 lg:px-8">
        <ul className="mx-auto flex max-w-4xl flex-wrap gap-x-2">
          {sections.map((section) => (
            <li key={section.href}>
              <Link href={section.href} className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-[var(--wh-primary)] hover:underline">
                {section.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {children}
    </>
  );
}
