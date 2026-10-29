import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { platformCan } from "@wonderhome/core/platform/admin";

import { platformStaff } from "../_lib/platform-staff";
import { platformMenuFor } from "./menu";
import { PlatformMenuShell } from "./menu-shell";

export const dynamic = "force-dynamic";

/**
 * The frame of every platform-admin page: staff only, with the sections as a
 * sidebar menu (a drawer on a phone). Anyone else sees a 404, as with every platform boundary; each
 * page still checks the capability it needs.
 */
export default async function PlatformAdminLayout({ children }: { children: ReactNode }) {
  const staff = await platformStaff("operations.read");
  if (!staff) notFound();

  return (
    <PlatformMenuShell items={platformMenuFor((capability) => platformCan(staff, capability))} role={staff.role}>
      {children}
    </PlatformMenuShell>
  );
}
