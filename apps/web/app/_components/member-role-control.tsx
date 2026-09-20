import { setMemberRoleAction } from "../(auth)/household-actions";
import { SubmitButton } from "./submit-pill";

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
      <SubmitButton variant="quiet" pendingLabel={isAdministrator ? "Removing…" : "Making admin…"}>
        {isAdministrator ? "Remove admin" : "Make admin"}
      </SubmitButton>
    </form>
  );
}
