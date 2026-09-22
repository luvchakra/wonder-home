import { Star, StarOff } from "lucide-react";

import { setKeyMemberAction } from "../(auth)/household-actions";
import { SubmitPill } from "./submit-pill";

/**
 * Naming who the household's relationships are described relative to
 * ("Father", "Mother", "Younger brother" all answer "who is this, to the
 * Key Member?"). Admin-only, same shape as `MemberRoleControl` — an icon
 * rather than a full-width label, so the row keeps its width for the
 * person's own name (design principle 11).
 */
export function KeyMemberControl({
  householdId,
  memberId,
  isKeyMember,
}: {
  householdId: string;
  memberId: string;
  isKeyMember: boolean;
}) {
  const label = isKeyMember ? "Remove as Key Member" : "Make Key Member";
  return (
    <form action={setKeyMemberAction}>
      <input type="hidden" name="householdId" value={householdId} />
      <input type="hidden" name="memberId" value={isKeyMember ? "" : memberId} />
      <SubmitPill aria-label={label} title={label} pendingLabel="…">
        {isKeyMember ? <StarOff aria-hidden className="size-3.5" /> : <Star aria-hidden className="size-3.5" />}
      </SubmitPill>
    </form>
  );
}
