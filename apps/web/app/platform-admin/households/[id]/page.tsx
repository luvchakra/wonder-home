import { House, User } from "lucide-react";
import { notFound } from "next/navigation";

import { adminClientFor, adminGrant } from "@wonderhome/core/db/admin-context";
import { householdDetail } from "@wonderhome/core/platform/directory";
import { Badge } from "@wonderhome/core/ui/pill";

import { platformOwner } from "../../../_lib/platform-staff";
import { BackLink, day, DirectoryRow, when } from "../../_ui/directory";
import { PageBody, PageTitle, Panel } from "../../_ui/page-title";

export const dynamic = "force-dynamic";
export const metadata = { title: "Household · Platform admin", robots: { index: false, follow: false } };

const KIND = { adult: "Adult", child: "Child", helper: "Helper" } as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function HouseholdDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const owner = await platformOwner();
  if (!owner) return null;
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const h = await householdDetail(adminClientFor(adminGrant.platformAdmin(owner, "view one household's account details")), owner, id);
  if (!h) notFound();
  return (
    <PageBody>
      <BackLink href="/platform-admin/households/all" label="Households" />
      <PageTitle title={h.name} subtitle="Account details only. Bills, health, chats, events, addresses and everything else the family keeps are not shown." actions={<Badge tone={h.status === "active" ? "handled" : "attention"}>{h.status}</Badge>} />
      <Panel title="Account">
        <DirectoryRow icon={House} tone="home" name={h.planName} line={`Created ${day(h.createdAt)} · last active ${when(h.lastActive)}`} />
      </Panel>
      <Panel title={`People (${h.people.length})`}>
        <ul className="space-y-2">
          {h.people.map((p, i) => (
            <li key={i}>
              <DirectoryRow icon={User} tone="people" name={p.name} line={`${KIND[p.type]}${p.admin ? " · Admin" : ""} · ${p.signedIn ? "has signed in" : "no sign-in"}`} />
            </li>
          ))}
        </ul>
      </Panel>
    </PageBody>
  );
}
