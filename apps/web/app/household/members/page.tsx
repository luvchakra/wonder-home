import { isHouseholdAdmin, listMembers, type HouseholdMember } from "@wonderhome/core/identity/households";
import { listInvitations } from "@wonderhome/core/identity/invitations";
import type { HouseholdMembership } from "@wonderhome/core/identity/schemas";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Avatar } from "@wonderhome/core/ui/avatar";
import { Badge } from "@wonderhome/core/ui/pill";
import { Card, CardHeader, CardTitle } from "@wonderhome/core/ui/card";

import { describeRoles } from "../../_lib/member-role";
import { requireSession } from "../../_lib/session";

import { AddChildForm } from "../../_components/add-child-form";
import { AddHelperForm } from "../../_components/add-helper-form";
import { InviteMemberForm } from "../../_components/invite-member-form";
import { MemberRoleControl } from "../../_components/member-role-control";
import { PendingInvitations } from "../../_components/pending-invitations";
import { RemoveMemberControl } from "../../_components/remove-member-control";

export const metadata = { title: "Members & roles" };
export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const { supabase, membership, viewer, secondary } = await requireSession("/household/members");
  const admin = isHouseholdAdmin(membership);

  const members = await listMembers(
    supabase,
    membership.household.id,
    membership.household.ownerMemberId,
  );
  const familyMembers = members.filter((member) => member.memberType !== "helper");
  const helpers = members.filter((member) => member.memberType === "helper");
  const invitations = admin ? await listInvitations(supabase, membership.household.id) : [];

  return (
    <AppShell active="more" viewer={viewer} secondary={secondary} pathname="/household/members" back={{ href: "/household", label: "Back to manage household" }} title="Members & roles">
      <div className="space-y-4">
        <header className="hidden space-y-1 lg:block">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">Members &amp; roles</h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">
            Who is in {membership.household.name}, and what each person can do.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Family</CardTitle>
          </CardHeader>
          <ul className="divide-y divide-[var(--wh-border)]">
            {familyMembers.map((member) => (
              <MemberRow key={member.id} member={member} membership={membership} admin={admin} />
            ))}
          </ul>
        </Card>

        {helpers.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Household help</CardTitle>
            </CardHeader>
            <p className="px-1 pb-2 text-xs text-[var(--wh-foreground-subtle)]">
              Not family — the people who help keep the home running.
            </p>
            <ul className="divide-y divide-[var(--wh-border)]">
              {helpers.map((member) => (
                <MemberRow key={member.id} member={member} membership={membership} admin={admin} />
              ))}
            </ul>
          </Card>
        ) : null}

        {admin ? (
          <>
            <InviteMemberForm
              householdId={membership.household.id}
              canInviteAdministrator={membership.roles.includes("head")}
            />
            <PendingInvitations invitations={invitations} />
            <AddChildForm householdId={membership.household.id} />
            <AddHelperForm householdId={membership.household.id} />
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

function MemberRow({
  member,
  membership,
  admin,
}: {
  member: HouseholdMember;
  membership: HouseholdMembership;
  admin: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={member.displayName} badge={member.memberType === "child" ? "🧒" : member.memberType === "helper" ? "🤝" : undefined} />
        <div className="min-w-0">
          <p className="text-sm font-medium">{member.displayName}</p>
          <p className="text-xs text-[var(--wh-foreground-subtle)]">
            {describeRoles(member.roles, member.isOwner)}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {member.status !== "active" ? <Badge>{member.status}</Badge> : null}
        {membership.roles.includes("head") && !member.isOwner ? (
          <MemberRoleControl
            householdId={membership.household.id}
            memberId={member.id}
            isAdministrator={member.roles.includes("administrator")}
          />
        ) : null}
        {admin && !member.isOwner && member.id !== membership.memberId && member.status === "active" ? (
          <RemoveMemberControl
            householdId={membership.household.id}
            memberId={member.id}
            displayName={member.displayName}
          />
        ) : null}
      </div>
    </li>
  );
}
