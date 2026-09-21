import { ShieldCheck, ShieldOff } from "lucide-react";

import { setMemberRoleAction } from "../(auth)/household-actions";
import { SubmitPill } from "./submit-pill";

export type MemberRoleControlProps = {
  householdId: string;
  memberId: string;
  isAdministrator: boolean;
};

/**
 * Designating Admins, shown only to the household's owner.
 *
 * Hiding it from everyone else is presentation, not protection — the server
 * refuses the change regardless, and the RLS policy refuses it again. An
 * icon rather than "Make admin"/"Remove admin" as a full-width label, so the
 * row keeps its width for the person's own name (design principle 11).
 */
export function MemberRoleControl({
  householdId,
  memberId,
  isAdministrator,
}: MemberRoleControlProps) {
  const label = isAdministrator ? "Remove Admin" : "Make Admin";
  return (
    <form action={setMemberRoleAction}>
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="memberId" value={memberId} />
      <input type="hidden" name="role" value="administrator" />
      <input type="hidden" name="granted" value={isAdministrator ? "false" : "true"} />
      <SubmitPill aria-label={label} title={label} pendingLabel="…">
        {isAdministrator ? <ShieldOff aria-hidden className="size-3.5" /> : <ShieldCheck aria-hidden className="size-3.5" />}
      </SubmitPill>
    </form>
  );
}
