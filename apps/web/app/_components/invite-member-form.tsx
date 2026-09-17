"use client";

import { useActionState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Card, CardHeader, CardTitle } from "@wonderhome/core/ui/card";
import { Field } from "@wonderhome/core/ui/field";

import { inviteMemberAction, type InviteState } from "../(auth)/household-actions";

export type InviteMemberFormProps = {
  householdId: string;
  canInviteAdministrator: boolean;
};

export function InviteMemberForm({ householdId, canInviteAdministrator }: InviteMemberFormProps) {
  const [state, formAction, pending] = useActionState<InviteState, FormData>(
    inviteMemberAction,
    {},
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite someone</CardTitle>
      </CardHeader>

      <form action={formAction} className="space-y-4">
        {state.error ? <Alert>{state.error}</Alert> : null}

        {state.inviteUrl ? (
          <Alert tone="info">
            <span className="block font-medium">Invitation ready.</span>
            Send them this link — it is shown once and expires in 7 days:{" "}
            <code className="break-all">{state.inviteUrl}</code>
          </Alert>
        ) : null}

        <input type="hidden" name="householdId" value={householdId} />
        <Field label="Their name" name="displayName" required autoComplete="off" />
        <Field label="Their email" name="email" type="email" required autoComplete="off" />

        <div className="space-y-1.5">
          <label htmlFor="role" className="block text-sm font-medium">
            Role
          </label>
          <select
            id="role"
            name="role"
            defaultValue="adult"
            className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
          >
            <option value="adult">Adult</option>
            <option value="helper">Househelper</option>
            {canInviteAdministrator ? <option value="administrator">Administrator</option> : null}
          </select>
          {canInviteAdministrator ? null : (
            <p className="text-xs text-[var(--wh-foreground-subtle)]">
              Only the Head of Family can invite an administrator.
            </p>
          )}
        </div>

        <Button type="submit" disabled={pending}>
          {pending ? "Creating invitation…" : "Create invitation"}
        </Button>
      </form>
    </Card>
  );
}
