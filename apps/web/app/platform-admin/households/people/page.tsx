import { User } from "lucide-react";

import { adminClientFor, adminGrant } from "@wonderhome/core/db/admin-context";
import { listPeople } from "@wonderhome/core/platform/directory";
import { Badge } from "@wonderhome/core/ui/pill";

import { platformOwner } from "../../../_lib/platform-staff";
import { BackLink, DirectoryRow, Pager, pageNumber, SearchBar, when } from "../../_ui/directory";
import { PageBody, PageTitle } from "../../_ui/page-title";

export const dynamic = "force-dynamic";
export const metadata = { title: "People · Platform admin", robots: { index: false, follow: false } };

const KIND = { adult: "Adult", child: "Child", helper: "Helper" } as const;

export default async function PeopleListPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const owner = await platformOwner();
  if (!owner) return null;
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 80);
  const page = pageNumber(sp.page);
  const { total, rows } = await listPeople(adminClientFor(adminGrant.platformAdmin(owner, "list people (account level)")), owner, { search: q, page });

  return (
    <PageBody>
      <BackLink />
      <PageTitle title="People" subtitle="Who has an account, in which household, and when they last signed in. Nothing they have written or recorded is shown here." />
      <SearchBar q={q} placeholder="Search by name or email" />
      {rows.length === 0 ? <p className="text-sm text-[var(--wh-foreground-muted)]">No people match.</p> : null}
      <ul className="space-y-2">
        {rows.map((p) => (
          <li key={p.id}>
            <DirectoryRow
              href={`/platform-admin/households/${p.household_id}`}
              icon={User}
              tone="people"
              name={p.name}
              line={`${KIND[p.type]}${p.admin ? " · Admin" : ""} · ${p.household_name} · ${p.email ?? "no email"} · ${p.has_signed_in ? `signed in ${when(p.last_sign_in)}` : "never signed in"}`}
              aside={<Badge tone={p.has_signed_in ? "handled" : "neutral"}>{p.has_signed_in ? "Has signed in" : "No sign-in"}</Badge>}
            />
          </li>
        ))}
      </ul>
      <Pager base="/platform-admin/households/people" params={{ q }} page={page} total={total} />
    </PageBody>
  );
}
