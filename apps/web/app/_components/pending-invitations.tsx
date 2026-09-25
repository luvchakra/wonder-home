import type { PendingInvitation } from "@wonderhome/core/identity/invitations";
import { Card, CardHeader, CardTitle } from "@wonderhome/core/ui/card";

import { revokeInvitationAction } from "../(auth)/household-actions";
import { formatDate } from "../_lib/session";
import { SubmitButton } from "./submit-pill";

/** The list's words in the viewer's language (story 22-004). `{date}` is filled in here. */
export type PendingInvitationLabels = {
  title: string;
  empty: string;
  expired: string;
  expires: string;
  revoke: string;
  revoking: string;
};

const ENGLISH: PendingInvitationLabels = {
  title: "Pending invitations",
  empty: "No invitations are waiting. Anyone you invite appears here until they join.",
  expired: "expired",
  expires: "expires {date}",
  revoke: "Revoke",
  revoking: "Revoking…",
};

export function PendingInvitations({
  invitations,
  timezone,
  labels = ENGLISH,
}: {
  invitations: PendingInvitation[];
  /** The household's time zone, so the expiry is the household's day in the reader's formats. */
  timezone?: string;
  labels?: PendingInvitationLabels;
}) {
  const expiry = (at: string) => (timezone ? formatDate(timezone, new Date(at)) : new Date(at).toLocaleDateString());

  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.title}</CardTitle>
      </CardHeader>

      {invitations.length === 0 ? (
        <p className="text-sm text-[var(--wh-foreground-muted)]">{labels.empty}</p>
      ) : (
        <ul className="divide-y divide-[var(--wh-border)]">
          {invitations.map((invitation) => (
            <li key={invitation.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{invitation.displayName}</p>
                <p className="text-xs text-[var(--wh-foreground-subtle)]">
                  {invitation.email} ·{" "}
                  {invitation.status === "expired" ? labels.expired : labels.expires.replace("{date}", () => expiry(invitation.expiresAt))}
                </p>
              </div>
              <form action={revokeInvitationAction}>
                <input type="hidden" name="invitationId" value={invitation.id} />
                <SubmitButton variant="secondary" pendingLabel={labels.revoking}>
                  {labels.revoke}
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
