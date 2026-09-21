"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { ResponsibilityCard, type ResponsibilityCardProps } from "@wonderhome/core/ui/outcome-card";
import { Pill } from "@wonderhome/core/ui/pill";
import { Sheet } from "@wonderhome/core/ui/sheet";

import { saveResponsibilityAction } from "../(auth)/configuration-actions";
import { iconForOutcome } from "../_lib/outcome-icons";
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
 *
 * Takes `outcomeKey` rather than a resolved `icon`/`tone`, and looks the
 * presentation up itself, client-side. A React icon component is a function,
 * and a Server Component cannot hand a function to a Client Component as a
 * prop value — only through JSX it renders itself. `outcomeKey` is a plain
 * string, so it survives the crossing; everywhere else that reads
 * `iconForOutcome` server-side (Family, Notifications, Activity) renders
 * `IconTile` directly, in the server component's own JSX, and never had this
 * problem — this was the one place the same icon ended up inside a prop
 * object handed to a client component instead.
 */
export function ResponsibilityRow({
  card,
  outcomeKey,
  definition,
  editable,
  householdId,
  members,
  initial,
  autoOpen,
}: {
  card: Omit<ResponsibilityCardProps, "onExpand" | "icon" | "tone">;
  outcomeKey: string;
  /** "What good looks like", from the playbook entry — not shown collapsed. */
  definition?: string;
  /** Whether this viewer may change it (household admins only). */
  editable: boolean;
  householdId: string;
  members: MemberOption[];
  initial: ResponsibilityInitial;
  /** A link elsewhere pointed straight at this one — open its detail without making the visitor find and tap it themselves. */
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen ?? false);
  const presentation = iconForOutcome(outcomeKey);

  return (
    <>
      <ResponsibilityCard {...card} icon={presentation.icon} tone={presentation.tone} onExpand={() => setOpen(true)} />

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

function ReadOnlyDetail({ card }: { card: Omit<ResponsibilityCardProps, "onExpand" | "icon" | "tone"> }) {
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
        Only an Admin can change who owns this.
      </p>
    </dl>
  );
}
