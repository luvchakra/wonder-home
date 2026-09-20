import type { PendingInvitation } from "@wonderhome/core/identity/invitations";
import { Card, CardHeader, CardTitle } from "@wonderhome/core/ui/card";

import { revokeInvitationAction } from "../(auth)/household-actions";
import { SubmitButton } from "./submit-pill";

export function PendingInvitations({ invitations }: { invitations: PendingInvitation[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending invitations</CardTitle>
      </CardHeader>

      {invitations.length === 0 ? (
        <p className="text-sm text-[var(--wh-foreground-muted)]">
          No invitations are waiting. Anyone you invite appears here until they join.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--wh-border)]">
          {invitations.map((invitation) => (
            <li key={invitation.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{invitation.displayName}</p>
                <p className="text-xs text-[var(--wh-foreground-subtle)]">
                  {invitation.email} ·{" "}
                  {invitation.status === "expired"
                    ? "expired"
                    : `expires ${new Date(invitation.expiresAt).toLocaleDateString()}`}
                </p>
              </div>
              <form action={revokeInvitationAction}>
                <input type="hidden" name="invitationId" value={invitation.id} />
                <SubmitButton variant="secondary" pendingLabel="Revoking…">
                  Revoke
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
