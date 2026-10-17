import { ShieldCheck, ShieldOff } from "lucide-react";

import { setMemberRoleAction } from "../(auth)/household-actions";
import { SubmitPill } from "./submit-pill";

export type MemberRoleControlProps = {
  householdId: string;
  memberId: string;
  isAdministrator: boolean;
  /** "Make Admin" / "Remove Admin" in the viewer's language (story 22-004). */
  labels?: { makeAdmin: string; removeAdmin: string };
  /** Say the words beside the icon, where the control has the room (an opened member's details). */
  withLabel?: boolean;
};

/**
 * Designating Admins, shown to every Admin (every Admin is equal), for an
 * adult who is not the owner.
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
  labels = { makeAdmin: "Make Admin", removeAdmin: "Remove Admin" },
  withLabel = false,
}: MemberRoleControlProps) {
  const label = isAdministrator ? labels.removeAdmin : labels.makeAdmin;
  return (
    <form action={setMemberRoleAction}>
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="memberId" value={memberId} />
      <input type="hidden" name="role" value="administrator" />
      <input type="hidden" name="granted" value={isAdministrator ? "false" : "true"} />
      <SubmitPill aria-label={withLabel ? undefined : label} title={withLabel ? undefined : label} pendingLabel="…">
        {isAdministrator ? <ShieldOff aria-hidden className="size-3.5" /> : <ShieldCheck aria-hidden className="size-3.5" />}
        {withLabel ? label : null}
      </SubmitPill>
    </form>
  );
}
