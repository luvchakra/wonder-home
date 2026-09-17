import { redirect } from "next/navigation";

import { createClient } from "@wonderhome/core/db/server";
import {
  isHouseholdAdmin,
  listMembers,
  listMemberships,
} from "@wonderhome/core/identity/households";
import { listInvitations } from "@wonderhome/core/identity/invitations";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Card, CardHeader, CardTitle } from "@wonderhome/core/ui/card";

import { InviteMemberForm } from "../../_components/invite-member-form";
import { MemberRoleControl } from "../../_components/member-role-control";
import { PendingInvitations } from "../../_components/pending-invitations";

export const metadata = { title: "Members & roles" };
export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const supabase = await createClient();
  const memberships = await listMemberships(supabase);

  if (memberships.length === 0) redirect("/welcome");

  const membership = memberships[0]!;
  const admin = isHouseholdAdmin(membership);

  const members = await listMembers(
    supabase,
    membership.household.id,
    membership.household.ownerMemberId,
  );
  const invitations = admin ? await listInvitations(supabase, membership.household.id) : [];

  return (
    <AppShell active="more">
      <div className="space-y-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Members &amp; roles</h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">
            Who is in {membership.household.name}, and what each person can do.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Everyone plays a part</CardTitle>
          </CardHeader>
          <ul className="divide-y divide-[var(--wh-border)]">
            {members.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium">{member.displayName}</p>
                  <p className="text-xs text-[var(--wh-foreground-subtle)]">
                    {describeRoles(member.roles, member.isOwner)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {member.status !== "active" ? (
                    <span className="rounded-full bg-[var(--wh-surface-muted)] px-2 py-0.5 text-xs text-[var(--wh-foreground-muted)]">
                      {member.status}
                    </span>
                  ) : null}
                  {membership.roles.includes("head") && !member.isOwner ? (
                    <MemberRoleControl
                      householdId={membership.household.id}
                      memberId={member.id}
                      isAdministrator={member.roles.includes("administrator")}
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>

        {admin ? (
          <>
            <InviteMemberForm
              householdId={membership.household.id}
              canInviteAdministrator={membership.roles.includes("head")}
            />
            <PendingInvitations invitations={invitations} />
          </>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Inviting people</CardTitle>
            </CardHeader>
            <p className="text-sm text-[var(--wh-foreground-muted)]">
              The Head of Family or a Household Administrator can invite new members.
            </p>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

function describeRoles(roles: readonly string[], isOwner: boolean): string {
  if (isOwner || roles.includes("head")) return "Head of Family";
  if (roles.includes("administrator")) return "Household Administrator";
  if (roles.includes("helper")) return "Househelper";
  if (roles.includes("child")) return "Child";
  return "Adult";
}
