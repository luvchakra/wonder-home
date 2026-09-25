"use client";

import { useActionState } from "react";

import { Alert } from "@wonderhome/core/ui/alert";
import { Button } from "@wonderhome/core/ui/button";
import { Card, CardHeader, CardTitle } from "@wonderhome/core/ui/card";
import { Field } from "@wonderhome/core/ui/field";

import { inviteMemberAction, type InviteState } from "../(auth)/household-actions";
import type { MemberFormLabels } from "../_lib/member-form-labels";

export type InviteMemberFormProps = {
  householdId: string;
  canInviteAdministrator: boolean;
  labels: MemberFormLabels;
};

export function InviteMemberForm({ householdId, canInviteAdministrator, labels }: InviteMemberFormProps) {
  const [state, formAction, pending] = useActionState<InviteState, FormData>(
    inviteMemberAction,
    {},
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.inviteTitle}</CardTitle>
      </CardHeader>

      <form action={formAction} className="space-y-4">
        {state.error ? <Alert>{state.error}</Alert> : null}

        {state.inviteUrl ? (
          <Alert tone="info">
            <span className="block font-medium">{labels.inviteReady}</span>
            {labels.inviteLink}{" "}
            <code className="break-all">{state.inviteUrl}</code>
          </Alert>
        ) : null}

        <input type="hidden" name="householdId" value={householdId} />
        <Field label={labels.theirName} name="displayName" required autoComplete="off" />
        <Field label={labels.theirEmail} name="email" type="email" required autoComplete="off" />

        <div className="space-y-1.5">
          <label htmlFor="role" className="block text-sm font-medium">
            {labels.role}
          </label>
          <select
            id="role"
            name="role"
            defaultValue="adult"
            className="block min-h-11 w-full rounded-[var(--wh-radius-sm)] border border-[var(--wh-border)] bg-[var(--wh-surface)] px-3 text-base"
          >
            <option value="adult">{labels.roleAdult}</option>
            <option value="helper">{labels.roleHelper}</option>
            {canInviteAdministrator ? <option value="administrator">{labels.roleAdmin}</option> : null}
          </select>
          {canInviteAdministrator ? null : (
            <p className="text-xs text-[var(--wh-foreground-subtle)]">{labels.ownerOnly}</p>
          )}
        </div>

        <Button type="submit" disabled={pending}>
          {pending ? labels.creatingInvite : labels.createInvite}
        </Button>
      </form>
    </Card>
  );
}
