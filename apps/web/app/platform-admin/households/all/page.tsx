import { House } from "lucide-react";

import { adminClientFor, adminGrant } from "@wonderhome/core/db/admin-context";
import { listHouseholds } from "@wonderhome/core/platform/directory";
import { Badge } from "@wonderhome/core/ui/pill";

import { platformOwner } from "../../../_lib/platform-staff";
import { BackLink, day, DirectoryRow, Pager, pageNumber, SearchBar, when } from "../../_ui/directory";
import { PageBody, PageTitle } from "../../_ui/page-title";

export const dynamic = "force-dynamic";
export const metadata = { title: "Households · Platform admin", robots: { index: false, follow: false } };

export default async function HouseholdListPage({ searchParams }: { searchParams: Promise<{ plan?: string; q?: string; page?: string }> }) {
  const owner = await platformOwner();
  if (!owner) return null; // the layout answers 404 for non-staff; staff who are not the owner see nothing here
  const sp = await searchParams;
  const plan = /^[a-z][a-z0-9_]{1,30}$/.test(sp.plan ?? "") ? sp.plan : undefined;
  const q = (sp.q ?? "").slice(0, 80);
  const page = pageNumber(sp.page);
  const { total, rows } = await listHouseholds(adminClientFor(adminGrant.platformAdmin(owner, "list households (account level)")), owner, { plan, search: q, page });

  return (
    <PageBody>
      <BackLink />
      <PageTitle title={plan ? `Households on ${plan}` : "Households"} subtitle="Account details only: plan, size, dates and status. A household's own content is never shown here." />
      <SearchBar q={q} placeholder="Search by household name" hidden={{ plan: plan ?? "" }} />
      {rows.length === 0 ? <p className="text-sm text-[var(--wh-foreground-muted)]">No households match.</p> : null}
      <ul className="space-y-2">
        {rows.map((h) => (
          <li key={h.id}>
            <DirectoryRow
              href={`/platform-admin/households/${h.id}`}
              icon={House}
              tone="home"
              name={h.name}
              line={`${h.plan_name} · ${h.members} ${h.members === 1 ? "person" : "people"} · created ${day(h.created_at)} · last active ${when(h.last_active)}`}
              aside={<Badge tone={h.status === "active" ? "handled" : "attention"}>{h.status}</Badge>}
            />
          </li>
        ))}
      </ul>
      <Pager base="/platform-admin/households/all" params={{ plan: plan ?? "", q }} page={page} total={total} />
    </PageBody>
  );
}
