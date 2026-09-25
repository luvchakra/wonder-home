import {
  isHouseholdAdmin,
  listMembers,
  type HouseholdMember,
} from "@wonderhome/core/identity/households";
import { listInvitations } from "@wonderhome/core/identity/invitations";
import type { HouseholdMembership } from "@wonderhome/core/identity/schemas";
import type { Translate } from "@wonderhome/core/i18n/translate";
import { AppShell } from "@wonderhome/core/shell/app-shell";
import { Avatar } from "@wonderhome/core/ui/avatar";
import { Badge } from "@wonderhome/core/ui/pill";
import { Card, CardHeader, CardTitle } from "@wonderhome/core/ui/card";
import { ErrorState } from "@wonderhome/core/ui/states";
import { whatsappConnectedMembers } from "@wonderhome/core/whatsapp/repository";

import { describeRoles } from "../../_lib/member-role";
import { memberFormLabels, pendingInvitationLabels, type MemberFormLabels } from "../../_lib/member-form-labels";
import { requireSession } from "../../_lib/session";

import { AddChildForm } from "../../_components/add-child-form";
import { AddHelperForm } from "../../_components/add-helper-form";
import { AddPetForm } from "../../_components/add-pet-form";
import { InviteMemberForm } from "../../_components/invite-member-form";
import { MemberRoleControl } from "../../_components/member-role-control";
import { PendingInvitations } from "../../_components/pending-invitations";
import { RemoveMemberControl } from "../../_components/remove-member-control";

export const metadata = { title: "Members & roles" };
export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const { supabase, membership, viewer, secondary, locale } =
    await requireSession("/household/members");
  const { t } = locale;
  const admin = isHouseholdAdmin(membership);
  const formLabels = memberFormLabels(t);

  let members: HouseholdMember[] = [];
  let invitations: Awaited<ReturnType<typeof listInvitations>> = [];
  let loadFailed = false;
  // Who has linked WhatsApp — ids only, never a number (story 14-016). A
  // failed read shows nobody as connected rather than failing the page.
  const whatsapp = await whatsappConnectedMembers(supabase, membership.household.id).catch(() => new Set<string>());
  try {
    members = await listMembers(
      supabase,
      membership.household.id,
      membership.household.ownerMemberId,
    );
    invitations = admin
      ? await listInvitations(supabase, membership.household.id)
      : [];
  } catch {
    loadFailed = true;
  }
  const familyMembers = members.filter(
    (member) => member.memberType !== "helper",
  );
  const helpers = members.filter((member) => member.memberType === "helper");

  return (
    <AppShell
      active="more"
      viewer={viewer}
      secondary={secondary}
      pathname="/household/members"
      back={{ href: "/household", label: t("manage.backToManage") }}
      title={t("manage.section.members")}
    >
      <div className="space-y-4">
        <header className="hidden space-y-1 lg:block">
          <h1 className="text-[1.625rem] font-bold tracking-tight sm:text-3xl">
            {t("manage.section.members")}
          </h1>
          <p className="text-sm text-[var(--wh-foreground-muted)]">
            {t("manage.members.lede", { household: membership.household.name })}
          </p>
        </header>

        {loadFailed ? (
          <ErrorState
            title={t("manage.members.loadFailed")}
            description={t("manage.members.loadFailedLede")}
            retryHref="/household/members"
          />
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{t("manage.members.family")}</CardTitle>
              </CardHeader>
              <ul className="divide-y divide-[var(--wh-border)]">
                {familyMembers.map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    membership={membership}
                    admin={admin}
                    whatsapp={whatsapp.has(member.id)}
                    t={t}
                    labels={formLabels}
                  />
                ))}
              </ul>
            </Card>

            {helpers.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>{t("family.help")}</CardTitle>
                </CardHeader>
                <p className="px-1 pb-2 text-xs text-[var(--wh-foreground-subtle)]">
                  {t("manage.members.helpLede")}
                </p>
                <ul className="divide-y divide-[var(--wh-border)]">
                  {helpers.map((member) => (
                    <MemberRow
                      key={member.id}
                      member={member}
                      membership={membership}
                      admin={admin}
                      whatsapp={whatsapp.has(member.id)}
                      t={t}
                      labels={formLabels}
                    />
                  ))}
                </ul>
              </Card>
            ) : null}

            {admin ? (
              <>
                <InviteMemberForm
                  householdId={membership.household.id}
                  canInviteAdministrator={membership.roles.includes("head")}
                  labels={formLabels}
                />
                <PendingInvitations invitations={invitations} timezone={membership.household.timezone} labels={pendingInvitationLabels(t)} />
                <AddChildForm householdId={membership.household.id} labels={formLabels} />
                <AddHelperForm householdId={membership.household.id} labels={formLabels} />
                <AddPetForm householdId={membership.household.id} labels={formLabels} />
              </>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>{t("manage.members.inviting")}</CardTitle>
                </CardHeader>
                <p className="text-sm text-[var(--wh-foreground-muted)]">
                  {t("manage.members.invitingLede")}
                </p>
              </Card>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function MemberRow({
  member,
  membership,
  admin,
  whatsapp,
  t,
  labels,
}: {
  member: HouseholdMember;
  membership: HouseholdMembership;
  admin: boolean;
  whatsapp: boolean;
  t: Translate;
  labels: MemberFormLabels;
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar
          name={member.displayName}
          imageUrl={member.avatarUrl}
          badge={
            member.memberType === "child"
              ? "🧒"
              : member.memberType === "helper"
                ? "🤝"
                : undefined
          }
        />
        <div className="min-w-0">
          <p className="text-sm font-medium">{member.displayName}</p>
          <p className="text-xs text-[var(--wh-foreground-subtle)]">
            {describeRoles(member.roles, member.isOwner)}
          </p>
          {whatsapp ? (
            <p className="mt-1">
              <Badge tone="handled">{t("manage.members.whatsapp")}</Badge>
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {member.status !== "active" ? <Badge>{member.status === "invited" ? t("family.status.invited") : t("family.status.inactive")}</Badge> : null}
        {membership.roles.includes("head") && !member.isOwner ? (
          <MemberRoleControl
            householdId={membership.household.id}
            memberId={member.id}
            isAdministrator={member.roles.includes("administrator")}
            labels={{ makeAdmin: t("manage.members.makeAdmin"), removeAdmin: t("manage.members.removeAdmin") }}
          />
        ) : null}
        {admin &&
        !member.isOwner &&
        member.id !== membership.memberId &&
        member.status === "active" ? (
          <RemoveMemberControl
            householdId={membership.household.id}
            memberId={member.id}
            displayName={member.displayName}
            labels={labels}
          />
        ) : null}
      </div>
    </li>
  );
}
