import { completedYears, parseDateOfBirth } from "@wonderhome/core/identity/age";
import { siblingOrder } from "@wonderhome/core/identity/households";
import type { HouseholdMember } from "@wonderhome/core/identity/households";

import { formatDate } from "../_lib/session";
import { describeRoles } from "../_lib/member-role";
import { KeyMemberControl } from "./key-member-control";
import { MemberAvatarControl } from "./member-avatar-control";
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
  keyMemberId,
  keyMemberName,
  admin,
}: {
  member: HouseholdMember;
  allMembers: readonly HouseholdMember[];
  timezone: string;
  editable: boolean;
  householdId: string;
  statusLabel?: string | null;
  currentMemberId: string;
  /** The household's current Key Member, if one is set — every other member's `relationship` is described relative to them. */
  keyMemberId?: string | null;
  keyMemberName?: string | null;
  /** Whether the signed-in viewer may change who the Key Member is — distinct from `editable`, which also covers a member editing their own row. */
  admin?: boolean;
}) {
  const dob = parseDateOfBirth(member.dateOfBirth);
  const age = dob ? `${completedYears(dob)} years old` : null;
  const born = member.dateOfBirth ? formatDate(timezone, new Date(member.dateOfBirth), "long") : null;
  const occasion =
    member.specialOccasionLabel && member.specialOccasionDate
      ? `${member.specialOccasionLabel} — ${formatDate(timezone, new Date(member.specialOccasionDate), "long")}`
      : member.specialOccasionLabel;
  const siblings = siblingOrder(member, allMembers);
  const isKeyMember = Boolean(keyMemberId) && member.id === keyMemberId;
  const relationshipLabel = isKeyMember ? "Relationship" : keyMemberName ? `Relationship to ${keyMemberName}` : "Relationship";

  return (
    <div className="space-y-3">
      {editable ? (
        <MemberAvatarControl householdId={householdId} memberId={member.id} displayName={member.displayName} avatarUrl={member.avatarUrl} />
      ) : null}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        <Fact label="Role" value={describeRoles(member.roles, member.isOwner)} />
        <Fact label="Status" value={statusLabel ?? null} />
        <Fact label="Nickname" value={member.nickname} />
        <Fact label={relationshipLabel} value={isKeyMember ? "Key Member — everyone else is described relative to them" : member.relationship} />
        <Fact label="Age" value={age} />
        <Fact label="Date of birth" value={born} />
        <Fact label="Occupation" value={member.occupation} />
        <Fact label="School / work" value={member.schoolOrWorkLocation} />
        <Fact label="Special occasion" value={occasion} />
        <Fact label="Siblings" value={siblings} />
      </dl>
      {editable ? (
        <div className="flex flex-wrap items-center gap-2">
          <MemberProfileForm
            householdId={householdId}
            memberId={member.id}
            initial={{
              displayName: member.displayName,
              dateOfBirth: member.dateOfBirth,
              nickname: member.nickname,
              relationship: member.relationship,
              occupation: member.occupation,
              schoolOrWorkLocation: member.schoolOrWorkLocation,
              specialOccasionLabel: member.specialOccasionLabel,
              specialOccasionDate: member.specialOccasionDate,
            }}
          />
          {!member.isOwner && member.id !== currentMemberId && member.status === "active" ? (
            <RemoveMemberControl householdId={householdId} memberId={member.id} displayName={member.displayName} />
          ) : null}
          {admin && member.status === "active" ? (
            <KeyMemberControl householdId={householdId} memberId={member.id} isKeyMember={isKeyMember} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
