import { Button } from "@wonderhome/core/ui/button";

import { setMemberRoleAction } from "../(auth)/household-actions";

export type MemberRoleControlProps = {
  householdId: string;
  memberId: string;
  isAdministrator: boolean;
};

/**
 * Designating administrators, shown only to the Head of Family.
 *
 * Hiding it from everyone else is presentation, not protection — the server
 * refuses the change regardless, and the RLS policy refuses it again.
 */
export function MemberRoleControl({
  householdId,
  memberId,
  isAdministrator,
}: MemberRoleControlProps) {
  return (
    <form action={setMemberRoleAction}>
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="memberId" value={memberId} />
      <input type="hidden" name="role" value="administrator" />
      <input type="hidden" name="granted" value={isAdministrator ? "false" : "true"} />
      <Button type="submit" variant="quiet">
        {isAdministrator ? "Remove admin" : "Make admin"}
      </Button>
    </form>
  );
}
