import { ShieldCheck } from "lucide-react";

import { adminClientFor, adminGrant } from "@wonderhome/core/db/admin-context";
import { listGrants } from "@wonderhome/core/platform/directory";

import { platformOwner } from "../../../_lib/platform-staff";
import { BackLink, DirectoryRow, when } from "../../_ui/directory";
import { PageBody, PageTitle } from "../../_ui/page-title";

export const dynamic = "force-dynamic";
export const metadata = { title: "Support grants · Platform admin", robots: { index: false, follow: false } };

export default async function GrantListPage() {
  const owner = await platformOwner();
  if (!owner) return null;
  const rows = await listGrants(adminClientFor(adminGrant.platformAdmin(owner, "list open support grants")), owner);
  return (
    <PageBody>
      <BackLink />
      <PageTitle title="Open support grants" subtitle="Time-boxed access a household has been given to staff: which household, who holds it, what it allows and when it ends." />
      {rows.length === 0 ? <p className="text-sm text-[var(--wh-foreground-muted)]">No support grant is open right now.</p> : null}
      <ul className="space-y-2">
        {rows.map((g) => (
          <li key={g.id}>
            <DirectoryRow
              href={`/platform-admin/households/${g.household_id}`}
              icon={ShieldCheck}
              tone="health"
              name={g.household_name}
              line={`Granted to ${g.granted_by} · ${g.scope} access · ends ${when(g.expires_at)}`}
            />
          </li>
        ))}
      </ul>
    </PageBody>
  );
}
