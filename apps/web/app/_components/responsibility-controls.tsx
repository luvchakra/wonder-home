"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { ResponsibilityCard, type ResponsibilityCardProps } from "@wonderhome/core/ui/outcome-card";
import { Pill } from "@wonderhome/core/ui/pill";
import { Sheet } from "@wonderhome/core/ui/sheet";

import { saveResponsibilityAction } from "../(auth)/configuration-actions";
import { ResponsibilityForm, type MemberOption, type ResponsibilityInitial } from "./config-forms";

/** "Add responsibility" as a sheet, so the list stays where it was (rule 6). */
export function AddResponsibilityButton({
  householdId,
  members,
  outcomes,
}: {
  householdId: string;
  members: MemberOption[];
  outcomes: { key: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pill type="button" onClick={() => setOpen(true)} tone="primary">
        <Plus aria-hidden className="size-3.5" /> Add responsibility
      </Pill>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Add a responsibility"
        description="Every outcome gets an owner, a backup and how much WonderHome may do on its own."
      >
        <ResponsibilityForm action={saveResponsibilityAction} householdId={householdId} members={members} outcomes={outcomes} />
      </Sheet>
    </>
  );
}

/**
 * A responsibility row that opens on tap — what "expand" means here, since
 * there is nothing behind it but what the sheet already shows: what good
 * looks like, and the same owner/backup/autonomy fields the row summarises.
 */
export function ResponsibilityRow({
  card,
  definition,
  editable,
  householdId,
  members,
  initial,
}: {
  card: Omit<ResponsibilityCardProps, "onExpand">;
  /** "What good looks like", from the playbook entry — not shown collapsed. */
  definition?: string;
  /** Whether this viewer may change it (household admins only). */
  editable: boolean;
  householdId: string;
  members: MemberOption[];
  initial: ResponsibilityInitial;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <ResponsibilityCard {...card} onExpand={() => setOpen(true)} />

      <Sheet open={open} onOpenChange={setOpen} title={initial.outcomeLabel} description={definition}>
        {editable ? (
          <ResponsibilityForm action={saveResponsibilityAction} householdId={householdId} members={members} initial={initial} />
        ) : (
          <ReadOnlyDetail card={card} />
        )}
      </Sheet>
    </>
  );
}

function ReadOnlyDetail({ card }: { card: Omit<ResponsibilityCardProps, "onExpand"> }) {
  return (
    <dl className="space-y-3 text-sm">
      <div>
        <dt className="text-xs font-medium tracking-wide text-[var(--wh-foreground-subtle)] uppercase">Owner</dt>
        <dd>{card.owner}</dd>
      </div>
      {card.backup ? (
        <div>
          <dt className="text-xs font-medium tracking-wide text-[var(--wh-foreground-subtle)] uppercase">Backup</dt>
          <dd>{card.backup}</dd>
        </div>
      ) : null}
      {card.frequency ? (
        <div>
          <dt className="text-xs font-medium tracking-wide text-[var(--wh-foreground-subtle)] uppercase">Frequency</dt>
          <dd>{card.frequency}</dd>
        </div>
      ) : null}
      <p className="text-xs text-[var(--wh-foreground-subtle)]">
        Only the Head of Family and household administrators can change who owns this.
      </p>
    </dl>
  );
}
