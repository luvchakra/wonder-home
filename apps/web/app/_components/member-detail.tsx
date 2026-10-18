import { completedYears, parseDateOfBirth } from "@wonderhome/core/identity/age";
import { siblingOrder } from "@wonderhome/core/identity/households";
import type { HouseholdMember } from "@wonderhome/core/identity/households";

import { hoursLabel, type DayHours } from "@wonderhome/core/household/day-hours";
import { WORK_ARRANGEMENTS } from "@wonderhome/core/identity/households";
import { requestFormatIn, requestT } from "@wonderhome/core/i18n/request";
import { PillLink } from "@wonderhome/core/ui/pill";
import { UserRoundPen } from "lucide-react";

import { formatDate } from "../_lib/session";
import { describeRoles } from "../_lib/member-role";
import { HELPER_ROLES } from "../_lib/helper-roles";
import { MemberAvatarControl } from "./member-avatar-control";
import { MemberInviteControl } from "./member-invite-control";
import { MemberProfileForm } from "./member-profile-form";
import { RemoveMemberControl } from "./remove-member-control";

/** One label/value pair, skipped entirely when there is nothing to say (design principle 9: never a placeholder for what is not known). */
function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

/**
 * Everything the household has told WonderHome about one person (story
 * 01-004's extended fields), read from an `ExpandableRow`'s open panel.
 *
 * Nothing is guessed: sibling order is arithmetic over `date_of_birth`
 * (`siblingOrder`, never a stored field that could disagree with it), and
 * every other row is either the fact the household entered or nothing at
 * all — no "Not set" filler, per design principle 9.
 */
export function MemberDetail({
  member,
  allMembers,
  timezone,
  editable,
  householdId,
  statusLabel,
  currentMemberId,
  school,
  email,
  invite,
}: {
  member: HouseholdMember;
  allMembers: readonly HouseholdMember[];
  timezone: string;
  editable: boolean;
  householdId: string;
  statusLabel?: string | null;
  currentMemberId: string;
  /** A child's current school and its day, when one is on record. */
  school?: { schoolName: string; hours: DayHours | null } | null;
  /**
   * Their sign-in email, when this viewer may read it (Admins, and the member
   * themselves — the database decides). Undefined when it was not read.
   */
  email?: string | null;
  /** Who is inviting, into which household: the Invite control's message. Set for Admins. */
  invite?: { householdName: string; inviterName: string } | null;
}) {
  const t = requestT();
  const clockTime = requestFormatIn("UTC").time;
  const dob = parseDateOfBirth(member.dateOfBirth);
  const age = dob ? t("family.fact.yearsOld", { count: completedYears(dob) }) : null;
  const born = member.dateOfBirth ? formatDate(timezone, new Date(member.dateOfBirth), "long") : null;
  const occasion =
    member.specialOccasionLabel && member.specialOccasionDate
      ? `${member.specialOccasionLabel} — ${formatDate(timezone, new Date(member.specialOccasionDate), "long")}`
      : member.specialOccasionLabel;
  const siblings = siblingOrder(member, allMembers);
  // Your own profile has one editor, in Settings (the Settings consolidation):
  // here it is read, with a way there. An Admin editing someone else is
  // managing the household's people, and that stays here.
  const isMe = member.id === currentMemberId;
  const editsHere = editable && !isMe;

  return (
    <div className="space-y-3">
      {editsHere ? (
        <MemberAvatarControl householdId={householdId} memberId={member.id} displayName={member.displayName} avatarUrl={member.avatarUrl} />
      ) : null}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        <Fact label={t("family.fact.role")} value={describeRoles(member.roles, member.isOwner)} />
        <Fact label={t("family.fact.status")} value={statusLabel ?? null} />
        <Fact label={t("family.fact.nickname")} value={member.nickname} />
        <Fact label={t("family.fact.familyCallsMe")} value={member.relationship} />
        <Fact label={t("memberInvite.factEmail")} value={email ?? null} />
        <Fact label={t("family.fact.age")} value={age} />
        <Fact label={t("family.fact.dateOfBirth")} value={born} />
        <Fact label={t("family.fact.gender")} value={member.gender} />
        <Fact label={member.memberType === "helper" ? t("setupWizard.helpers.role") : t("family.fact.occupation")} value={member.occupation} />
        <Fact label={t("family.fact.schoolOrWork")} value={member.schoolOrWorkLocation} />
        <Fact label={t("family.fact.officeHours")} value={member.memberType === "adult" && member.workHours ? hoursLabel(member.workHours, clockTime) : null} />
        <Fact label={t("family.fact.schoolHours")} value={member.memberType === "child" && school?.hours ? hoursLabel(school.hours, clockTime) : null} />
        <Fact label={t("family.fact.specialOccasion")} value={occasion} />
        <Fact label={t("family.fact.siblings")} value={siblings} />
      </dl>
      {member.notes ? (
        <div>
          <p className="text-xs font-medium tracking-wide text-[var(--wh-foreground-subtle)] uppercase">{t("family.fact.notes")}</p>
          <p className="text-sm whitespace-pre-line">{member.notes}</p>
        </div>
      ) : null}
      {isMe ? (
        <PillLink href="/settings" tone="quiet">
          <UserRoundPen aria-hidden className="size-3.5" />
          {t("family.editInSettings")}
        </PillLink>
      ) : null}
      {editsHere ? (
        <div className="flex flex-wrap items-center gap-2">
          <MemberProfileForm
            householdId={householdId}
            memberId={member.id}
            initial={{
              displayName: member.displayName,
              dateOfBirth: member.dateOfBirth,
              nickname: member.nickname,
              nicknamePreferred: member.nicknamePreferred ?? false,
              relationship: member.relationship,
              occupation: member.occupation,
              schoolOrWorkLocation: member.schoolOrWorkLocation,
              specialOccasionLabel: member.specialOccasionLabel,
              specialOccasionDate: member.specialOccasionDate,
              gender: member.gender,
              notes: member.notes,
              memberType: member.memberType,
              workArrangement: member.workArrangement ?? null,
              workHours: member.workHours ?? null,
              school: member.memberType === "child" ? (school ?? null) : null,
              ...(email !== undefined ? { email } : {}),
            }}
            workOptions={member.memberType === "adult" ? WORK_ARRANGEMENTS.map((value) => ({ value, label: t(`setupWizard.work.${value}`) })) : undefined}
            helperRoles={
              member.memberType === "helper"
                ? {
                    legend: t("setupWizard.helpers.role"),
                    other: t("setupWizard.helpers.roleOther"),
                    placeholder: t("setupWizard.helpers.rolePlaceholder"),
                    roles: Object.fromEntries(HELPER_ROLES.map((role) => [role, t(`setupWizard.helperRole.${role}`)])),
                  }
                : undefined
            }
          />
          {/* Someone the household keeps without an account yet can be invited to sign in as themselves. */}
          {invite && member.hasAccount === false && member.status !== "inactive" ? (
            <MemberInviteControl
              householdId={householdId}
              memberId={member.id}
              email={email ?? null}
              labels={{
                button: t("memberInvite.button"),
                buttonLabel: t("memberInvite.buttonLabel", { name: member.displayName }),
                title: t("memberInvite.title", { name: member.displayName }),
                lede: t("memberInvite.lede", { name: member.displayName }),
                hint: email ? t("memberInvite.emailHint", { name: member.displayName, email }) : t("memberInvite.noEmail", { name: member.displayName }),
                create: t("memberInvite.create"),
                creating: t("memberInvite.creating"),
                ready: t("memberInvite.ready"),
                newLinkNote: t("memberInvite.newLinkNote"),
                sendEmail: t("memberInvite.sendEmail"),
                share: t("memberInvite.share"),
                copy: t("memberInvite.copy"),
                copied: t("memberInvite.copied"),
                failed: t("memberInvite.failed"),
                subject: t("memberInvite.subject", { household: invite.householdName }),
                message: t("memberInvite.message", { inviter: invite.inviterName, household: invite.householdName }),
              }}
            />
          ) : null}
          {!member.isOwner && member.id !== currentMemberId && member.status === "active" ? (
            <RemoveMemberControl householdId={householdId} memberId={member.id} displayName={member.displayName} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
